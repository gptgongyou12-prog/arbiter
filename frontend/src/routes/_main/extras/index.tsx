import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import {
  ListIcon, GaugeIcon, WavesIcon, DownloadIcon,
  ClockIcon, BookOpenIcon, CircleIcon, SettingsIcon,
  ChevronRightIcon, Music2Icon, XIcon, GripVerticalIcon, ChevronDownIcon,
} from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/_main/extras/')({
  component: ExtrasPage,
})

function SpeedSheet({ onClose }: { onClose: () => void }) {
  const { audioPlayerRef } = useAudioPlayer()
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  const [current, setCurrent] = useState(
    () => audioPlayerRef.current?.audio?.current?.playbackRate ?? 1.0
  )

  const setSpeed = (s: number) => {
    if (audioPlayerRef.current?.audio?.current) {
      audioPlayerRef.current.audio.current.playbackRate = s
    }
    setCurrent(s)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-[#111] border-t border-white/8 rounded-t-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />
        <p className="text-white font-medium text-base mb-4">재생 속도</p>
        <div className="flex flex-wrap gap-2">
          {speeds.map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors ' +
                (current === s
                  ? 'bg-amber-500 text-black'
                  : 'bg-white/6 text-white/60 hover:bg-white/10')
              }
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-white/6 rounded-xl text-white/50 text-sm"
        >
          닫기
        </button>
      </div>
    </div>
  )
}

function QueueList() {
  const { queue, currentTrack, removeFromQueue, clearQueue } = useAudioPlayer()

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[10px] text-white/25 font-semibold uppercase tracking-widest">
          재생예정목록
        </p>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-2.5 py-1 bg-white/5 rounded-lg"
          >
            전체 삭제
          </button>
        )}
      </div>

      {currentTrack && (
        <div className="bg-amber-500/8 border border-amber-500/15 rounded-2xl px-4 py-3 flex items-center gap-3 mb-2">
          <div className="size-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 overflow-hidden">
            {currentTrack.coverUrl ? (
              <img src={currentTrack.coverUrl} alt="" className="size-9 rounded-lg object-cover" />
            ) : (
              <span className="text-white/20 text-xs">♪</span>
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
      )}

      {queue.length === 0 ? (
        <div className="text-center py-10 text-white/20 text-sm bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          대기열이 비어 있습니다
        </div>
      ) : (
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
      )}
    </div>
  )
}

type Item = {
  icon: React.ComponentType<any>
  name: string
  sub: string
  to?: string
  action?: string
  orange?: boolean
}

type Section = {
  label: string
  items: Item[]
}

function ExtrasPage() {
  const navigate = useNavigate()
  const { queue } = useAudioPlayer()
  const [showSpeed, setShowSpeed] = useState(false)
  const [showQueue, setShowQueue] = useState(false)

  const sections: Section[] = [
    {
      label: '플레이어',
      items: [
        { icon: ListIcon,     name: '대기열',      sub: queue.length + '곡 대기 중',    action: 'queue' },
        { icon: GaugeIcon,    name: '배속',        sub: '재생 속도 조절',                action: 'speed', orange: true },
        { icon: WavesIcon,    name: '크로스페이드', sub: '꺼짐',                          action: 'crossfade' },
        { icon: DownloadIcon, name: '저장',        sub: '트랙·프로젝트 내보내기',          to: '/storage', orange: true },
      ],
    },
    {
      label: '기록',
      items: [
        { icon: ClockIcon,    name: '히스토리', sub: '재생 기록',     to: '/history' },
        { icon: BookOpenIcon, name: '리포트',   sub: '통계·인사이트', to: '/report', orange: true },
        { icon: Music2Icon,   name: '내 노래 스타일', sub: '재생 패턴 분석', to: '/music-style', orange: true },
      ],
    },
    {
      label: '기타',
      items: [
        { icon: CircleIcon,   name: 'KBO',  sub: '오늘 경기·순위', to: '/kbo' },
        { icon: SettingsIcon, name: '설정', sub: '계정·알림·구독',  to: '/profile' },
      ],
    },
  ]

  const handleItem = (item: Item) => {
    if (item.action === 'queue') { setShowQueue(v => !v); return }
    if (item.to) navigate({ to: item.to as any })
    else if (item.action === 'speed') setShowSpeed(true)
  }

  return (
    <div className="bg-[#111]">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-12 md:pt-10">
        <h1 className="text-white text-2xl font-medium mb-6 hidden md:block">부가기능</h1>
        {sections.map(sec => (
          <div key={sec.label} className="mb-6">
            <p className="text-[10px] text-white/25 font-semibold uppercase tracking-widest px-1 mb-2">
              {sec.label}
            </p>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
              {sec.items.map((item, i) => (
                <button
                  key={item.name}
                  onClick={() => handleItem(item)}
                  className={
                    'w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/8 transition-colors text-left ' +
                    (i < sec.items.length - 1 ? 'border-b border-white/[0.05]' : '')
                  }
                >
                  <div
                    className={
                      'size-9 rounded-xl flex items-center justify-center shrink-0 ' +
                      (item.orange
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : 'bg-white/6')
                    }
                  >
                    <item.icon
                      className={'size-4 ' + (item.orange ? 'text-amber-400' : 'text-white/50')}
                      strokeWidth={1.8}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/90 text-sm">{item.name}</p>
                    <p className="text-white/30 text-xs mt-0.5">{item.sub}</p>
                  </div>
                  {item.action === 'queue' ? (
                    <ChevronDownIcon
                      className={'size-4 text-white/15 shrink-0 transition-transform ' + (showQueue ? 'rotate-180' : '')}
                      strokeWidth={1.5}
                    />
                  ) : (
                    <ChevronRightIcon className="size-4 text-white/15 shrink-0" strokeWidth={1.5} />
                  )}
                </button>
              ))}
            </div>
            {sec.label === '플레이어' && showQueue && (
              <div className="mt-3">
                <QueueList />
              </div>
            )}
          </div>
        ))}
      </div>
      {showSpeed && <SpeedSheet onClose={() => setShowSpeed(false)} />}
    </div>
  )
}
