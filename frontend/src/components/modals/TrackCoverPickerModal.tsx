import { useState, useEffect, useCallback } from "react";
import { Loader2, X } from "lucide-react";
import { post } from "@/api/client";
import { cn } from "@/lib/utils";

interface TrackCoverPickerModalProps {
  open: boolean;
  onClose: () => void;
  trackId: string;
  trackTitle: string;
  onChanged: () => void;
}

interface ItunesResult {
  artworkUrl100: string;
  trackName: string;
  artistName: string;
  collectionName: string;
}

function hiResUrl(url: string): string {
  return url.replace("100x100bb", "600x600bb");
}

export function TrackCoverPickerModal({
  open,
  onClose,
  trackId,
  trackTitle,
  onChanged,
}: TrackCoverPickerModalProps) {
  const [results, setResults] = useState<ItunesResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !trackTitle) return;
    setResults([]);
    setLoading(true);
    const term = encodeURIComponent(trackTitle);
    fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=9&media=music`)
      .then((r) => r.json())
      .then((data) => setResults(data.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, trackTitle]);

  const handleClose = useCallback(() => {
    if (!applying) onClose();
  }, [applying, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  async function handlePick(url: string) {
    setApplying(url);
    try {
      await post(`/api/tracks/${trackId}/cover`, { artwork_url: hiResUrl(url) });
      onChanged();
      onClose();
    } catch {
      // ignore
    } finally {
      setApplying(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative z-10 bg-background border border-border rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">앨범 아트 선택</h2>
          <button onClick={handleClose} className="rounded-md p-1 hover:bg-white/10 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && results.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">검색 결과가 없습니다</p>
        )}
        {!loading && results.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {results.map((r, i) => (
              <button
                key={i}
                className={cn(
                  "relative rounded overflow-hidden aspect-square group border border-border hover:border-primary transition-colors",
                  applying && "opacity-50 cursor-not-allowed"
                )}
                disabled={!!applying}
                onClick={() => handlePick(r.artworkUrl100)}
                title={`${r.trackName} – ${r.artistName}`}
              >
                <img src={r.artworkUrl100} alt={r.collectionName} className="w-full h-full object-cover" />
                {applying === r.artworkUrl100 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="size-5 animate-spin text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity line-clamp-1">
                  {r.collectionName || r.trackName}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
