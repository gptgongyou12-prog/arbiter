package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
)

type PlayEventsHandler struct {
	db *db.DB
}

func NewPlayEventsHandler(database *db.DB) *PlayEventsHandler {
	return &PlayEventsHandler{db: database}
}

type RecordPlayEventRequest struct {
	TrackID              string  `json:"track_id"`
	CompletionRate       float64 `json:"completion_rate"`
	StartPositionSecs    float64 `json:"start_position_secs"`
	DurationListenedSecs float64 `json:"duration_listened_secs"`
	DeviceType           string  `json:"device_type"`
	IsAutoplay           bool    `json:"is_autoplay"`
	RepeatIndex          int     `json:"repeat_index"`
	HourOfDay            int     `json:"hour_of_day"`
	DayOfWeek            int     `json:"day_of_week"`
}

func (h *PlayEventsHandler) RecordEvent(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	req, err := httputil.DecodeJSON[RecordPlayEventRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}
	if req.TrackID == "" {
		return apperr.NewBadRequest("track_id is required")
	}

	ctx := r.Context()

	track, err := h.db.Queries.GetTrackByPublicIDNoFilter(ctx, req.TrackID)
	if err == sql.ErrNoRows {
		return apperr.NewNotFound("track not found")
	}
	if err != nil {
		return apperr.NewInternal("failed to get track", err)
	}

	deviceType := req.DeviceType
	if deviceType == "" {
		deviceType = "unknown"
	}

	_, err = h.db.DB.ExecContext(ctx,
		"INSERT INTO play_events (user_id, track_id, completion_rate, start_position_secs,"+
			" duration_listened_secs, device_type, is_autoplay, repeat_index, hour_of_day, day_of_week)"+
			" VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		int64(userID), track.ID,
		req.CompletionRate, req.StartPositionSecs, req.DurationListenedSecs,
		deviceType, boolToInt(req.IsAutoplay), req.RepeatIndex,
		req.HourOfDay, req.DayOfWeek,
	)
	if err != nil {
		return apperr.NewInternal("failed to record play event", err)
	}

	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

type TopTrack struct {
	TrackPublicID string  `json:"track_id"`
	Title         string  `json:"title"`
	Artist        string  `json:"artist"`
	PlayCount     int     `json:"play_count"`
	AvgCompletion float64 `json:"avg_completion"`
}

type PlayStyleStats struct {
	TotalEvents       int        `json:"total_events"`
	AvgCompletionRate float64    `json:"avg_completion_rate"`
	TopHour           int        `json:"top_hour"`
	WeekdayRatio      float64    `json:"weekday_ratio"`
	AutoplayRatio     float64    `json:"autoplay_ratio"`
	MobileRatio       float64    `json:"mobile_ratio"`
	RepeatRatio       float64    `json:"repeat_ratio"`
	HourDistribution  []int      `json:"hour_distribution"`
	DayDistribution   []int      `json:"day_distribution"`
	TopTracks         []TopTrack `json:"top_tracks"`
}

func (h *PlayEventsHandler) GetStyleStats(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()

	var total int
	var avgCompletion float64
	_ = h.db.DB.QueryRowContext(ctx,
		"SELECT COUNT(*), COALESCE(AVG(completion_rate), 0) FROM play_events WHERE user_id = ?",
		int64(userID),
	).Scan(&total, &avgCompletion)

	hourDist := make([]int, 24)
	rows, _ := h.db.DB.QueryContext(ctx,
		"SELECT hour_of_day, COUNT(*) FROM play_events WHERE user_id = ? GROUP BY hour_of_day",
		int64(userID),
	)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var hr, cnt int
			_ = rows.Scan(&hr, &cnt)
			if hr >= 0 && hr < 24 {
				hourDist[hr] = cnt
			}
		}
	}

	dayDist := make([]int, 7)
	rows2, _ := h.db.DB.QueryContext(ctx,
		"SELECT day_of_week, COUNT(*) FROM play_events WHERE user_id = ? GROUP BY day_of_week",
		int64(userID),
	)
	if rows2 != nil {
		defer rows2.Close()
		for rows2.Next() {
			var d, cnt int
			_ = rows2.Scan(&d, &cnt)
			if d >= 0 && d < 7 {
				dayDist[d] = cnt
			}
		}
	}

	topHour, maxCnt := 0, 0
	for i, c := range hourDist {
		if c > maxCnt {
			maxCnt = c
			topHour = i
		}
	}

	weekdayCount := 0
	for i := 0; i <= 4; i++ {
		weekdayCount += dayDist[i]
	}
	weekdayRatio := 0.0
	if total > 0 {
		weekdayRatio = float64(weekdayCount) / float64(total)
	}

	var autoplayCount int
	_ = h.db.DB.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM play_events WHERE user_id = ? AND is_autoplay = 1",
		int64(userID),
	).Scan(&autoplayCount)
	autoplayRatio := 0.0
	if total > 0 {
		autoplayRatio = float64(autoplayCount) / float64(total)
	}

	var mobileCount int
	_ = h.db.DB.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM play_events WHERE user_id = ? AND device_type = 'mobile'",
		int64(userID),
	).Scan(&mobileCount)
	mobileRatio := 0.0
	if total > 0 {
		mobileRatio = float64(mobileCount) / float64(total)
	}

	var repeatCount int
	_ = h.db.DB.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM play_events WHERE user_id = ? AND repeat_index > 0",
		int64(userID),
	).Scan(&repeatCount)
	repeatRatio := 0.0
	if total > 0 {
		repeatRatio = float64(repeatCount) / float64(total)
	}

	var topTracks []TopTrack
	rows3, _ := h.db.DB.QueryContext(ctx,
		`SELECT t.public_id, t.title, COALESCE(t.artist, ''), COUNT(*) as cnt, COALESCE(AVG(pe.completion_rate), 0)
		 FROM play_events pe
		 JOIN tracks t ON t.id = pe.track_id
		 WHERE pe.user_id = ?
		 GROUP BY pe.track_id
		 ORDER BY cnt DESC
		 LIMIT 5`,
		int64(userID),
	)
	if rows3 != nil {
		defer rows3.Close()
		for rows3.Next() {
			var tt TopTrack
			_ = rows3.Scan(&tt.TrackPublicID, &tt.Title, &tt.Artist, &tt.PlayCount, &tt.AvgCompletion)
			topTracks = append(topTracks, tt)
		}
	}
	if topTracks == nil {
		topTracks = []TopTrack{}
	}

	return httputil.OKResult(w, PlayStyleStats{
		TotalEvents:       total,
		AvgCompletionRate: avgCompletion,
		TopHour:           topHour,
		WeekdayRatio:      weekdayRatio,
		AutoplayRatio:     autoplayRatio,
		MobileRatio:       mobileRatio,
		RepeatRatio:       repeatRatio,
		HourDistribution:  hourDist,
		DayDistribution:   dayDist,
		TopTracks:         topTracks,
	})
}

// GetAIInsight calls Gemini to generate a natural-language analysis of the user's listening style.
func (h *PlayEventsHandler) GetAIInsight(w http.ResponseWriter, r *http.Request) error {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return httputil.OKResult(w, map[string]string{"insight": ""})
	}

	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()

	var total int
	var avgCompletion float64
	_ = h.db.DB.QueryRowContext(ctx,
		"SELECT COUNT(*), COALESCE(AVG(completion_rate), 0) FROM play_events WHERE user_id = ?",
		int64(userID),
	).Scan(&total, &avgCompletion)

	if total < 10 {
		return httputil.OKResult(w, map[string]string{"insight": "아직 데이터가 부족해요. 노래를 더 들으면 분석이 정확해집니다."})
	}

	hourDist := make([]int, 24)
	rows, _ := h.db.DB.QueryContext(ctx,
		"SELECT hour_of_day, COUNT(*) FROM play_events WHERE user_id = ? GROUP BY hour_of_day",
		int64(userID),
	)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var hr, cnt int
			_ = rows.Scan(&hr, &cnt)
			if hr >= 0 && hr < 24 {
				hourDist[hr] = cnt
			}
		}
	}

	topHour, maxCnt2 := 0, 0
	for i, c := range hourDist {
		if c > maxCnt2 {
			maxCnt2 = c
			topHour = i
		}
	}

	dayDist := make([]int, 7)
	rows2, _ := h.db.DB.QueryContext(ctx,
		"SELECT day_of_week, COUNT(*) FROM play_events WHERE user_id = ? GROUP BY day_of_week",
		int64(userID),
	)
	if rows2 != nil {
		defer rows2.Close()
		for rows2.Next() {
			var d, cnt int
			_ = rows2.Scan(&d, &cnt)
			if d >= 0 && d < 7 {
				dayDist[d] = cnt
			}
		}
	}

	weekdays := [7]string{"월", "화", "수", "목", "금", "토", "일"}
	topDay, maxDay := 0, 0
	for i, c := range dayDist {
		if c > maxDay {
			maxDay = c
			topDay = i
		}
	}

	var mobileCount, autoplayCount, repeatCount int
	_ = h.db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM play_events WHERE user_id = ? AND device_type = 'mobile'", int64(userID)).Scan(&mobileCount)
	_ = h.db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM play_events WHERE user_id = ? AND is_autoplay = 1", int64(userID)).Scan(&autoplayCount)
	_ = h.db.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM play_events WHERE user_id = ? AND repeat_index > 0", int64(userID)).Scan(&repeatCount)

	var topTitle, topArtist string
	_ = h.db.DB.QueryRowContext(ctx,
		`SELECT t.title, COALESCE(t.artist,'') FROM play_events pe JOIN tracks t ON t.id=pe.track_id WHERE pe.user_id=? GROUP BY pe.track_id ORDER BY COUNT(*) DESC LIMIT 1`,
		int64(userID),
	).Scan(&topTitle, &topArtist)

	prompt := fmt.Sprintf(
		"다음은 사용자의 음악 청취 데이터입니다. 3~4문장으로 한국어로 청취 스타일과 특징을 분석해주세요. 너무 딱딱하지 않고 친근하게 써주세요.\n\n"+
			"- 총 재생 수: %d회\n"+
			"- 평균 완료율: %.0f%%\n"+
			"- 주로 듣는 시간대: %d시\n"+
			"- 가장 많이 듣는 요일: %s요일\n"+
			"- 모바일 비율: %.0f%%\n"+
			"- 자동재생 비율: %.0f%%\n"+
			"- 반복 재생 비율: %.0f%%\n"+
			"- 가장 많이 들은 곡: %s (%s)",
		total,
		avgCompletion*100,
		topHour,
		weekdays[topDay],
		float64(mobileCount)/float64(total)*100,
		float64(autoplayCount)/float64(total)*100,
		float64(repeatCount)/float64(total)*100,
		topTitle, topArtist,
	)

	insight, err := callGemini(apiKey, prompt)
	if err != nil {
		slog.Error("Gemini API error", "error", err)
		return httputil.OKResult(w, map[string]string{"insight": "AI 분석을 불러오지 못했습니다."})
	}

	return httputil.OKResult(w, map[string]string{"insight": insight})
}

func callGemini(apiKey, prompt string) (string, error) {
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey

	body := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]string{{"text": prompt}}},
		},
	}
	bodyBytes, _ := json.Marshal(body)

	resp, err := http.Post(url, "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}

	candidates, _ := result["candidates"].([]interface{})
	if len(candidates) == 0 {
		return "", fmt.Errorf("no candidates in response")
	}
	content, _ := candidates[0].(map[string]interface{})["content"].(map[string]interface{})
	parts, _ := content["parts"].([]interface{})
	if len(parts) == 0 {
		return "", fmt.Errorf("no parts in response")
	}
	text, _ := parts[0].(map[string]interface{})["text"].(string)
	return text, nil
}
