package tracks

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"bungleware/vault/internal/apperr"
	"regexp"
	"bungleware/vault/internal/httputil"
)

type SetLyricsRequest struct {
	Lyrics string `json:"lyrics"`
}

// GetTrackLyrics returns stored lyrics for a track (plain + synced LRC).
func (h *TracksHandler) GetTrackLyrics(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	publicID := r.PathValue("id")
	ctx := r.Context()
	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, publicID)
	if err != nil {
		return apperr.NewNotFound("track not found")
	}
	access, err := CheckTrackAccess(ctx, h.db, track.ID, track.ProjectID, int64(userID))
	if err != nil || !access.HasAccess {
		return apperr.NewForbidden("access denied")
	}
	var lyrics, syncedLyrics string
	h.db.QueryRowContext(ctx, //nolint:errcheck
		"SELECT COALESCE(lyrics,''), COALESCE(synced_lyrics,'') FROM tracks WHERE id=?", track.ID,
	).Scan(&lyrics, &syncedLyrics)
	return httputil.OKResult(w, map[string]string{
		"lyrics":        lyrics,
		"synced_lyrics": syncedLyrics,
	})
}

// SetTrackLyrics saves user-provided lyrics.
func (h *TracksHandler) SetTrackLyrics(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	publicID := r.PathValue("id")
	ctx := r.Context()
	req, err := httputil.DecodeJSON[SetLyricsRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}
	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, publicID)
	if err != nil {
		return apperr.NewNotFound("track not found")
	}
	access, err := CheckTrackAccess(ctx, h.db, track.ID, track.ProjectID, int64(userID))
	if err != nil || !access.HasAccess || !access.CanEdit {
		return apperr.NewForbidden("editing not allowed")
	}
	_, err = h.db.ExecContext(ctx,
		"UPDATE tracks SET lyrics=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
		req.Lyrics, track.ID)
	if err != nil {
		return apperr.NewInternal("failed to save lyrics", err)
	}
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

// SetSyncedLyrics saves synced LRC lyrics.
func (h *TracksHandler) SetSyncedLyrics(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	publicID := r.PathValue("id")
	ctx := r.Context()
	type req struct {
		SyncedLyrics string `json:"synced_lyrics"`
	}
	body, err := httputil.DecodeJSON[req](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}
	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, publicID)
	if err != nil {
		return apperr.NewNotFound("track not found")
	}
	access, err := CheckTrackAccess(ctx, h.db, track.ID, track.ProjectID, int64(userID))
	if err != nil || !access.HasAccess || !access.CanEdit {
		return apperr.NewForbidden("editing not allowed")
	}
	_, err = h.db.ExecContext(ctx,
		"UPDATE tracks SET synced_lyrics=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
		body.SyncedLyrics, track.ID)
	if err != nil {
		return apperr.NewInternal("failed to save synced lyrics", err)
	}
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

type lrclibResult struct {
	PlainLyrics  string `json:"plainLyrics"`
	SyncedLyrics string `json:"syncedLyrics"`
	Instrumental bool   `json:"instrumental"`
}

// itunesResolve queries iTunes Search API and returns the best-match artist+title.
// Falls back to original values if iTunes finds nothing.
func itunesResolve(artist, title string) (string, string) {
	query := title
	if artist != "" {
		query = artist + " " + title
	}
	u := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=3&media=music",
		url.QueryEscape(query))
	resp, err := http.Get(u) //nolint:noctx
	if err != nil {
		return artist, title
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Results []struct {
			TrackName  string `json:"trackName"`
			ArtistName string `json:"artistName"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Results) == 0 {
		return artist, title
	}
	return result.Results[0].ArtistName, result.Results[0].TrackName
}

// fetchLrclib queries lrclib.net search API and returns the best match.
func fetchLrclib(artist, title string) (*lrclibResult, error) {
	queries := []string{}
	if artist != "" {
		q := url.Values{}
		q.Set("track_name", title)
		q.Set("artist_name", artist)
		queries = append(queries, "https://lrclib.net/api/search?"+q.Encode())
	}
	q2 := url.Values{}
	q2.Set("q", artist+" "+title)
	queries = append(queries, "https://lrclib.net/api/search?"+q2.Encode())
	q3 := url.Values{}
	q3.Set("q", title)
	queries = append(queries, "https://lrclib.net/api/search?"+q3.Encode())

	for _, apiURL := range queries {
		resp, err := http.Get(apiURL) //nolint:noctx
		if err != nil || resp.StatusCode != 200 {
			if resp != nil {
				resp.Body.Close()
			}
			continue
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}
		var results []lrclibResult
		if err := json.Unmarshal(body, &results); err != nil || len(results) == 0 {
			continue
		}
		// Prefer result with synced lyrics
		best := results[0]
		for _, r := range results {
			if r.SyncedLyrics != "" {
				best = r
				break
			}
		}
		if best.PlainLyrics != "" || best.SyncedLyrics != "" || best.Instrumental {
			return &best, nil
		}
	}
	return nil, nil
}

// FetchTrackLyrics: resolve via iTunes → search lrclib, save both plain + synced.
func (h *TracksHandler) FetchTrackLyrics(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	publicID := r.PathValue("id")
	ctx := r.Context()
	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, publicID)
	if err != nil {
		return apperr.NewNotFound("track not found")
	}
	access, err := CheckTrackAccess(ctx, h.db, track.ID, track.ProjectID, int64(userID))
	if err != nil || !access.HasAccess || !access.CanEdit {
		return apperr.NewForbidden("editing not allowed")
	}

	artist := ""
	if track.Artist.Valid {
		artist = strings.TrimSpace(track.Artist.String)
	}
	title := strings.TrimSpace(track.Title)

	// Step 1: resolve via iTunes for canonical artist/title
	resolvedArtist, resolvedTitle := itunesResolve(artist, title)

	// Step 2: try lrclib with resolved names
	res, _ := fetchLrclib(resolvedArtist, resolvedTitle)

	// Step 3: fallback — try original names if different
	if (res == nil || (res.PlainLyrics == "" && res.SyncedLyrics == "")) &&
		(resolvedArtist != artist || resolvedTitle != title) {
		res, _ = fetchLrclib(artist, title)
	}

	// Step 4: fallback — title only
	if res == nil || (res.PlainLyrics == "" && res.SyncedLyrics == "") {
		res, _ = fetchLrclib("", title)
	}

	if res == nil || (res.PlainLyrics == "" && res.SyncedLyrics == "" && !res.Instrumental) {
		return apperr.NewNotFound("lyrics not found")
	}

	plain := strings.TrimSpace(res.PlainLyrics)
	synced := strings.TrimSpace(res.SyncedLyrics)
	if res.Instrumental {
		plain = "[Instrumental]"
		synced = ""
	}

	_, err = h.db.ExecContext(ctx,
		"UPDATE tracks SET lyrics=?, synced_lyrics=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
		plain, synced, track.ID)
	if err != nil {
		return apperr.NewInternal("failed to save lyrics", err)
	}
	return httputil.OKResult(w, map[string]string{
		"lyrics":        plain,
		"synced_lyrics": synced,
	})
}

// normalizeForSearch removes features, brackets, and special characters for better matching.
func normalizeForSearch(s string) string {
	s = strings.ToLower(s)
	reFeat := regexp.MustCompile(`\s*(feat\.?|ft\.?)\s+[^(\[]*`)
	s = reFeat.ReplaceAllString(s, "")
	reBracket := regexp.MustCompile(`\s*[\(\[（【][^\)\]）】]*[\)\]）】]`)
	s = reBracket.ReplaceAllString(s, "")
	reSpecial := regexp.MustCompile(`[^\w\s\-]`)
	s = reSpecial.ReplaceAllString(s, " ")
	reSpaces := regexp.MustCompile(`\s+`)
	s = reSpaces.ReplaceAllString(strings.TrimSpace(s), " ")
	return s
}

type lrclibFullResult struct {
	TrackName    string  `json:"trackName"`
	ArtistName   string  `json:"artistName"`
	AlbumName    string  `json:"albumName"`
	Duration     float64 `json:"duration"`
	PlainLyrics  string  `json:"plainLyrics"`
	SyncedLyrics string  `json:"syncedLyrics"`
	Instrumental bool    `json:"instrumental"`
}

// fetchLrclibBest searches lrclib and picks the best result by album match and duration.
func fetchLrclibBest(artist, title, album string, durationSec float64) (*lrclibFullResult, error) {
	type attempt struct{ url string }
	normArtist := normalizeForSearch(artist)
	normTitle  := normalizeForSearch(title)
	normAlbum  := normalizeForSearch(album)

	attempts := []string{}

	// 1차: artist + title + album
	if artist != "" && album != "" {
		q := url.Values{}
		q.Set("track_name", normTitle)
		q.Set("artist_name", normArtist)
		q.Set("album_name", normAlbum)
		attempts = append(attempts, "https://lrclib.net/api/search?"+q.Encode())
	}
	// 2차: artist + title (정규화)
	if artist != "" {
		q := url.Values{}
		q.Set("track_name", normTitle)
		q.Set("artist_name", normArtist)
		attempts = append(attempts, "https://lrclib.net/api/search?"+q.Encode())
	}
	// 3차: 원본 artist + title (정규화 없이)
	if artist != "" {
		q := url.Values{}
		q.Set("track_name", title)
		q.Set("artist_name", artist)
		attempts = append(attempts, "https://lrclib.net/api/search?"+q.Encode())
	}
	// 4차: fuzzy title only
	q4 := url.Values{}
	q4.Set("q", normTitle)
	attempts = append(attempts, "https://lrclib.net/api/search?"+q4.Encode())

	for _, apiURL := range attempts {
		resp, err := http.Get(apiURL) //nolint:noctx
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 200 {
			continue
		}
		var results []lrclibFullResult
		if err := json.Unmarshal(body, &results); err != nil || len(results) == 0 {
			continue
		}

		// 가사 있는 결과만 필터
		var valid []lrclibFullResult
		for _, r := range results {
			if r.PlainLyrics != "" || r.SyncedLyrics != "" || r.Instrumental {
				valid = append(valid, r)
			}
		}
		if len(valid) == 0 {
			continue
		}

		best := valid[0]
		bestScore := -1.0

		for _, r := range valid {
			score := 0.0
			// synced lyrics 보너스
			if r.SyncedLyrics != "" {
				score += 10
			}
			// 앨범명 일치 보너스
			if album != "" && strings.EqualFold(normalizeForSearch(r.AlbumName), normAlbum) {
				score += 5
			}
			// duration 근접도 보너스 (10초 이내)
			if durationSec > 0 && r.Duration > 0 {
				diff := r.Duration - durationSec
				if diff < 0 {
					diff = -diff
				}
				if diff <= 10 {
					score += (10 - diff)
				}
			}
			if score > bestScore {
				bestScore = score
				best = r
			}
		}

		return &best, nil
	}
	return nil, nil
}

type ItunesSearchRequest struct {
	Query string `json:"query"`
}

type ItunesSearchEntry struct {
	TrackId        int    `json:"trackId"`
	TrackName      string `json:"trackName"`
	ArtistName     string `json:"artistName"`
	CollectionName string `json:"collectionName"`
	ArtworkUrl100  string `json:"artworkUrl100"`
	TrackTimeMillis int   `json:"trackTimeMillis"`
}

// SearchItunesLyrics proxies iTunes search to avoid CORS.
func (h *TracksHandler) SearchItunesLyrics(w http.ResponseWriter, r *http.Request) error {
	_, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	req, err := httputil.DecodeJSON[ItunesSearchRequest](r)
	if err != nil || strings.TrimSpace(req.Query) == "" {
		return apperr.NewBadRequest("query is required")
	}
	u := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=6&media=music",
		url.QueryEscape(strings.TrimSpace(req.Query)))
	resp, err := http.Get(u) //nolint:noctx
	if err != nil {
		return apperr.NewInternal("failed to reach iTunes", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Results []ItunesSearchEntry `json:"results"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return apperr.NewInternal("failed to parse iTunes response", err)
	}
	return httputil.OKResult(w, result.Results)
}

type LrclibFetchRequest struct {
	TrackId     int     `json:"trackId"`
	Artist      string  `json:"artist"`
	Title       string  `json:"title"`
	Album       string  `json:"album"`
	DurationMs  int     `json:"durationMs"`
}

// FetchLrclibLyrics fetches lyrics via lrclib, using iTunes Lookup for canonical metadata when trackId is provided.
func (h *TracksHandler) FetchLrclibLyrics(w http.ResponseWriter, r *http.Request) error {
	_, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("user not found in context")
	}
	req, err := httputil.DecodeJSON[LrclibFetchRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}

	artist := strings.TrimSpace(req.Artist)
	title  := strings.TrimSpace(req.Title)
	album  := strings.TrimSpace(req.Album)
	durationSec := float64(req.DurationMs) / 1000.0

	// trackId가 있으면 iTunes Lookup으로 정확한 메타데이터 가져오기
	if req.TrackId > 0 {
		lookupURL := fmt.Sprintf("https://itunes.apple.com/lookup?id=%d", req.TrackId)
		resp, err := http.Get(lookupURL) //nolint:noctx
		if err == nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			var lookupResult struct {
				Results []struct {
					TrackName      string `json:"trackName"`
					ArtistName     string `json:"artistName"`
					CollectionName string `json:"collectionName"`
					TrackTimeMillis int   `json:"trackTimeMillis"`
				} `json:"results"`
			}
			if json.Unmarshal(body, &lookupResult) == nil && len(lookupResult.Results) > 0 {
				r0 := lookupResult.Results[0]
				artist = r0.ArtistName
				title  = r0.TrackName
				album  = r0.CollectionName
				if r0.TrackTimeMillis > 0 {
					durationSec = float64(r0.TrackTimeMillis) / 1000.0
				}
			}
		}
	}

	res, _ := fetchLrclibBest(artist, title, album, durationSec)
	if res == nil || (res.PlainLyrics == "" && res.SyncedLyrics == "" && !res.Instrumental) {
		return apperr.NewNotFound("lyrics not found")
	}
	plain  := strings.TrimSpace(res.PlainLyrics)
	synced := strings.TrimSpace(res.SyncedLyrics)
	if res.Instrumental {
		plain  = "[Instrumental]"
		synced = ""
	}
	return httputil.OKResult(w, map[string]string{
		"lyrics":        plain,
		"synced_lyrics": synced,
	})
}
