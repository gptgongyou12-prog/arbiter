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

	"bungleware/vault/internal/apperr"
	sqlc "bungleware/vault/internal/db/sqlc"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/ids"
	"bungleware/vault/internal/service"
	"bungleware/vault/internal/storage"
	"bungleware/vault/internal/transcoding"
)

// ─── Request / Response types ────────────────────────────────────────────────

type MediaImportRequest struct {
	URL       string `json:"url"`
	ProjectID string `json:"project_id"`
	Title     string `json:"title,omitempty"`
}

type MediaSearchRequest struct {
	Query    string `json:"query"`
	Source   string `json:"source"` // "youtube" | "soundcloud"
}

type MediaSearchResult struct {
	VideoID  string `json:"video_id"`
	Title    string `json:"title"`
	Duration int    `json:"duration"`
	Uploader string `json:"uploader"`
	URL      string `json:"url"`
	Source   string `json:"source"` // "youtube" | "soundcloud"
	Thumbnail string `json:"thumbnail,omitempty"`
}

type PlaylistInfoResponse struct {
	Title    string              `json:"title"`
	Uploader string              `json:"uploader"`
	Count    int                 `json:"count"`
	URL      string              `json:"url"`
	Source   string              `json:"source"`
	Entries  []MediaSearchResult `json:"entries"`
}

type ImportResult struct {
	Imported int      `json:"imported"`
	Failed   int      `json:"failed"`
	Tracks   []interface{} `json:"tracks"`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func detectSource(url string) string {
	if strings.Contains(url, "soundcloud.com") {
		return "soundcloud"
	}
	return "youtube"
}

func isPlaylistURL(url string) bool {
	// YouTube playlist
	if strings.Contains(url, "list=") && !strings.Contains(url, "watch?v=") {
		return true
	}
	if strings.Contains(url, "/playlist") {
		return true
	}
	// SoundCloud sets/playlists
	if strings.Contains(url, "soundcloud.com") && strings.Contains(url, "/sets/") {
		return true
	}
	// SoundCloud user page (all tracks)
	if strings.Contains(url, "soundcloud.com") &&
		!strings.Contains(url, "/sets/") &&
		strings.Count(url, "/") == 3 {
		// e.g. soundcloud.com/artist  (no track slug)
		return true
	}
	return false
}

func findYtDlp() string {
	if path, err := exec.LookPath("yt-dlp"); err == nil {
		return path
	}
	candidates := []string{
		"/usr/local/bin/yt-dlp",
		"/usr/bin/yt-dlp",
		"/home/lee/.local/bin/yt-dlp",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return "yt-dlp"
}

func parseEntry(entry map[string]interface{}, defaultSource string) MediaSearchResult {
	id, _ := entry["id"].(string)
	title, _ := entry["title"].(string)
	uploader, _ := entry["uploader"].(string)
	if uploader == "" {
		uploader, _ = entry["channel"].(string)
	}
	if uploader == "" {
		uploader, _ = entry["artist"].(string)
	}
	duration := 0
	if d, ok := entry["duration"].(float64); ok {
		duration = int(d)
	}
	webpageURL, _ := entry["webpage_url"].(string)
	if webpageURL == "" {
		webpageURL, _ = entry["url"].(string)
	}
	thumbnail, _ := entry["thumbnail"].(string)
	if thumbnail == "" {
		if thumbs, ok := entry["thumbnails"].([]interface{}); ok && len(thumbs) > 0 {
			if t, ok := thumbs[0].(map[string]interface{}); ok {
				thumbnail, _ = t["url"].(string)
			}
		}
	}

	source := defaultSource
	if webpageURL != "" {
		source = detectSource(webpageURL)
	}

	return MediaSearchResult{
		VideoID:   id,
		Title:     title,
		Duration:  duration,
		Uploader:  uploader,
		URL:       webpageURL,
		Source:    source,
		Thumbnail: thumbnail,
	}
}

// ─── Search ───────────────────────────────────────────────────────────────────

// SearchMedia handles YouTube and SoundCloud search
func (h *TracksHandler) SearchMedia(w http.ResponseWriter, r *http.Request) error {
	req, err := httputil.DecodeJSON[MediaSearchRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}
	if req.Query == "" {
		return apperr.NewBadRequest("query is required")
	}

	source := req.Source
	if source == "" {
		source = "youtube"
	}

	ytdlp := findYtDlp()
	var searchPrefix string
	switch source {
	case "soundcloud":
		searchPrefix = "scsearch5:"
	default:
		searchPrefix = "ytsearch5:"
	}

	cmd := exec.CommandContext(r.Context(), ytdlp,
		searchPrefix+req.Query,
		"--dump-json",
		"--no-playlist",
		"--flat-playlist",
		"--quiet",
	)
	out, err := cmd.Output()
	if err != nil {
		return apperr.NewInternal("search failed", err)
	}

	var results []MediaSearchResult
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		result := parseEntry(entry, source)
		// fix YouTube URL if only id is present
		if source == "youtube" && result.URL == "" && result.VideoID != "" {
			result.URL = "https://www.youtube.com/watch?v=" + result.VideoID
		}
		if result.URL == "" {
			continue
		}
		results = append(results, result)
	}
	if results == nil {
		results = []MediaSearchResult{}
	}
	return httputil.OKResult(w, results)
}

// ─── Playlist info (preview before import) ───────────────────────────────────

// GetPlaylistInfo returns metadata + track list for a playlist URL
func (h *TracksHandler) GetPlaylistInfo(w http.ResponseWriter, r *http.Request) error {
	req, err := httputil.DecodeJSON[MediaImportRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}
	if req.URL == "" {
		return apperr.NewBadRequest("url is required")
	}

	ytdlp := findYtDlp()
	source := detectSource(req.URL)

	cmd := exec.CommandContext(r.Context(), ytdlp,
		req.URL,
		"--dump-json",
		"--flat-playlist",
		"--quiet",
	)
	out, err := cmd.Output()
	if err != nil {
		return apperr.NewBadRequest("failed to fetch playlist info")
	}

	var entries []MediaSearchResult
	var playlistTitle, playlistUploader string

	for i, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		// First line might be the playlist itself
		if i == 0 {
			if t, ok := entry["title"].(string); ok {
				playlistTitle = t
			}
			if u, ok := entry["uploader"].(string); ok {
				playlistUploader = u
			}
		}
		result := parseEntry(entry, source)
		if result.URL == "" && result.VideoID != "" {
			if source == "youtube" {
				result.URL = "https://www.youtube.com/watch?v=" + result.VideoID
			}
		}
		if result.Title != "" {
			entries = append(entries, result)
		}
	}

	if playlistTitle == "" {
		playlistTitle = "Playlist"
	}

	return httputil.OKResult(w, PlaylistInfoResponse{
		Title:    playlistTitle,
		Uploader: playlistUploader,
		Count:    len(entries),
		URL:      req.URL,
		Source:   source,
		Entries:  entries,
	})
}

// ─── Single track import ──────────────────────────────────────────────────────

// ImportMediaTrack downloads a single URL as MP3 and registers it (YouTube or SoundCloud)
func (h *TracksHandler) ImportMediaTrack(w http.ResponseWriter, r *http.Request) error {
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

	ctx := r.Context()
	project, err := resolveProject(ctx, h, req.ProjectID, int64(userID))
	if err != nil {
		return err
	}

	track, err := downloadAndRegister(ctx, h, project, int64(userID), req.URL, req.Title, false)
	if err != nil {
		return err
	}

	return httputil.CreatedResult(w, convertTrack(track))
}

// ─── Playlist import ─────────────────────────────────────────────────────────

type PlaylistImportRequest struct {
	URL       string `json:"url"`
	ProjectID string `json:"project_id"`
}

// ImportPlaylist downloads all tracks in a playlist and registers them
func (h *TracksHandler) ImportPlaylist(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}

	req, err := httputil.DecodeJSON[PlaylistImportRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}
	if req.URL == "" {
		return apperr.NewBadRequest("url is required")
	}
	if req.ProjectID == "" {
		return apperr.NewBadRequest("project_id is required")
	}

	ctx := r.Context()
	project, err := resolveProject(ctx, h, req.ProjectID, int64(userID))
	if err != nil {
		return err
	}

	// Get flat playlist entries
	ytdlp := findYtDlp()
	source := detectSource(req.URL)

	cmd := exec.CommandContext(ctx, ytdlp,
		req.URL,
		"--dump-json",
		"--flat-playlist",
		"--quiet",
	)
	out, err := cmd.Output()
	if err != nil {
		return apperr.NewBadRequest("failed to fetch playlist")
	}

	type urlEntry struct {
		url   string
		title string
	}
	var trackURLs []urlEntry

	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		result := parseEntry(entry, source)
		if result.URL == "" && result.VideoID != "" {
			if source == "youtube" {
				result.URL = "https://www.youtube.com/watch?v=" + result.VideoID
			} else if source == "soundcloud" {
				// SoundCloud flat entry may have permalink_url
				if pu, ok := entry["permalink_url"].(string); ok {
					result.URL = pu
				}
			}
		}
		if result.URL != "" && result.Title != "" {
			trackURLs = append(trackURLs, urlEntry{url: result.URL, title: result.Title})
		}
	}

	if len(trackURLs) == 0 {
		return apperr.NewBadRequest("no tracks found in playlist")
	}

	// Download and register concurrently (max 3 workers)
	type result struct {
		track interface{}
		err   error
	}

	results := make([]result, len(trackURLs))
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup

	for i, entry := range trackURLs {
		wg.Add(1)
		go func(idx int, u urlEntry) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			track, err := downloadAndRegister(ctx, h, project, int64(userID), u.url, u.title, true)
			if err != nil {
				slog.Warn("playlist track failed", "url", u.url, "error", err)
				results[idx] = result{err: err}
				return
			}
			results[idx] = result{track: convertTrack(track)}
		}(i, entry)
	}
	wg.Wait()

	imported := 0
	failed := 0
	var tracks []interface{}
	for _, res := range results {
		if res.err != nil {
			failed++
		} else if res.track != nil {
			imported++
			tracks = append(tracks, res.track)
		}
	}
	if tracks == nil {
		tracks = []interface{}{}
	}

	return httputil.CreatedResult(w, ImportResult{
		Imported: imported,
		Failed:   failed,
		Tracks:   tracks,
	})
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

func resolveProject(ctx context.Context, h *TracksHandler, projectID string, userID int64) (sqlc.Project, error) {
	var project sqlc.Project
	if p, err := h.db.Queries.GetProjectByPublicIDNoFilter(ctx, projectID); err == nil {
		project = service.ProjectRowToProject(p)
	}
	if project.ID == 0 {
		return project, apperr.NewNotFound("project not found")
	}
	if project.UserID != userID {
		share, err := h.db.Queries.GetUserProjectShare(ctx, sqlc.GetUserProjectShareParams{
			ProjectID: project.ID,
			SharedTo:  userID,
		})
		if err != nil || !share.CanEdit {
			return project, apperr.NewForbidden("editing not allowed")
		}
	}
	return project, nil
}

func downloadAndRegister(
	ctx context.Context,
	h *TracksHandler,
	project sqlc.Project,
	userID int64,
	url, titleOverride string,
	isPlaylist bool,
) (sqlc.Track, error) {
	tmpDir, err := os.MkdirTemp("", "vault-media-*")
	if err != nil {
		return sqlc.Track{}, apperr.NewInternal("failed to create temp dir", err)
	}
	defer os.RemoveAll(tmpDir)

	ytdlp := findYtDlp()
	source := detectSource(url)

	// Fetch metadata
	noPlaylistFlag := "--no-playlist"
	if isPlaylist {
		noPlaylistFlag = "--no-playlist" // single track even in playlist context
	}
	metaArgs := []string{url, "--dump-json", noPlaylistFlag, "--quiet"}
	metaCmd := exec.CommandContext(ctx, ytdlp, metaArgs...)
	metaOut, err := metaCmd.Output()
	if err != nil {
		return sqlc.Track{}, apperr.NewBadRequest("failed to fetch media info")
	}
	var meta map[string]interface{}
	if err := json.Unmarshal(metaOut, &meta); err != nil {
		return sqlc.Track{}, apperr.NewInternal("failed to parse metadata", err)
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

	// Download
	outTemplate := filepath.Join(tmpDir, "%(title)s.%(ext)s")
	dlArgs := []string{
		url,
		"--extract-audio",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--no-playlist",
		"--output", outTemplate,
		"--quiet",
		"--no-warnings",
	}
	dlCmd := exec.CommandContext(ctx, ytdlp, dlArgs...)
	if out, err := dlCmd.CombinedOutput(); err != nil {
		slog.Error("yt-dlp download failed", "url", url, "output", string(out), "error", err)
		return sqlc.Track{}, apperr.NewInternal("failed to download audio", err)
	}

	// Find MP3
	entries, err := os.ReadDir(tmpDir)
	if err != nil || len(entries) == 0 {
		return sqlc.Track{}, apperr.NewInternal("downloaded file not found", nil)
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
		return sqlc.Track{}, apperr.NewInternal("failed to open file", err)
	}
	defer f.Close()
	fi, _ := f.Stat()
	originalFilename := filepath.Base(mp3Path)

	// DB records
	publicID, err := ids.NewPublicID()
	if err != nil {
		return sqlc.Track{}, apperr.NewInternal("failed to generate id", err)
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
		return sqlc.Track{}, apperr.NewInternal("failed to create track", err)
	}

	_ = h.db.Queries.UpdateTrackOrder(ctx, sqlc.UpdateTrackOrderParams{
		TrackOrder: maxOrder + 1,
		ID:         track.ID,
	})

	versionLabel := source
	if source == "soundcloud" {
		versionLabel = "SoundCloud"
	} else {
		versionLabel = "YouTube"
	}

	version, err := h.db.CreateTrackVersion(ctx, sqlc.CreateTrackVersionParams{
		TrackID:         track.ID,
		VersionName:     fmt.Sprintf("%s: %s", versionLabel, mediaTitle),
		Notes:           sql.NullString{},
		DurationSeconds: sql.NullFloat64{},
		VersionOrder:    1,
	})
	if err != nil {
		return sqlc.Track{}, apperr.NewInternal("failed to create version", err)
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
		return sqlc.Track{}, apperr.NewInternal("failed to save file", err)
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
		return sqlc.Track{}, apperr.NewInternal("failed to create track file", err)
	}

	if h.transcoder != nil {
		_ = h.transcoder.TranscodeVersion(ctx, transcoding.TranscodeVersionInput{
			VersionID:      version.ID,
			SourceFilePath: saveResult.Path,
			TrackPublicID:  track.PublicID,
			UserID:         userID,
		})
	}

	return track, nil
}

// Keep old handler names as aliases for backwards compat
func (h *TracksHandler) ImportYoutubeTrack(w http.ResponseWriter, r *http.Request) error {
	return h.ImportMediaTrack(w, r)
}
func (h *TracksHandler) SearchYoutube(w http.ResponseWriter, r *http.Request) error {
	return h.SearchMedia(w, r)
}
