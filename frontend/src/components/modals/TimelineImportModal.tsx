import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X, Scissors, Loader2, ChevronRight } from "lucide-react";
import { toast } from "@/routes/__root";
import { post } from "@/api/client";
import { useSplitJob } from "@/contexts/SplitJobContext";

interface ChapterInfo {
  index: number;
  title: string;
  start_time: number;
  end_time: number;
  duration: number;
}

interface SplitPreviewResponse {
  video_title: string;
  uploader: string;
  total_secs: number;
  chapters: ChapterInfo[];
  has_chapters: boolean;
}

interface ManualChapter {
  title: string;
  start_seconds: number;
}

async function getSplitPreview(url: string): Promise<SplitPreviewResponse> {
  return post<SplitPreviewResponse>("/api/library/youtube/split/preview", { url });
}

async function startSplitImport(url: string, manualChapters?: ManualChapter[]): Promise<{ job_id: string }> {
  return post<{ job_id: string }>("/api/library/youtube/split/import", {
    url,
    ...(manualChapters && manualChapters.length > 0 ? { manual_chapters: manualChapters } : {}),
  });
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimeline(text: string): ManualChapter[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const m = line.match(/^(?:\d+[.)]\s*)?(\d+:\d{2}(?::\d{2})?)\s+(.+)$/);
      if (!m) return [];
      const parts = m[1].split(":").map(Number);
      const secs =
        parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + parts[1];
      return [{ title: m[2].trim(), start_seconds: secs }];
    });
}

interface TimelineImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TimelineImportModal({ isOpen, onClose }: TimelineImportModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<SplitPreviewResponse | null>(null);
  const [timelineText, setTimelineText] = useState("");
  const [step, setStep] = useState<"url" | "preview">("url");
  const { startJob } = useSplitJob();

  const handlePreview = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const p = await getSplitPreview(url.trim());
      setPreview(p);
      setStep("preview");
    } catch {
      toast.error("URL을 확인할 수 없습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const manualChapters =
        !preview?.has_chapters && timelineText.trim()
          ? parseTimeline(timelineText)
          : undefined;
      const { job_id } = await startSplitImport(url.trim(), manualChapters);
      startJob(job_id, preview?.video_title ?? url);
      toast.success("가져오기 시작 — 백그라운드 처리 중");
      handleClose();
    } catch {
      toast.error("가져오기 시작 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl("");
    setPreview(null);
    setTimelineText("");
    setStep("url");
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end md:items-center md:justify-center"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="relative w-full md:max-w-lg bg-[#141414] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Scissors className="size-4 text-amber-400" strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">타임라인 가져오기</p>
                  <p className="text-white/30 text-[11px]">영상을 챕터별로 쪼개서 트랙으로 저장</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="size-7 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {step === "url" ? (
                <>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="YouTube URL 입력"
                    onKeyDown={(e) => e.key === "Enter" && !loading && handlePreview()}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors"
                    autoFocus
                  />
                  <button
                    onClick={handlePreview}
                    disabled={!url.trim() || loading}
                    className="w-full h-11 rounded-2xl bg-amber-500 text-black text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                  >
                    {loading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    {loading ? "확인 중..." : "챕터 확인"}
                  </button>
                </>
              ) : preview ? (
                <>
                  <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
                    <p className="text-white text-sm font-medium truncate">
                      {preview.video_title}
                    </p>
                    <p className="text-white/40 text-xs mt-1">
                      {preview.uploader} · {formatSec(preview.total_secs)}
                    </p>
                  </div>

                  {preview.has_chapters ? (
                    <div className="bg-white/[0.03] border border-white/6 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                      {preview.chapters.map((ch, i) => (
                        <div
                          key={i}
                          className={
                            "flex items-center gap-3 px-4 py-2.5 " +
                            (i < preview.chapters.length - 1
                              ? "border-b border-white/[0.05]"
                              : "")
                          }
                        >
                          <span className="text-white/25 text-xs w-6 text-right shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-white/80 text-xs flex-1 truncate">
                            {ch.title}
                          </span>
                          <span className="text-white/30 text-[11px] shrink-0">
                            {formatSec(ch.start_time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-white/40 text-xs mb-2">
                        챕터 정보 없음 — 타임라인 직접 입력 (선택)
                      </p>
                      <textarea
                        value={timelineText}
                        onChange={(e) => setTimelineText(e.target.value)}
                        placeholder={"0:00 인트로\n3:24 1번 트랙\n7:11 2번 트랙"}
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white/80 placeholder:text-white/25 outline-none focus:border-white/25 transition-colors resize-none font-mono"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep("url")}
                      className="h-11 px-4 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm flex items-center"
                    >
                      뒤로
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={loading}
                      className="flex-1 h-11 rounded-2xl bg-amber-500 text-black text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                    >
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Scissors className="size-4" />
                      )}
                      {loading ? "시작 중..." : "가져오기 시작"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
