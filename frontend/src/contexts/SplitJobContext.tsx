import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { Scissors, Download, Loader2, CheckCircle2, XCircle, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SplitJobStatus {
  status: "pending" | "running" | "done" | "failed";
  message: string;
  progress: string;
  project_id: string;
  imported: number;
  failed: number;
}

export interface MediaImportJobStatus {
  status: "pending" | "running" | "done" | "failed";
  message: string;
  progress: string;
  track_id: string;
}

type JobKind = "split" | "media";
type AnyStatus = SplitJobStatus | MediaImportJobStatus;

interface ActiveJob {
  jobId: string;
  videoTitle: string;
  kind: JobKind;
  status: AnyStatus | null;
}

interface SplitJobContextType {
  startJob: (jobId: string, videoTitle: string, kind?: JobKind) => void;
  activeJob: ActiveJob | null;
}

const SplitJobContext = createContext<SplitJobContextType>({
  startJob: () => {},
  activeJob: null,
});

export function useSplitJob() {
  return useContext(SplitJobContext);
}

function statusUrl(kind: JobKind, jobId: string) {
  return kind === "media"
    ? `/api/library/youtube/import/status/${jobId}`
    : `/api/library/youtube/split/status/${jobId}`;
}

// 진행률을 0-100 숫자로 정규화 ("3/12" 또는 "45%" 형식 모두 지원)
function parseProgressPct(progress: string, isDone: boolean): number {
  if (progress.endsWith("%")) {
    const n = parseFloat(progress.slice(0, -1));
    return isNaN(n) ? (isDone ? 100 : 0) : n;
  }
  if (progress.includes("/")) {
    const [a, b] = progress.split("/").map((s) => parseInt(s, 10));
    return b ? (a / b) * 100 : isDone ? 100 : 0;
  }
  return isDone ? 100 : 0;
}

// ─── Provider + floating UI ──────────────────────────────────────────────────

export function SplitJobProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startJob = useCallback((jobId: string, videoTitle: string, kind: JobKind = "split") => {
    stopPoll();
    setActiveJob({ jobId, videoTitle, kind, status: null });

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(statusUrl(kind, jobId), {
          credentials: "include",
        });
        if (!r.ok) return;
        const data = await r.json();
        const status: AnyStatus = data.data ?? data;

        setActiveJob((prev) =>
          prev?.jobId === jobId ? { ...prev, status } : prev
        );

        if (status.status === "done") {
          stopPoll();
          if (kind === "split") {
            setTimeout(() => {
              navigate({
                to: "/project/$projectId",
                params: { projectId: (status as SplitJobStatus).project_id },
              });
              setTimeout(() => setActiveJob(null), 3000);
            }, 1000);
          } else {
            setTimeout(() => setActiveJob(null), 3000);
          }
        } else if (status.status === "failed") {
          stopPoll();
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
  }, [stopPoll, navigate]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const dismiss = useCallback(() => {
    stopPoll();
    setActiveJob(null);
  }, [stopPoll]);

  const isDone = activeJob?.status?.status === "done";
  const isFailed = activeJob?.status?.status === "failed";
  const progress = activeJob?.status?.progress ?? "";
  const progressPct = parseProgressPct(progress, !!isDone);
  const progressLabel = `${Math.round(progressPct)}%`;

  return (
    <SplitJobContext.Provider value={{ startJob, activeJob }}>
      {children}

      {/* Floating progress card */}
      <AnimatePresence>
        {activeJob && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-2rem)] max-w-sm"
          >
            <div
              className="rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #1a1025 0%, #0f0f1a 100%)" }}
            >
              {/* Progress bar top */}
              <div className="h-0.5 bg-white/5">
                <motion.div
                  className={`h-full ${isDone ? "bg-green-500" : isFailed ? "bg-red-500" : "bg-violet-500"}`}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              <div className="px-4 py-3 flex items-start gap-3">
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="size-5 text-green-400" />
                  ) : isFailed ? (
                    <XCircle className="size-5 text-red-400" />
                  ) : activeJob.kind === "media" ? (
                    <Download className="size-5 text-violet-400" />
                  ) : (
                    <Scissors className="size-5 text-violet-400" />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {activeJob.videoTitle}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {!isDone && !isFailed && (
                      <Loader2 className="size-3 animate-spin text-violet-400 shrink-0" />
                    )}
                    <p className={`text-xs truncate ${
                      isDone ? "text-green-400" : isFailed ? "text-red-400" : "text-white/50"
                    }`}>
                      {activeJob.status?.message ?? "준비 중..."}
                    </p>
                    {!isDone && !isFailed && (
                      <span className="text-xs text-white/30 shrink-0 ml-auto">{progressLabel}</span>
                    )}
                  </div>
                </div>

                {/* Dismiss (only when done/failed) */}
                {(isDone || isFailed) && (
                  <button
                    onClick={dismiss}
                    className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SplitJobContext.Provider>
  );
}
