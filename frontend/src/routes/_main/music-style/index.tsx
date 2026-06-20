import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Music2, BarChart2, Clock, Smartphone, Repeat2, Sparkles, TrendingUp, Star, Zap } from "lucide-react";
import { getStyleStats } from "@/api/playEvents";
import type { PlayStyleStats } from "@/api/playEvents";
import { get } from "@/api/client";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 flex items-center gap-3">
      <div className="size-9 rounded-xl bg-white/6 flex items-center justify-center shrink-0">
        <Icon className="size-4 text-white/60" strokeWidth={1.6} />
      </div>
      <div>
        <p className="text-white/40 text-xs">{label}</p>
        <p className="text-white text-sm font-semibold mt-0.5">{value}</p>
        {sub && <p className="text-white/25 text-[11px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HourBar({ dist }: { dist: number[] }) {
  const max = Math.max(...dist, 1);
  const peak = dist.indexOf(Math.max(...dist));
  return (
    <div className="flex items-end gap-[2px] h-12">
      {dist.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-opacity ${i === peak ? "bg-orange-400" : "bg-white/20"}`}
          style={{ height: `${Math.max((v / max) * 100, 4)}%`, opacity: v === 0 ? 0.15 : 1 }}
          title={`${i}시: ${v}회`}
        />
      ))}
    </div>
  );
}

function DayBar({ dist }: { dist: number[] }) {
  const max = Math.max(...dist, 1);
  const peak = dist.indexOf(Math.max(...dist));
  return (
    <div className="flex gap-1.5">
      {dist.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full rounded-sm ${i === peak ? "bg-orange-400" : "bg-white/20"}`}
            style={{ height: `${Math.max((v / max) * 32, 3)}px`, opacity: v === 0 ? 0.15 : 1 }}
          />
          <span className={`text-[10px] ${i === peak ? "text-orange-400" : "text-white/30"}`}>{DAYS[i]}</span>
        </div>
      ))}
    </div>
  );
}

function CompletionBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-white/40">평균 완료율</span>
        <span className="text-white font-semibold">{pct}%</span>
      </div>
      <div className="h-2 bg-white/8 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-orange-400" : "bg-red-500/70"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-white/25 text-[11px]">
        {pct >= 80 ? "노래를 끝까지 잘 듣는 편이에요 🎵" : pct >= 50 ? "중간 정도 듣고 넘기는 편이에요" : "자주 스킵하는 편이에요 ⏭"}
      </p>
    </div>
  );
}

export const Route = createFileRoute("/_main/music-style/")({
  component: MusicStylePage,
});

function MusicStylePage() {
  const { data, isLoading } = useQuery<PlayStyleStats>({
    queryKey: ["play-style-stats"],
    queryFn: getStyleStats,
    staleTime: 60_000,
  });

  const { data: aiData, isLoading: aiLoading } = useQuery<{ insight: string }>({
    queryKey: ["play-style-ai-insight"],
    queryFn: () => get<{ insight: string }>("/api/play-events/ai-insight"),
    staleTime: 5 * 60_000,
    enabled: !!data && data.total_events >= 10,
  });

  const listenStyle = (d: PlayStyleStats) => {
    if (d.autoplay_ratio > 0.7) return "자동재생 선호형 🔀";
    if (d.repeat_ratio > 0.3) return "반복 감상형 🔁";
    if (d.avg_completion_rate > 0.85) return "완청 집중형 🎧";
    return "자유 탐색형 🎵";
  };

  return (
    <div className="px-4 py-6 space-y-5 max-w-lg mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <Music2 className="size-5 text-orange-400" strokeWidth={1.6} />
        </div>
        <div>
          <h1 className="text-white font-semibold text-base">내 노래 스타일</h1>
          <p className="text-white/35 text-xs mt-0.5">재생 패턴 심층 분석</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-white/30 text-sm text-center py-12">분석 중...</div>
      ) : !data || data.total_events === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 text-center space-y-2">
          <BarChart2 className="size-8 text-white/15 mx-auto" />
          <p className="text-white/40 text-sm">아직 데이터가 없어요</p>
          <p className="text-white/20 text-xs">노래를 재생하면 패턴이 쌓입니다</p>
        </div>
      ) : (
        <>
          {/* Style type badge */}
          <div className="bg-orange-500/8 border border-orange-500/15 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Zap className="size-4 text-orange-400 shrink-0" strokeWidth={1.6} />
            <div>
              <p className="text-orange-300/80 text-xs">나의 청취 유형</p>
              <p className="text-white font-semibold text-sm mt-0.5">{listenStyle(data)}</p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={BarChart2} label="총 재생 횟수" value={`${data.total_events.toLocaleString()}회`} />
            <StatCard icon={Clock} label="주로 듣는 시간" value={`${data.top_hour}시대`} sub={data.top_hour < 6 ? "새벽형" : data.top_hour < 12 ? "오전형" : data.top_hour < 18 ? "오후형" : "저녁형"} />
            <StatCard icon={Smartphone} label="모바일 비율" value={`${Math.round(data.mobile_ratio * 100)}%`} />
            <StatCard icon={Repeat2} label="반복 재생 비율" value={`${Math.round(data.repeat_ratio * 100)}%`} />
            <StatCard icon={TrendingUp} label="자동재생 비율" value={`${Math.round(data.autoplay_ratio * 100)}%`} />
            <StatCard icon={Star} label="평일 집중도" value={`${Math.round(data.weekday_ratio * 100)}%`} sub="평일 재생 비율" />
          </div>

          {/* Completion rate bar */}
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4">
            <CompletionBar rate={data.avg_completion_rate} />
          </div>

          {/* Hour distribution */}
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 space-y-3">
            <p className="text-white/50 text-xs font-medium">시간대별 재생</p>
            <HourBar dist={data.hour_distribution} />
            <div className="flex justify-between text-[10px] text-white/20">
              <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span>
            </div>
          </div>

          {/* Day distribution */}
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 space-y-3">
            <p className="text-white/50 text-xs font-medium">요일별 재생</p>
            <DayBar dist={data.day_distribution} />
          </div>

          {/* Top tracks */}
          {data.top_tracks && data.top_tracks.length > 0 && (
            <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 space-y-3">
              <p className="text-white/50 text-xs font-medium">자주 들은 곡 TOP {data.top_tracks.length}</p>
              <div className="space-y-2.5">
                {data.top_tracks.map((t, i) => (
                  <div key={t.track_id} className="flex items-center gap-3">
                    <span className="text-white/20 text-xs w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{t.title}</p>
                      <p className="text-white/35 text-xs truncate">{t.artist || "Unknown"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white/60 text-xs">{t.play_count}회</p>
                      <p className="text-white/25 text-[10px]">{Math.round(t.avg_completion * 100)}% 완료</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI insight */}
          <div className={`border rounded-2xl p-4 flex items-start gap-3 ${aiData?.insight ? "bg-orange-500/5 border-orange-500/15" : "bg-white/[0.03] border-white/8"}`}>
            <Sparkles className="size-4 text-orange-400/70 mt-0.5 shrink-0" strokeWidth={1.6} />
            <div className="flex-1">
              <p className="text-orange-300/70 text-xs font-medium mb-1">AI 분석</p>
              {aiLoading ? (
                <p className="text-white/25 text-xs">분석 중...</p>
              ) : aiData?.insight ? (
                <p className="text-white/60 text-xs leading-relaxed">{aiData.insight}</p>
              ) : (
                <p className="text-white/25 text-xs">
                  {data.total_events < 10
                    ? `${data.total_events}회 재생됨 — 10회 이상이면 AI 분석이 활성화됩니다`
                    : "Google AI 분석을 사용하려면 GEMINI_API_KEY를 설정해주세요"}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
