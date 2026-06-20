import { post, get } from "./client";

export interface RecordPlayEventPayload {
  track_id: string;
  completion_rate: number;
  start_position_secs: number;
  duration_listened_secs: number;
  device_type: "mobile" | "desktop";
  is_autoplay: boolean;
  repeat_index: number;
  hour_of_day: number;
  day_of_week: number;
}

export interface TopTrack {
  track_id: string;
  title: string;
  artist: string;
  play_count: number;
  avg_completion: number;
}

export interface PlayStyleStats {
  total_events: number;
  avg_completion_rate: number;
  top_hour: number;
  weekday_ratio: number;
  autoplay_ratio: number;
  mobile_ratio: number;
  repeat_ratio: number;
  hour_distribution: number[];
  day_distribution: number[];
  top_tracks: TopTrack[];
}

export function recordPlayEvent(payload: RecordPlayEventPayload): Promise<{ status: string }> {
  return post("/api/play-events", payload);
}

export function getStyleStats(): Promise<PlayStyleStats> {
  return get("/api/play-events/style");
}
