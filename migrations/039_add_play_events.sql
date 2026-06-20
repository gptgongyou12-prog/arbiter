-- 039_add_play_events.sql
CREATE TABLE IF NOT EXISTS play_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completion_rate REAL NOT NULL DEFAULT 0.0,
    start_position_secs REAL NOT NULL DEFAULT 0.0,
    duration_listened_secs REAL NOT NULL DEFAULT 0.0,
    device_type TEXT NOT NULL DEFAULT 'unknown',
    is_autoplay INTEGER NOT NULL DEFAULT 0,
    repeat_index INTEGER NOT NULL DEFAULT 0,
    hour_of_day INTEGER NOT NULL DEFAULT 0,
    day_of_week INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_play_events_user ON play_events(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_events_track ON play_events(track_id);
