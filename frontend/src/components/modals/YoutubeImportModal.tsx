import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft, Youtube, Search, Music, Clock, Loader2, X,
  Cloud, Link2, ListMusic, ChevronDown, ChevronUp, Scissors, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/routes/__root";
import { post } from "@/api/client";
import type { Track } from "@/types/api";
import { useSplitJob } from "@/contexts/SplitJobContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaSearchResult {
  video_id: string;
  title: string;
  duration: number;
  uploader: string;
  url: string;
  source: "youtube" | "soundcloud";
  thumbnail?: string;
}

interface PlaylistInfo {
  title: string;
  uploader: string;
  count: number;
  url: string;
  source: string;
  entries: MediaSearchResult[];
}

interface ImportResult {
  imported: number;
  failed: number;
  tracks: Track[];
}

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


interface YoutubeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onImported?: () => void;
}

type Tab = "search" | "url";
type Source = "youtube" | "soundcloud";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSeconds(sec: number): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function detectSource(url: string): Source | null {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/soundcloud\.com/.test(url)) return "soundcloud";
  return null;
}

function isPlaylistURL(url: string): boolean {
  if (/[?&]list=/.test(url) && !/[?&]v=/.test(url)) return true;
  if (/youtube\.com\/playlist/.test(url)) return true;
  if (/soundcloud\.com\/[^/?#]+\/sets\/[^/?#]+/.test(url)) return true;
  if (/soundcloud\.com\/[^/?#]+$/.test(url)) return true; // user page (all tracks)
  if (/soundcloud\.com\/[^/?#]+\/likes/.test(url)) return true; // likes page
  return false;
}

async function searchMedia(query: string, source: Source): Promise<MediaSearchResult[]> {
  return post<MediaSearchResult[]>("/api/library/youtube/search", { query, source });
}

async function startMediaImport(url: string, projectId: string, title?: string): Promise<{ job_id: string }> {
  return post<{ job_id: string }>("/api/library/youtube/import/start", { url, project_id: projectId, title });
}

async function getPlaylistInfo(url: string, projectId: string): Promise<PlaylistInfo> {
  return post<PlaylistInfo>("/api/library/playlist/info", { url, project_id: projectId });
}

async function importPlaylist(url: string, projectId: string): Promise<ImportResult> {
  return post<ImportResult>("/api/library/playlist/import", { url, project_id: projectId });
}

async function getSplitPreview(url: string): Promise<SplitPreviewResponse> {
  return post<SplitPreviewResponse>("/api/library/youtube/split/preview", { url });
}

interface ManualChapter {
  title: string;
  start_seconds: number;
}

async function startSplitImport(url: string, manualChapters?: ManualChapter[]): Promise<{ job_id: string }> {
  return post<{ job_id: string }>("/api/library/youtube/split/import", {
    url,
    ...(manualChapters && manualChapters.length > 0 ? { manual_chapters: manualChapters } : {}),
  });
}

function parseTimeline(text: string): ManualChapter[] {
  return text.split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .flatMap(line => {
      const m = line.match(/^(?:\d+[\.\)]\s*)?(\d+:\d{2}(?::\d{2})?)\s+(.+)$/);
      if (!m) return [];
      const parts = m[1].split(":").map(Number);
      const secs = parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
      return [{ title: m[2].trim(), start_seconds: secs }];
    });
}


import type { SplitJobStatus } from "@/contexts/SplitJobContext";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  return source === "soundcloud" ? (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-400 bg-orange-400/10 rounded px-1">
      <Cloud className="size-2.5" /> SC
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400 bg-red-400/10 rounded px-1">
      <Youtube className="size-2.5" /> YT
    </span>
  );
}

function TrackRow({
  result,
  onImport,
  isImporting,
}: {
  result: MediaSearchResult;
  onImport: (r: MediaSearchResult) => void;
  isImporting: boolean;
}) {
  return (
    <button
      disabled={isImporting}
      onClick={() => onImport(result)}
      className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
    >
      {result.thumbnail ? (
        <img
          src={result.thumbnail}
          alt=""
          className="w-14 h-10 object-cover rounded-lg shrink-0 bg-white/10"
        />
      ) : (
        <div className="w-14 h-10 rounded-lg shrink-0 bg-white/10 flex items-center justify-center">
          <Music className="size-4 text-white/20" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{result.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <SourceBadge source={result.source} />
          <span className="text-white/40 text-xs truncate">{result.uploader}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {result.duration > 0 && (
          <span className="text-white/30 text-xs flex items-center gap-0.5">
            <Clock className="size-3" />
            {formatSeconds(result.duration)}
          </span>
        )}
        {isImporting ? (
          <Loader2 className="size-4 animate-spin text-white/60" />
        ) : (
          <Music className="size-4 text-white/20" />
        )}
      </div>
    </button>
  );
}

// ─── Playlist preview panel ───────────────────────────────────────────────────

function PlaylistPreview({
  info,
  onImport,
  isImporting,
  onCancel,
}: {
  info: PlaylistInfo;
  onImport: () => void;
  isImporting: boolean;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex items-start gap-3">
          <ListMusic className="size-5 text-white/60 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{info.title}</p>
            <p className="text-white/40 text-sm">{info.uploader}</p>
            <p className="text-white/30 text-xs mt-1">
              트랙 {info.count}개 · {info.source === "soundcloud" ? "SoundCloud" : "YouTube"} 플레이리스트
            </p>
          </div>
          <SourceBadge source={info.source} />
        </div>

        {info.entries.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "목록 닫기" : `트랙 목록 보기 (${info.entries.length}개)`}
          </button>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
                {info.entries.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-sm text-white/60">
                    <span className="text-white/20 text-xs w-5 text-right shrink-0">{i + 1}</span>
                    <span className="truncate">{e.title}</span>
                    {e.duration > 0 && (
                      <span className="text-white/30 text-xs shrink-0 ml-auto">{formatSeconds(e.duration)}</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1 h-11 border-white/10 bg-white/5 hover:bg-white/10">
          취소
        </Button>
        <Button onClick={onImport} disabled={isImporting} className="flex-1 h-11">
          {isImporting ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              가져오는 중...
            </>
          ) : (
            <>
              <ListMusic className="size-4 mr-2" />
              전체 가져오기 ({info.count}개)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Split preview panel ──────────────────────────────────────────────────────

function SplitPreviewPanel({
  preview,
  onImport,
  isImporting,
  jobStatus,
}: {
  preview: SplitPreviewResponse;
  onImport: (manualChapters?: ManualChapter[]) => void;
  isImporting: boolean;
  jobStatus: SplitJobStatus | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [manualTimeline, setManualTimeline] = useState("");
  const isDone = jobStatus?.status === "done";
  const isFailed = jobStatus?.status === "failed";
  const parsedChapters = !preview.has_chapters ? parseTimeline(manualTimeline) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
        <div className="flex items-start gap-3">
          <Scissors className="size-5 text-violet-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{preview.video_title}</p>
            <p className="text-white/40 text-sm">{preview.uploader}</p>
            {preview.has_chapters ? (
              <p className="text-violet-300/70 text-xs mt-1">
                챕터 {preview.chapters?.length ?? 0}개 감지됨 → 새 프로젝트로 자동 분할
              </p>
            ) : (
              <p className="text-yellow-400/70 text-xs mt-1">
                챕터 정보 없음 — 아래에 타임라인을 붙여넣어 분할하세요
              </p>
            )}
          </div>
        </div>

        {!preview.has_chapters && (
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              value={manualTimeline}
              onChange={(e) => setManualTimeline(e.target.value)}
              placeholder={"0:00 첫 번째 곡\n3:45 두 번째 곡\n7:20 세 번째 곡"}
              rows={5}
              className="w-full rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm px-3 py-2.5 placeholder:text-white/20 resize-none focus:outline-none focus:border-violet-500/50 font-mono"
            />
            {parsedChapters.length > 0 && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {parsedChapters.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                    <span className="text-violet-400/50 w-5 text-right shrink-0">{i + 1}</span>
                    <span className="truncate flex-1">{c.title}</span>
                    <span className="text-white/25 shrink-0">{formatSeconds(c.start_seconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(preview.chapters?.length ?? 0) > 0 && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {expanded ? "목록 닫기" : `트랙 목록 (${preview.chapters.length}개)`}
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex flex-col gap-1 max-h-52 overflow-y-auto pr-1">
                    {preview.chapters.map((c) => (
                      <div key={c.index} className="flex items-center gap-2 py-1 text-sm text-white/60">
                        <span className="text-violet-400/50 text-xs w-5 text-right shrink-0">{c.index}</span>
                        <span className="truncate flex-1">{c.title}</span>
                        <span className="text-white/25 text-xs shrink-0">{formatSeconds(Math.round(c.duration))}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Progress status */}
      {jobStatus && !isDone && !isFailed && (
        <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-violet-400 shrink-0" />
            <span className="text-sm text-white/80">{jobStatus.message}</span>
            {jobStatus.progress && (
              <span className="ml-auto text-xs text-white/40 shrink-0">{jobStatus.progress}</span>
            )}
          </div>
          {jobStatus.progress && (
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{
                  width: jobStatus.progress.includes("/")
                    ? `${(parseInt(jobStatus.progress.split("/")[0]) / parseInt(jobStatus.progress.split("/")[1])) * 100}%`
                    : "100%"
                }}
              />
            </div>
          )}
        </div>
      )}

      {isFailed && (
        <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {jobStatus.message}
        </div>
      )}

      {!isImporting && !isDone && (
        <Button
          onClick={() => onImport(parsedChapters.length > 0 ? parsedChapters : undefined)}
          disabled={isImporting || (!preview.has_chapters && parsedChapters.length === 0)}
          className="h-12 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
        >
          <Scissors className="size-4 mr-2" />
          {!preview.has_chapters && parsedChapters.length === 0
            ? "타임라인을 붙여넣어 주세요"
            : "새 프로젝트로 분할 가져오기"}
        </Button>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function YoutubeImportModal({
  isOpen,
  onClose,
  projectId,
  onImported,
}: YoutubeImportModalProps) {
  const { startJob } = useSplitJob();
  const [tab, setTab] = useState<Tab>("search");
  const [searchSource, setSearchSource] = useState<Source>("youtube");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  // URL tab state
  const [urlInput, setUrlInput] = useState("");
  const [urlSource, setUrlSource] = useState<Source | null>(null);
  const [urlIsPlaylist, setUrlIsPlaylist] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);

  // Split mode state
  const [splitMode, setSplitMode] = useState(false);
  const [splitPreview, setSplitPreview] = useState<SplitPreviewResponse | null>(null);
  const [isFetchingSplit, setIsFetchingSplit] = useState(false);
  const [isImportingSplit, setIsImportingSplit] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setUrlInput("");
      setUrlSource(null);
      setUrlIsPlaylist(false);
      setPlaylistInfo(null);
      setSplitMode(false);
      setSplitPreview(null);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        setResults(await searchMedia(query.trim(), searchSource));
      } catch {
        toast.error("검색 실패");
      } finally {
        setIsSearching(false);
      }
    }, 600);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, searchSource]);

  // Detect URL type with debounce
  useEffect(() => {
    if (urlTimeout.current) clearTimeout(urlTimeout.current);
    const src = detectSource(urlInput.trim());
    setUrlSource(src);
    setPlaylistInfo(null);
    setSplitPreview(null);
    if (!src || !urlInput.trim()) { setUrlIsPlaylist(false); return; }
    const playlist = isPlaylistURL(urlInput.trim());
    setUrlIsPlaylist(playlist);

    if (playlist && !splitMode) {
      urlTimeout.current = setTimeout(async () => {
        setIsFetchingPlaylist(true);
        try {
          setPlaylistInfo(await getPlaylistInfo(urlInput.trim(), projectId));
        } catch {
          // silently fail
        } finally {
          setIsFetchingPlaylist(false);
        }
      }, 800);
    }
    return () => { if (urlTimeout.current) clearTimeout(urlTimeout.current); };
  }, [urlInput, projectId, splitMode]);

  // Fetch split preview when splitMode is on
  useEffect(() => {
    if (!splitMode || !urlInput.trim() || !urlSource) {
      setSplitPreview(null);
      return;
    }
    setIsFetchingSplit(true);
    setSplitPreview(null);
    getSplitPreview(urlInput.trim())
      .then(setSplitPreview)
      .catch(() => toast.error("챕터 정보를 가져오지 못했습니다"))
      .finally(() => setIsFetchingSplit(false));
  }, [splitMode, urlInput, urlSource]);

  const handleImportSingle = useCallback(async (result: MediaSearchResult) => {
    if (importingId) return;
    setImportingId(result.video_id);
    try {
      const { job_id } = await startMediaImport(result.url, projectId, result.title);
      startJob(job_id, result.title, "media");
      onImported?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "가져오기 실패");
    } finally {
      setImportingId(null);
    }
  }, [importingId, projectId, startJob, onImported, onClose]);

  const handleImportURL = useCallback(async () => {
    if (!urlInput.trim() || importingId) return;
    setImportingId("url");
    try {
      const { job_id } = await startMediaImport(urlInput.trim(), projectId);
      startJob(job_id, urlInput.trim(), "media");
      onImported?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "가져오기 실패");
    } finally {
      setImportingId(null);
    }
  }, [urlInput, importingId, projectId, startJob, onImported, onClose]);

  const handleImportPlaylist = useCallback(async () => {
    if (!urlInput.trim() || isImportingPlaylist) return;
    setIsImportingPlaylist(true);
    try {
      const result = await importPlaylist(urlInput.trim(), projectId);
      toast.success(`플레이리스트 가져오기 완료! ${result.imported}개 성공${result.failed > 0 ? `, ${result.failed}개 실패` : ""}`);
      onImported?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "플레이리스트 가져오기 실패");
    } finally {
      setIsImportingPlaylist(false);
    }
  }, [urlInput, isImportingPlaylist, projectId, onImported, onClose]);

  const handleImportSplit = useCallback(async (manualChapters?: ManualChapter[]) => {
    if (!urlInput.trim() || isImportingSplit) return;
    setIsImportingSplit(true);
    try {
      const { job_id } = await startSplitImport(urlInput.trim(), manualChapters);
      // Hand off to global context — floating progress continues after modal closes
      startJob(job_id, splitPreview?.video_title ?? urlInput.trim());
      onImported?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "분할 시작 실패");
      setIsImportingSplit(false);
    }
  }, [urlInput, isImportingSplit, splitPreview, startJob, onImported, onClose]);

  const isBusy = !!importingId || isImportingPlaylist || isImportingSplit;
  const isSingleYoutube = urlSource === "youtube" && !urlIsPlaylist && !!urlInput.trim();

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[1000] bg-black/80"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 pointer-events-none"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 w-full max-w-lg border border-[#292828] rounded-[34px] shadow-2xl overflow-hidden pointer-events-auto flex flex-col"
              style={{ background: "linear-gradient(0deg, #151515 0%, #1D1D1D 100%)", maxHeight: "85vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-6 pt-6 pb-3 shrink-0">
                <Button size="icon-lg" onClick={onClose}>
                  <ChevronLeft className="size-5" />
                </Button>
                <div className="flex items-center gap-2">
                  <Youtube className="size-4 text-red-400" />
                  <Cloud className="size-4 text-orange-400 -ml-1" />
                  <span className="text-white font-semibold text-lg">음악 가져오기</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 pb-3 shrink-0">
                {(["search", "url"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {t === "search" ? <><Search className="inline size-3.5 mr-1" />검색</> : <><Link2 className="inline size-3.5 mr-1" />URL / 플레이리스트</>}
                  </button>
                ))}
              </div>

              {/* ── Search tab ── */}
              {tab === "search" && (
                <div className="flex flex-col gap-3 px-6 pb-6 overflow-hidden min-h-0">
                  <div className="flex gap-1">
                    {(["youtube", "soundcloud"] as Source[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => { setSearchSource(s); setResults([]); setQuery(""); }}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                          searchSource === s ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                        }`}
                      >
                        {s === "youtube" ? <Youtube className="size-3 text-red-400" /> : <Cloud className="size-3 text-orange-400" />}
                        {s === "youtube" ? "YouTube" : "SoundCloud"}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/40" />
                    <Input
                      ref={searchInputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={searchSource === "soundcloud" ? "SoundCloud에서 검색..." : "YouTube에서 검색..."}
                      className="pl-9 pr-9 h-12 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
                    />
                    {query && (
                      <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                        <X className="size-4" />
                      </button>
                    )}
                  </div>

                  {isSearching && (
                    <div className="flex items-center justify-center py-6 text-white/40">
                      <Loader2 className="size-5 animate-spin mr-2" />
                      <span className="text-sm">검색 중...</span>
                    </div>
                  )}
                  {!isSearching && results.length > 0 && (
                    <div className="flex flex-col gap-2 overflow-y-auto">
                      {results.map((r) => (
                        <TrackRow
                          key={r.video_id}
                          result={r}
                          onImport={handleImportSingle}
                          isImporting={importingId === r.video_id}
                        />
                      ))}
                    </div>
                  )}
                  {!isSearching && query && results.length === 0 && (
                    <p className="text-center text-white/30 text-sm py-6">결과 없음</p>
                  )}
                  {!query && (
                    <p className="text-center text-white/20 text-sm py-6">곡명 또는 아티스트를 입력하세요</p>
                  )}
                </div>
              )}

              {/* ── URL tab ── */}
              {tab === "url" && (
                <div className="flex flex-col gap-4 px-6 pb-6 overflow-y-auto">
                  <div className="relative">
                    {urlSource === "soundcloud" ? (
                      <Cloud className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-orange-400" />
                    ) : urlSource === "youtube" ? (
                      <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-red-400" />
                    ) : (
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/30" />
                    )}
                    <Input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="YouTube 또는 SoundCloud URL..."
                      className="pl-9 pr-9 h-12 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                      onKeyDown={(e) => !urlIsPlaylist && !splitMode && e.key === "Enter" && handleImportURL()}
                    />
                    {urlInput && (
                      <button
                        onClick={() => { setUrlInput(""); setPlaylistInfo(null); setSplitPreview(null); setSplitMode(false); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>

                  {/* Source hint */}
                  {urlSource && (
                    <div className="flex items-center gap-2 text-xs text-white/40 -mt-2">
                      <SourceBadge source={urlSource} />
                      {urlIsPlaylist ? (
                        <span className="flex items-center gap-1"><ListMusic className="size-3" /> 플레이리스트 감지됨</span>
                      ) : (
                        <span className="flex items-center gap-1"><Music className="size-3" /> 단일 트랙</span>
                      )}
                      {(isFetchingPlaylist || isFetchingSplit) && <Loader2 className="size-3 animate-spin ml-1" />}
                    </div>
                  )}

                  {/* Split mode toggle — YouTube single video only */}
                  {isSingleYoutube && (
                    <button
                      onClick={() => setSplitMode((v) => !v)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left ${
                        splitMode
                          ? "border-violet-500/40 bg-violet-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/8"
                      }`}
                    >
                      <div className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        splitMode ? "border-violet-400 bg-violet-400" : "border-white/30"
                      }`}>
                        {splitMode && <CheckCircle2 className="size-3.5 text-white fill-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium leading-none mb-0.5 ${splitMode ? "text-violet-300" : "text-white/60"}`}>
                          믹스/컴필레이션 분할 가져오기
                        </p>
                        <p className="text-xs text-white/30 leading-snug">
                          챕터별로 자동 분리 → 새 프로젝트로 생성
                        </p>
                      </div>
                      <Scissors className={`size-4 shrink-0 ${splitMode ? "text-violet-400" : "text-white/20"}`} />
                    </button>
                  )}

                  {/* Split preview */}
                  {splitMode && isFetchingSplit && (
                    <div className="flex items-center justify-center py-4 text-white/40 gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">챕터 정보 확인 중...</span>
                    </div>
                  )}
                  {splitMode && splitPreview && (
                    <SplitPreviewPanel
                      preview={splitPreview}
                      onImport={handleImportSplit}
                      isImporting={isImportingSplit}
                      jobStatus={null}
                    />
                  )}

                  {/* Playlist preview */}
                  {!splitMode && urlIsPlaylist && playlistInfo && (
                    <PlaylistPreview
                      info={playlistInfo}
                      onImport={handleImportPlaylist}
                      isImporting={isImportingPlaylist}
                      onCancel={() => { setUrlInput(""); setPlaylistInfo(null); setUrlIsPlaylist(false); }}
                    />
                  )}
                  {!splitMode && urlIsPlaylist && isFetchingPlaylist && !playlistInfo && (
                    <div className="flex items-center justify-center py-4 text-white/40 gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">플레이리스트 정보 불러오는 중...</span>
                    </div>
                  )}
                  {!splitMode && urlIsPlaylist && !isFetchingPlaylist && !playlistInfo && urlInput && (
                    <Button onClick={handleImportPlaylist} disabled={isBusy} className="h-12 rounded-2xl">
                      {isImportingPlaylist ? (
                        <><Loader2 className="size-4 animate-spin mr-2" />가져오는 중...</>
                      ) : (
                        <><ListMusic className="size-4 mr-2" />플레이리스트 전체 가져오기</>
                      )}
                    </Button>
                  )}

                  {/* Single track button */}
                  {!splitMode && !urlIsPlaylist && urlInput && urlSource && (
                    <Button onClick={handleImportURL} disabled={isBusy} className="h-12 rounded-2xl">
                      {importingId === "url" ? (
                        <><Loader2 className="size-4 animate-spin mr-2" />다운로드 중...</>
                      ) : (
                        <>{urlSource === "soundcloud" ? <Cloud className="size-4 mr-2 text-orange-400" /> : <Youtube className="size-4 mr-2 text-red-400" />}MP3로 가져오기</>
                      )}
                    </Button>
                  )}

                  <p className="text-center text-white/20 text-xs">
                    YouTube, SoundCloud URL 및 플레이리스트를 지원합니다
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
