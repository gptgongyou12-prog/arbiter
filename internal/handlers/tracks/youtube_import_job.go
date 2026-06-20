package tracks

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"bungleware/vault/internal/apperr"
	sqlc "bungleware/vault/internal/db/sqlc"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/ids"
	"bungleware/vault/internal/storage"
	"bungleware/vault/internal/transcoding"
)

// ─── Single-track async import job store ──────────────────────────────────────

type mediaImportJobStatus string

const (
	mediaJobPending mediaImportJobStatus = "pending"
	mediaJobRunning mediaImportJobStatus = "running"
	mediaJobDone    mediaImportJobStatus = "done"
	mediaJobFailed  mediaImportJobStatus = "failed"
)

type mediaImportJob struct {
	mu       sync.RWMutex
	Status   mediaImportJobStatus `json:"status"`
	Message  string               `json:"message"`
	Progress string               `json:"progress"` // e.g. "45%"
	TrackID  string               `json:"track_id"`
}

func (j *mediaImportJob) set(status mediaImportJobStatus, msg, progress string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = status
	j.Message = msg
	if progress != "" {
		j.Progress = progress
	}
}

func (j *mediaImportJob) snapshot() map[string]interface{} {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return map[string]interface{}{
		"status":   j.Status,
		"message":  j.Message,
		"progress": j.Progress,
		"track_id": j.TrackID,
	}
}

var mediaImportJobs sync.Map // jobID → *mediaImportJob

var ytdlpPercentRe = regexp.MustCompile(`(\d{1,3}(?:\.\d+)?)%`)

// ─── Start import (background) ─────────────────────────────────────────────

func (h *TracksHandler) StartMediaImport(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	req, err := httputil.DecodeJSON[MediaImportRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}
	if req.URL == "" {
		return apperr.NewBadRequest("url is required")
	}
	if req.ProjectID == "" {
		return apperr.NewBadRequest("project_id is required")
	}

	project, err := resolveProject(r.Context(), h, req.ProjectID, int64(userID))
	if err != nil {
		return err
	}

	jobID, err := ids.NewPublicID()
	if err != nil {
		return apperr.NewInternal("failed to generate job id", err)
	}

	job := &mediaImportJob{Status: mediaJobPending, Message: "작업 대기 중..."}
	mediaImportJobs.Store(jobID, job)

	go h.runMediaImportJob(context.Background(), job, project, int64(userID), req.URL, req.Title)

	return httputil.OKResult(w, map[string]string{"job_id": jobID})
}

func (h *TracksHandler) GetMediaImportStatus(w http.ResponseWriter, r *http.Request) error {
	jobID := r.PathValue("jobId")
	if jobID == "" {
		return apperr.NewBadRequest("job_id is required")
	}
	v, ok := mediaImportJobs.Load(jobID)
	if !ok {
		return apperr.NewNotFound("job not found")
	}
	job := v.(*mediaImportJob)
	return httputil.OKResult(w, job.snapshot())
}

// ─── Background worker ───────────────────────────────────────────────────────

func (h *TracksHandler) runMediaImportJob(ctx context.Context, job *mediaImportJob, project sqlc.Project, userID int64, url, titleOverride string) {
	tmpDir, err := os.MkdirTemp("", "vault-media-*")
	if err != nil {
		job.set(mediaJobFailed, "임시 디렉터리 생성 실패", "")
		return
	}
	defer os.RemoveAll(tmpDir)

	ytdlp := findYtDlp()
	source := detectSource(url)

	job.set(mediaJobRunning, "정보 가져오는 중...", "0%")

	metaCmd := exec.CommandContext(ctx, ytdlp, url, "--dump-json", "--no-playlist", "--quiet")
	metaOut, err := metaCmd.Output()
	if err != nil {
		job.set(mediaJobFailed, "미디어 정보 조회 실패", "")
		return
	}
	meta, err := parseFirstJSON(metaOut)
	if err != nil {
		job.set(mediaJobFailed, "메타데이터 파싱 실패", "")
		return
	}

	mediaTitle, _ := meta["title"].(string)
	uploader, _ := meta["uploader"].(string)
	if uploader == "" {
		uploader, _ = meta["channel"].(string)
	}
	if uploader == "" {
		uploader, _ = meta["artist"].(string)
	}

	title := titleOverride
	if title == "" {
		title = mediaTitle
	}
	if title == "" {
		title = "Import"
	}

	job.set(mediaJobRunning, "다운로드 중...", "0%")

	outTemplate := filepath.Join(tmpDir, "%(title)s.%(ext)s")
	dlArgs := []string{
		url,
		"--extract-audio",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--no-playlist",
		"--output", outTemplate,
		"--newline",
		"--no-warnings",
		"--quiet",
	}
	dlCmd := exec.CommandContext(ctx, ytdlp, dlArgs...)
	stdout, err := dlCmd.StdoutPipe()
	if err != nil {
		job.set(mediaJobFailed, "다운로드 시작 실패", "")
		return
	}
	var stderrBuf strings.Builder
	dlCmd.Stderr = &stderrBuf
	if err := dlCmd.Start(); err != nil {
		job.set(mediaJobFailed, "다운로드 시작 실패", "")
		return
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 4096), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if m := ytdlpPercentRe.FindStringSubmatch(line); m != nil {
			job.set(mediaJobRunning, "다운로드 중...", m[1]+"%")
		}
	}
	if err := dlCmd.Wait(); err != nil {
		slog.Error("yt-dlp download failed", "url", url, "stderr", stderrBuf.String(), "error", err)
		job.set(mediaJobFailed, "다운로드 실패: "+stderrBuf.String(), "")
		return
	}

	job.set(mediaJobRunning, "등록 중...", "100%")

	entries, err := os.ReadDir(tmpDir)
	if err != nil || len(entries) == 0 {
		job.set(mediaJobFailed, "다운로드된 파일을 찾을 수 없음", "")
		return
	}
	var mp3Path string
	for _, e := range entries {
		if strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			mp3Path = filepath.Join(tmpDir, e.Name())
			break
		}
	}
	if mp3Path == "" {
		mp3Path = filepath.Join(tmpDir, entries[0].Name())
	}

	f, err := os.Open(mp3Path)
	if err != nil {
		job.set(mediaJobFailed, "파일 열기 실패", "")
		return
	}
	defer f.Close()
	fi, _ := f.Stat()
	originalFilename := filepath.Base(mp3Path)

	publicID, err := ids.NewPublicID()
	if err != nil {
		job.set(mediaJobFailed, "ID 생성 실패", "")
		return
	}

	maxOrderResult, _ := h.db.Queries.GetMaxTrackOrderByProject(ctx, project.ID)
	maxOrder, ok := maxOrderResult.(int64)
	if !ok {
		maxOrder = -1
	}

	artist := sql.NullString{}
	if uploader != "" {
		artist = sql.NullString{String: uploader, Valid: true}
	}

	track, err := h.db.CreateTrack(ctx, sqlc.CreateTrackParams{
		UserID:    userID,
		ProjectID: project.ID,
		Title:     title,
		Artist:    artist,
		Album:     sql.NullString{},
		PublicID:  publicID,
	})
	if err != nil {
		job.set(mediaJobFailed, "트랙 생성 실패", "")
		return
	}

	_ = h.db.Queries.UpdateTrackOrder(ctx, sqlc.UpdateTrackOrderParams{
		TrackOrder: maxOrder + 1,
		ID:         track.ID,
	})

	versionLabel := "YouTube"
	if source == "soundcloud" {
		versionLabel = "SoundCloud"
	}

	version, err := h.db.CreateTrackVersion(ctx, sqlc.CreateTrackVersionParams{
		TrackID:         track.ID,
		VersionName:     fmt.Sprintf("%s: %s", versionLabel, mediaTitle),
		Notes:           sql.NullString{},
		DurationSeconds: sql.NullFloat64{},
		VersionOrder:    1,
	})
	if err != nil {
		job.set(mediaJobFailed, "버전 생성 실패", "")
		return
	}

	_ = h.db.SetActiveVersion(ctx, sqlc.SetActiveVersionParams{
		ActiveVersionID: sql.NullInt64{Int64: version.ID, Valid: true},
		ID:              track.ID,
	})

	saveResult, err := h.storage.SaveTrackSource(ctx, storage.SaveTrackSourceInput{
		ProjectPublicID: project.PublicID,
		TrackID:         track.ID,
		VersionID:       version.ID,
		OriginalName:    originalFilename,
		Reader:          f,
	})
	if err != nil {
		job.set(mediaJobFailed, "파일 저장 실패", "")
		return
	}

	metadata, err := transcoding.ExtractMetadata(saveResult.Path)
	if err != nil {
		metadata = &transcoding.AudioMetadata{}
	}
	if metadata.Duration > 0 {
		_ = h.db.UpdateTrackVersionDuration(ctx, sqlc.UpdateTrackVersionDurationParams{
			DurationSeconds: sql.NullFloat64{Float64: metadata.Duration, Valid: true},
			ID:              version.ID,
		})
	}

	var bitrate sql.NullInt64
	if metadata.Bitrate > 0 {
		bitrate = sql.NullInt64{Int64: int64(metadata.Bitrate), Valid: true}
	}

	_, err = h.db.CreateTrackFile(ctx, sqlc.CreateTrackFileParams{
		VersionID:         version.ID,
		Quality:           "source",
		FilePath:          saveResult.Path,
		FileSize:          fi.Size(),
		Format:            "mp3",
		Bitrate:           bitrate,
		ContentHash:       sql.NullString{},
		TranscodingStatus: sql.NullString{String: "completed", Valid: true},
		OriginalFilename:  sql.NullString{String: originalFilename, Valid: true},
	})
	if err != nil {
		job.set(mediaJobFailed, "트랙 파일 생성 실패", "")
		return
	}

	if h.transcoder != nil {
		_ = h.transcoder.TranscodeVersion(ctx, transcoding.TranscodeVersionInput{
			VersionID:      version.ID,
			SourceFilePath: saveResult.Path,
			TrackPublicID:  track.PublicID,
			UserID:         userID,
		})
	}

	job.mu.Lock()
	job.Status = mediaJobDone
	job.Message = "완료"
	job.Progress = "100%"
	job.TrackID = track.PublicID
	job.mu.Unlock()
}
