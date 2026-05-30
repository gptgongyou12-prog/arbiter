import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { post, get } from "@/api/client";

interface TrackLyricsModalProps {
  open: boolean;
  onClose: () => void;
  trackId: string;
  trackTitle: string;
}

export function TrackLyricsModal({ open, onClose, trackId, trackTitle }: TrackLyricsModalProps) {
  const [lyrics, setLyrics] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !trackId) return;
    setLoading(true);
    get<{ lyrics: string }>(`/api/tracks/${trackId}/lyrics`)
      .then((d) => setLyrics(d.lyrics ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, trackId]);

  const handleClose = useCallback(() => {
    if (!saving && !fetching) onClose();
  }, [saving, fetching, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  async function handleSave() {
    setSaving(true);
    try {
      await post(`/api/tracks/${trackId}/lyrics`, { lyrics });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleFetch() {
    setFetching(true);
    try {
      const d = await post<{ lyrics: string }>(`/api/tracks/${trackId}/lyrics/fetch`, {});
      setLyrics(d.lyrics);
    } catch {
      // keep existing
    } finally {
      setFetching(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative z-10 bg-background border border-border rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">가사 — {trackTitle}</h2>
          <button onClick={handleClose} className="rounded-md p-1 hover:bg-white/10 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="가사를 입력하거나 자동 검색을 사용하세요"
              className="min-h-[300px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleFetch} disabled={fetching || saving}>
                {fetching ? <Loader2 className="size-4 animate-spin mr-1" /> : <RefreshCw className="size-4 mr-1" />}
                자동 검색
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || fetching}>
                {saving ? <Loader2 className="size-4 animate-spin mr-1" /> : <Save className="size-4 mr-1" />}
                {saved ? "저장됨!" : "저장"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
