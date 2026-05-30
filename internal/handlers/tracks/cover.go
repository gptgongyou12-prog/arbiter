package tracks

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/service"
)

type SetTrackCoverRequest struct {
	ArtworkURL string `json:"artwork_url"`
}

func (h *TracksHandler) SetTrackCover(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}

	publicID := r.PathValue("id")
	ctx := r.Context()

	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, publicID)
	if err := httputil.HandleDBError(err, "track not found", "failed to query track"); err != nil {
		return err
	}

	access, err := CheckTrackAccess(ctx, h.db, track.ID, track.ProjectID, int64(userID))
	if err != nil {
		return apperr.NewInternal("failed to check track access", err)
	}
	if !access.HasAccess || !access.CanEdit {
		return apperr.NewForbidden("access denied")
	}

	project, err := h.db.Queries.GetProjectByID(ctx, track.ProjectID)
	if err != nil {
		return apperr.NewInternal("failed to get project", err)
	}

	var req SetTrackCoverRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return apperr.NewBadRequest("invalid request body")
	}
	if req.ArtworkURL == "" {
		return apperr.NewBadRequest("artwork_url is required")
	}

	// Download image from URL
	imgResp, err := http.Get(req.ArtworkURL)
	if err != nil {
		return apperr.NewBadRequest("failed to fetch artwork URL")
	}
	defer imgResp.Body.Close()

	processed, err := service.ProcessCoverImage(imgResp.Body)
	if err != nil {
		return apperr.NewBadRequest("failed to process image")
	}

	// Save to data/projects/{projectPublicId}/tracks/{trackId}/cover/
	baseDir := filepath.Join(
		h.dataDir, "projects", project.PublicID,
		"tracks", fmt.Sprintf("%d", track.ID), "cover",
	)
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return apperr.NewInternal("failed to create cover directory", err)
	}

	for size, data := range map[string][]byte{
		"small.webp":  processed.Small,
		"medium.webp": processed.Medium,
		"large.webp":  processed.Large,
	} {
		if err := os.WriteFile(filepath.Join(baseDir, size), data, 0o644); err != nil {
			return apperr.NewInternal(fmt.Sprintf("failed to write %s", size), err)
		}
	}

	_, dbErr := h.db.ExecContext(ctx,
		"UPDATE tracks SET cover_art_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		baseDir, track.ID,
	)
	if dbErr != nil {
		return apperr.NewInternal("failed to update track cover path", dbErr)
	}

	coverURL := fmt.Sprintf("/api/tracks/%s/cover", publicID)
	return httputil.OKResult(w, map[string]interface{}{
		"cover_url": coverURL,
	})
}

func (h *TracksHandler) GetTrackCover(w http.ResponseWriter, r *http.Request) error {
	publicID := r.PathValue("id")
	ctx := r.Context()

	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, publicID)
	if err := httputil.HandleDBError(err, "track not found", "failed to query track"); err != nil {
		return err
	}

	var coverArtPath string
	err = h.db.QueryRowContext(ctx,
		"SELECT COALESCE(cover_art_path, '') FROM tracks WHERE id = ?", track.ID,
	).Scan(&coverArtPath)
	if err != nil || coverArtPath == "" {
		return apperr.NewNotFound("no cover art for this track")
	}

	size := r.URL.Query().Get("size")
	if size == "" {
		size = "medium"
	}
	allowed := map[string]bool{"small": true, "medium": true, "large": true}
	if !allowed[size] {
		size = "medium"
	}

	filePath := filepath.Join(coverArtPath, size+".webp")
	f, err := os.Open(filePath)
	if err != nil {
		return apperr.NewNotFound("cover file not found")
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return apperr.NewInternal("failed to stat cover file", err)
	}

	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", fi.Size()))
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.WriteHeader(http.StatusOK)
	io.Copy(w, f)
	return nil
}
