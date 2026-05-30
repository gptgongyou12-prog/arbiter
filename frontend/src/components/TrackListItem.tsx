import {
  MoreHorizontalIcon,
  PlayIcon,
  PauseIcon,
  LoaderIcon,
  LinkIcon,
  Users,
  ImageIcon,
  FileTextIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, memo, useEffect, useCallback, useRef } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { useWebHaptics } from "web-haptics/react";

interface TrackListItemProps {
  id: string;
  index: number;
  trackNumber: number;
  title: string;
  dateAdded: string;
  duration?: string;
  isPlaying?: boolean;
  isTranscoding?: boolean;
  className?: string;
  onMoreClick?: () => void;
  onClick?: () => void;
  isDraggable?: boolean;
  isShared?: boolean;
  isSharedWithUsers?: boolean;
  coverUrl?: string | null;
  onChangeCover?: () => void;
  onShowLyrics?: () => void;
}

function TrackListItem({
  id,
  index,
  trackNumber,
  title,
  dateAdded,
  duration,
  isPlaying = false,
  isTranscoding = false,
  className,
  onMoreClick,
  onClick,
  isDraggable = true,
  isShared = false,
  isSharedWithUsers = false,
  coverUrl,
  onChangeCover,
  onShowLyrics,
}: TrackListItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const haptic = useWebHaptics();
  const ctxRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!onChangeCover && !onShowLyrics) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [onChangeCover, onShowLyrics]);

  const content = (provided?: any, snapshot?: any) => (
    <>
      <div
        ref={provided?.innerRef}
        {...(provided?.draggableProps || {})}
        {...(provided?.dragHandleProps || {})}
        data-track-id={id}
        onContextMenu={handleContextMenu}
        className={cn(
          "relative flex items-center justify-between rounded-2xl pr-2",
          isDraggable && "cursor-grab active:cursor-grabbing",
          !isDraggable && "cursor-pointer",
          snapshot?.isDragging && "opacity-50 z-50",
          className,
        )}
      >
        <div
          role="button"
          tabIndex={isTranscoding ? -1 : 0}
          className={cn(
            "peer flex-1 min-w-0 relative z-10 py-2 px-4",
            isTranscoding ? "cursor-default opacity-60" : "cursor-pointer",
          )}
          onClick={isTranscoding ? undefined : () => { haptic.trigger("light"); onClick?.(); }}
          onKeyDown={isTranscoding ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
          onMouseEnter={() => !isTranscoding && setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex items-center gap-3 select-none">
            {coverUrl && (
              <img src={coverUrl} alt="" className="size-8 rounded object-cover shrink-0" />
            )}
            <span className="text-base text-muted-foreground w-6 shrink-0 flex items-center justify-center">
              {isTranscoding ? (
                <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
              ) : isPlaying ? (
                <PauseIcon fill="white" className="size-4 text-white" />
              ) : isHovered ? (
                <PlayIcon className="size-4 fill-current" />
              ) : (
                trackNumber
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isShared && (
                  <LinkIcon className="size-3 text-muted-foreground shrink-0" />
                )}
                {isSharedWithUsers && (
                  <Users className="size-3 text-muted-foreground shrink-0" />
                )}
                <h3
                  className={cn(
                    "text-base font-medium truncate",
                    isTranscoding && "text-muted-foreground",
                  )}
                >
                  {title}
                </h3>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {isTranscoding ? "Processing..." : dateAdded}
              </p>
            </div>
          </div>
        </div>

        {duration && !isTranscoding && (
          <div
            role="button"
            tabIndex={0}
            className="relative z-10 py-2 mr-4 cursor-pointer hidden md:block"
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <span
              className="text-xs text-muted-foreground cursor-pointer"
              style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 400 }}
            >
              {duration}
            </span>
          </div>
        )}

        <div
          className={cn(
            "absolute inset-0 rounded-2xl pointer-events-none",
            isHovered || snapshot?.isDragging
              ? "bg-white/5 ring-1 ring-white/10"
              : "bg-white/0",
          )}
        />

        {onMoreClick && (
          <div
            className="absolute right-0 top-0 bottom-0 w-[60px] z-20"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsHovered(false)}
          />
        )}

        {onMoreClick && (
          <div
            className={cn(
              "relative z-30 rounded-lg transition-colors",
              isTranscoding ? "opacity-40" : "hover:bg-white/5",
            )}
            onMouseEnter={() => setIsHovered(false)}
          >
            <Button
              variant="ghost"
              className="active:scale-100"
              size="icon-sm"
              disabled={isTranscoding}
              onClick={(e) => {
                e.stopPropagation();
                if (!isTranscoding) onMoreClick?.();
              }}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Context menu portal */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-[9999] min-w-[160px] rounded-lg border border-white/10 bg-[#222] shadow-xl py-1"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {onChangeCover && (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors text-left"
              onClick={() => { setCtxMenu(null); onChangeCover(); }}
            >
              <ImageIcon className="size-4 shrink-0" /> 앨범 아트 변경
            </button>
          )}
          {onShowLyrics && (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors text-left"
              onClick={() => { setCtxMenu(null); onShowLyrics(); }}
            >
              <FileTextIcon className="size-4 shrink-0" /> 가사 보기 / 편집
            </button>
          )}
        </div>
      )}
    </>
  );

  return isDraggable ? (
    <Draggable draggableId={id} index={index}>
      {(provided, snapshot) => content(provided, snapshot)}
    </Draggable>
  ) : (
    content()
  );
}

export default memo(TrackListItem);
