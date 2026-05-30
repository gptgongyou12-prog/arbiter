import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { Scissors, Loader2, CheckCircle2, XCircle, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SplitJobStatus {
  status: "pending" | "running" | "done" | "failed";
  message: string;
  progress: string;
  project_id: string;
  imported: number;
  failed: number;
}

interface ActiveJob {
  jobId: string;
  videoTitle: string;
  status: SplitJobStatus | null;
}

interface SplitJobContextType {
  startJob: (jobId: string, videoTitle: string) => void;
  activeJob: ActiveJob | null;
}

const SplitJobContext = createContext<SplitJobContextType>({
  startJob: () => {},
  activeJob: null,
});

export function useSplitJob() {
  return useContext(SplitJobContext);
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

  const startJob = useCallback((jobId: string, videoTitle: string) => {
    stopPoll();
    setActiveJob({ jobId, videoTitle, status: null });

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/library/youtube/split/status/${jobId}`, {
          credentials: "include",
        });
        if (!r.ok) return;
        const data = await r.json();
        const status: SplitJobStatus = data.data ?? data;

        setActiveJob((prev) =>
          prev?.jobId === jobId ? { ...prev, status } : prev
        );

        if (status.status === "done") {
          stopPoll();
          setTimeout(() => {
            navigate({
              to: "/project/$projectId",
              params: { projectId: status.project_id },
            });
            setTimeout(() => setActiveJob(null), 3000);
          }, 1000);
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
  const progressPct = progress.includes("/")
    ? (parseInt(progress.split("/")[0]) / parseInt(progress.split("/")[1])) * 100
    : isDone ? 100 : 0;

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
                    {progress && !isDone && (
                      <span className="text-xs text-white/30 shrink-0 ml-auto">{progress}</span>
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
