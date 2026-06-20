import { createFileRoute } from '@tanstack/react-router'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { XIcon, GripVerticalIcon } from 'lucide-react'

export const Route = createFileRoute('/_main/queue/')({
  component: QueuePage,
})

function QueuePage() {
  const { queue, currentTrack, removeFromQueue, clearQueue } = useAudioPlayer()

  return (
    <div className="bg-[#111]">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-12 md:pt-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white text-2xl font-medium hidden md:block">대기열</h1>
          <div className="flex items-center gap-2 md:ml-auto">
            <span className="text-white/30 text-xs">{queue.length}곡</span>
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 bg-white/5 rounded-lg"
              >
                전체 삭제
              </button>
            )}
          </div>
        </div>

        {currentTrack && (
          <div className="mb-4">
            <p className="text-[10px] text-amber-400/70 font-semibold uppercase tracking-widest px-1 mb-2">재생 중</p>
            <div className="bg-amber-500/8 border border-amber-500/15 rounded-2xl px-4 py-3.5 flex items-center gap-3">
              <div className="size-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                {currentTrack.coverUrl ? (
                  <img src={currentTrack.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
                ) : (
                  <div className="size-9 rounded-lg bg-white/8 flex items-center justify-center">
                    <span className="text-white/20 text-xs">♪</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{currentTrack.title}</p>
                <p className="text-white/35 text-xs mt-0.5 truncate">{currentTrack.artist || currentTrack.projectName || ''}</p>
              </div>
              <div className="flex gap-0.5 items-end h-4 shrink-0">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-0.5 bg-amber-400/60 rounded-full animate-pulse"
                    style={{ height: (6 + i * 3) + 'px', animationDelay: (i * 0.15) + 's' }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {queue.length === 0 ? (
          <div className="text-center py-20 text-white/20 text-sm">대기열이 비어 있습니다</div>
        ) : (
          <div>
            <p className="text-[10px] text-white/25 font-semibold uppercase tracking-widest px-1 mb-2">다음 재생</p>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
              {queue.map((track, i) => (
                <div
                  key={track.id + '-' + i}
                  className={'flex items-center gap-3 px-4 py-3 ' + (i < queue.length - 1 ? 'border-b border-white/[0.05]' : '')}
                >
                  <GripVerticalIcon className="size-4 text-white/15 shrink-0" strokeWidth={1.5} />
                  <div className="size-8 rounded-lg bg-white/6 flex items-center justify-center shrink-0 overflow-hidden">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt="" className="size-8 object-cover" />
                    ) : (
                      <span className="text-white/20 text-xs">♪</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/85 text-sm truncate">{track.title}</p>
                    <p className="text-white/30 text-xs mt-0.5 truncate">{track.artist || track.projectName || ''}</p>
                  </div>
                  <button
                    onClick={() => removeFromQueue(i)}
                    className="size-7 flex items-center justify-center text-white/20 hover:text-white/60 transition-colors shrink-0"
                  >
                    <XIcon className="size-4" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
