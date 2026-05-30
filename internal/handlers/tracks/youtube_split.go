package tracks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"bungleware/vault/internal/apperr"
	sqlc "bungleware/vault/internal/db/sqlc"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/ids"
	"bungleware/vault/internal/storage"
	"bungleware/vault/internal/transcoding"
)

// ─── Job store ────────────────────────────────────────────────────────────────

type splitJobStatus string

const (
	splitJobPending   splitJobStatus = "pending"
	splitJobRunning   splitJobStatus = "running"
	splitJobDone      splitJobStatus = "done"
	splitJobFailed    splitJobStatus = "failed"
)

type splitJob struct {
	mu        sync.RWMutex
	Status    splitJobStatus `json:"status"`
	Message   string         `json:"message"`
	Progress  string         `json:"progress"`   // e.g. "3/12"
	ProjectID string         `json:"project_id"` // set when done
	Imported  int            `json:"imported"`
	Failed    int            `json:"failed"`
	CreatedAt time.Time      `json:"created_at"`
}

func (j *splitJob) set(status splitJobStatus, msg, progress string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = status
	j.Message = msg
	if progress != "" {
		j.Progress = progress
	}
}

func (j *splitJob) snapshot() map[string]interface{} {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return map[string]interface{}{
		"status":     j.Status,
		"message":    j.Message,
		"progress":   j.Progress,
		"project_id": j.ProjectID,
		"imported":   j.Imported,
		"failed":     j.Failed,
	}
}

var splitJobs sync.Map // jobID → *splitJob

// ─── Types ────────────────────────────────────────────────────────────────────

type SplitPreviewRequest struct {
	URL string `json:"url"`
}

type ChapterInfo struct {
	Index     int     `json:"index"`
	Title     string  `json:"title"`
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
	Duration  float64 `json:"duration"`
}

type SplitPreviewResponse struct {
	VideoTitle  string        `json:"video_title"`
	Uploader    string        `json:"uploader"`
	TotalSecs   float64       `json:"total_secs"`
	Chapters    []ChapterInfo `json:"chapters"`
	HasChapters bool          `json:"has_chapters"`
}

type ManualChapterInput struct {
	Title        string  `json:"title"`
	StartSeconds float64 `json:"start_seconds"`
}

type SplitImportRequest struct {
	URL            string               `json:"url"`
	ManualChapters []ManualChapterInput `json:"manual_chapters"`
}

// ─── Preview ──────────────────────────────────────────────────────────────────

func (h *TracksHandler) GetSplitPreview(w http.ResponseWriter, r *http.Request) error {
	req, err := httputil.DecodeJSON[SplitPreviewRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}
	if req.URL == "" {
		return apperr.NewBadRequest("url is required")
	}

	ytdlp := findYtDlp()
	cmd := exec.CommandContext(r.Context(), ytdlp,
		req.URL,
		"--dump-json",
		"--no-playlist",
		"--quiet",
		"--js-runtimes", "nodejs",
	)
	out, err := cmd.Output()
	if err != nil {
		// Try without JS runtime flag (older yt-dlp)
		cmd2 := exec.CommandContext(r.Context(), ytdlp,
			req.URL, "--dump-json", "--no-playlist", "--quiet",
		)
		out, err = cmd2.Output()
		if err != nil {
			return apperr.NewBadRequest("failed to fetch video info")
		}
	}

	meta, err := parseFirstJSON(out)
	if err != nil {
		return apperr.NewInternal("failed to parse metadata", err)
	}

	title, _ := meta["title"].(string)
	uploader, _ := meta["uploader"].(string)
	if uploader == "" {
		uploader, _ = meta["channel"].(string)
	}
	totalDur, _ := meta["duration"].(float64)
	chapters := extractChapters(meta, totalDur)

	return httputil.OKResult(w, SplitPreviewResponse{
		VideoTitle:  title,
		Uploader:    uploader,
		TotalSecs:   totalDur,
		Chapters:    chapters,
		HasChapters: len(chapters) > 0,
	})
}

// ─── Start import (background) ────────────────────────────────────────────────

func (h *TracksHandler) ImportSplitTracks(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	req, err := httputil.DecodeJSON[SplitImportRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}
	if req.URL == "" {
		return apperr.NewBadRequest("url is required")
	}

	jobID, err := ids.NewPublicID()
	if err != nil {
		return apperr.NewInternal("failed to generate job id", err)
	}

	job := &splitJob{
		Status:    splitJobPending,
		Message:   "작업 대기 중...",
		CreatedAt: time.Now(),
	}
	splitJobs.Store(jobID, job)

	// Run in background — detached from request context
	go h.runSplitJob(context.Background(), job, req.URL, int64(userID), req.ManualChapters)

	return httputil.OKResult(w, map[string]string{"job_id": jobID})
}

// ─── Poll status ──────────────────────────────────────────────────────────────

func (h *TracksHandler) GetSplitStatus(w http.ResponseWriter, r *http.Request) error {
	jobID := r.PathValue("jobId")
	if jobID == "" {
		return apperr.NewBadRequest("job_id is required")
	}

	v, ok := splitJobs.Load(jobID)
	if !ok {
		return apperr.NewNotFound("job not found")
	}
	job := v.(*splitJob)
	return httputil.OKResult(w, job.snapshot())
}

// ─── Background worker ────────────────────────────────────────────────────────

func (h *TracksHandler) runSplitJob(ctx context.Context, job *splitJob, url string, userID int64, manualChapters []ManualChapterInput) {
	ytdlp := findYtDlp()

	// 1. Download full audio + write info JSON
	tmpDir, err := os.MkdirTemp("", "vault-split-*")
	if err != nil {
		job.set(splitJobFailed, "임시 디렉터리 생성 실패", "")
		return
	}
	defer os.RemoveAll(tmpDir)

	job.set(splitJobRunning, "음원 다운로드 중... (시간이 걸릴 수 있습니다)", "")

	audioOut := filepath.Join(tmpDir, "audio.%(ext)s")
	dlArgs := []string{
		url,
		"--extract-audio",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--no-playlist",
		"--write-info-json",
		"-o", audioOut,
		"--no-warnings",
		"--js-runtimes", "nodejs",
	}
	dlCmd := exec.CommandContext(ctx, ytdlp, dlArgs...)
	dlOut, dlErr := dlCmd.CombinedOutput()

	// Find MP3
	var fullMP3 string
	entries, _ := os.ReadDir(tmpDir)
	for _, e := range entries {
		if strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			fullMP3 = filepath.Join(tmpDir, e.Name())
			break
		}
	}

	if dlErr != nil || fullMP3 == "" {
		slog.Error("split download failed", "out", string(dlOut), "err", dlErr)
		job.set(splitJobFailed, fmt.Sprintf("다운로드 실패: %v", dlErr), "")
		return
	}

	// 2. Parse info JSON for chapters
	var meta map[string]interface{}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".info.json") {
			data, err := os.ReadFile(filepath.Join(tmpDir, e.Name()))
			if err == nil {
				_ = json.Unmarshal(data, &meta)
			}
			break
		}
	}

	videoTitle := "YouTube Import"
	uploader := ""
	var totalDur float64
	if meta != nil {
		if t, ok := meta["title"].(string); ok && t != "" {
			videoTitle = t
		}
		if u, ok := meta["uploader"].(string); ok {
			uploader = u
		}
		if u, ok := meta["channel"].(string); ok && uploader == "" {
			uploader = u
		}
		totalDur, _ = meta["duration"].(float64)
	}
	var chapters []ChapterInfo
	if len(manualChapters) > 0 {
		for i, mc := range manualChapters {
			end := totalDur
			if i+1 < len(manualChapters) {
				end = manualChapters[i+1].StartSeconds
			}
			chapters = append(chapters, ChapterInfo{
				Index:     i + 1,
				Title:     mc.Title,
				StartTime: mc.StartSeconds,
				EndTime:   end,
				Duration:  end - mc.StartSeconds,
			})
		}
	} else {
		chapters = extractChapters(meta, totalDur)
	}

	// 3. Create project
	job.set(splitJobRunning, "프로젝트 생성 중...", "")

	projectPublicID, err := ids.NewPublicID()
	if err != nil {
		job.set(splitJobFailed, "프로젝트 ID 생성 실패", "")
		return
	}
	project, err := h.db.Queries.CreateProject(ctx, sqlc.CreateProjectParams{
		UserID:          userID,
		Name:            videoTitle,
		PublicID:        projectPublicID,
		Description:     sql.NullString{},
		QualityOverride: sql.NullString{},
		AuthorOverride:  sql.NullString{String: uploader, Valid: uploader != ""},
		FolderID:        sql.NullInt64{},
	})
	if err != nil {
		job.set(splitJobFailed, "프로젝트 생성 실패: "+err.Error(), "")
		return
	}

	imported := 0
	failed := 0

	if len(chapters) == 0 {
		// No chapters — register whole file
		job.set(splitJobRunning, "챕터 없음 — 전체 파일 등록 중...", "1/1")
		if err := registerSplitTrack(ctx, h, project, userID, fullMP3, videoTitle, uploader, 0); err != nil {
			failed++
		} else {
			imported++
		}
	} else {
		total := len(chapters)
		for i, ch := range chapters {
			prog := fmt.Sprintf("%d/%d", i+1, total)
			job.set(splitJobRunning, fmt.Sprintf("분할 중: %s", ch.Title), prog)

			outPath := filepath.Join(tmpDir, fmt.Sprintf("%03d.mp3", i+1))
			if err := ffmpegCut(ctx, fullMP3, outPath, ch.StartTime, ch.EndTime); err != nil {
				slog.Warn("ffmpeg cut failed", "chapter", ch.Title, "err", err)
				failed++
				continue
			}
			if err := registerSplitTrack(ctx, h, project, userID, outPath, ch.Title, uploader, int64(i)); err != nil {
				slog.Warn("register failed", "chapter", ch.Title, "err", err)
				failed++
			} else {
				imported++
			}
		}
	}

	job.mu.Lock()
	job.Status = splitJobDone
	job.Message = fmt.Sprintf("완료! %d개 트랙 생성%s", imported, func() string {
		if failed > 0 {
			return fmt.Sprintf(" (%d개 실패)", failed)
		}
		return ""
	}())
	job.ProjectID = project.PublicID
	job.Imported = imported
	job.Failed = failed
	job.mu.Unlock()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func parseFirstJSON(data []byte) (map[string]interface{}, error) {
	// yt-dlp may output multiple JSON lines; take the first
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "{") {
			var m map[string]interface{}
			if err := json.Unmarshal([]byte(line), &m); err == nil {
				return m, nil
			}
		}
	}
	var m map[string]interface{}
	err := json.Unmarshal(data, &m)
	return m, err
}

func extractChapters(meta map[string]interface{}, totalDur float64) []ChapterInfo {
	if meta == nil {
		return nil
	}
	chaps, ok := meta["chapters"].([]interface{})
	if !ok || len(chaps) == 0 {
		return nil
	}
	var result []ChapterInfo
	for i, c := range chaps {
		cm, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		chapTitle, _ := cm["title"].(string)
		startTime, _ := cm["start_time"].(float64)
		endTime, _ := cm["end_time"].(float64)
		if chapTitle == "" {
			chapTitle = fmt.Sprintf("Track %d", i+1)
		}
		if endTime == 0 && totalDur > 0 {
			endTime = totalDur
		}
		result = append(result, ChapterInfo{
			Index:     i + 1,
			Title:     chapTitle,
			StartTime: startTime,
			EndTime:   endTime,
			Duration:  endTime - startTime,
		})
	}
	return result
}

func ffmpegCut(ctx context.Context, src, dst string, startSec, endSec float64) error {
	args := []string{
		"-y",
		"-ss", fmt.Sprintf("%.3f", startSec),
		"-to", fmt.Sprintf("%.3f", endSec),
		"-i", src,
		"-c:a", "copy",
		dst,
	}
	out, err := exec.CommandContext(ctx, "ffmpeg", args...).CombinedOutput()
	if err != nil {
		slog.Error("ffmpeg cut error", "out", string(out))
	}
	return err
}

func registerSplitTrack(
	ctx context.Context,
	h *TracksHandler,
	project sqlc.Project,
	userID int64,
	mp3Path, title, artist string,
	order int64,
) error {
	f, err := os.Open(mp3Path)
	if err != nil {
		return err
	}
	defer f.Close()
	fi, _ := f.Stat()

	publicID, err := ids.NewPublicID()
	if err != nil {
		return err
	}

	artistVal := sql.NullString{}
	if artist != "" {
		artistVal = sql.NullString{String: artist, Valid: true}
	}

	track, err := h.db.CreateTrack(ctx, sqlc.CreateTrackParams{
		UserID:    userID,
		ProjectID: project.ID,
		Title:     strings.TrimSpace(title),
		Artist:    artistVal,
		Album:     sql.NullString{},
		PublicID:  publicID,
	})
	if err != nil {
		return err
	}

	_ = h.db.Queries.UpdateTrackOrder(ctx, sqlc.UpdateTrackOrderParams{
		TrackOrder: order,
		ID:         track.ID,
	})

	version, err := h.db.CreateTrackVersion(ctx, sqlc.CreateTrackVersionParams{
		TrackID:         track.ID,
		VersionName:     "YouTube",
		Notes:           sql.NullString{},
		DurationSeconds: sql.NullFloat64{},
		VersionOrder:    1,
	})
	if err != nil {
		return err
	}

	_ = h.db.SetActiveVersion(ctx, sqlc.SetActiveVersionParams{
		ActiveVersionID: sql.NullInt64{Int64: version.ID, Valid: true},
		ID:              track.ID,
	})

	saveResult, err := h.storage.SaveTrackSource(ctx, storage.SaveTrackSourceInput{
		ProjectPublicID: project.PublicID,
		TrackID:         track.ID,
		VersionID:       version.ID,
		OriginalName:    filepath.Base(mp3Path),
		Reader:          f,
	})
	if err != nil {
		return err
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
		OriginalFilename:  sql.NullString{String: filepath.Base(mp3Path), Valid: true},
	})
	if err != nil {
		return err
	}

	if h.transcoder != nil {
		_ = h.transcoder.TranscodeVersion(ctx, transcoding.TranscodeVersionInput{
			VersionID:      version.ID,
			SourceFilePath: saveResult.Path,
			TrackPublicID:  track.PublicID,
			UserID:         userID,
		})
	}

	return nil
}
