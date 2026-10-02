'use client'

import type Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

const DEMO_VIDEOS = [
  { src: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/3/v1/3.m3u8', title: 'AI video editing', meta: 'Hands-on lesson' },
  { src: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/9/v1/9.m3u8', title: 'Prompt workflows', meta: 'Guided project' },
  { src: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/10/v1/10.m3u8', title: 'Creator automation', meta: 'Mobile lesson' },
  { src: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/13/v1/13.m3u8', title: 'AI earning skills', meta: 'Beginner path' },
  { src: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/20/v1/20.m3u8', title: 'Nex AI assistant', meta: 'Practice mode' },
]

const SOUND_UNLOCK_STORAGE_KEY = 'skillomate-preview-sound-unlocked'

function getReelOffset(index: number, activeIndex: number) {
  const total = DEMO_VIDEOS.length
  let offset = index - activeIndex
  if (offset > total / 2) offset -= total
  if (offset < -total / 2) offset += total
  return offset
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function ReelCard({
  demo,
  index,
  offset,
  active,
  muted,
  soundUnlocked,
  onMutedChange,
  onSoundUnlocked,
  onClick,
  onEnded,
}: {
  demo: (typeof DEMO_VIDEOS)[number]
  index: number
  offset: number
  active: boolean
  muted: boolean
  soundUnlocked: boolean
  onMutedChange: (muted: boolean) => void
  onSoundUnlocked: () => void
  onClick: () => void
  onEnded: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const chromeTimerRef = useRef<number | null>(null)
  const [hasVideoError, setHasVideoError] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showChrome, setShowChrome] = useState(true)
  const hasVideoIssue = hasVideoError || loadTimedOut
  const distance = Math.abs(offset)
  const hidden = distance > 2
  const translateX = offset * 58
  const translateY = active ? 0 : distance === 1 ? 30 : 58
  const rotateY = offset * -24
  const scale = active ? 1 : distance === 1 ? 0.7 : 0.52
  const opacity = active ? 1 : distance === 1 ? 0.5 : 0.16
  const effectiveMuted = muted || !soundUnlocked
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const shouldLoadVideo = !hidden

  useEffect(() => {
    setHasVideoError(false)
    setIsVideoReady(false)
    setLoadTimedOut(false)
    setIsPlaying(false)
    setUserPaused(false)
    setCurrentTime(0)
    setDuration(0)
    setShowChrome(true)
  }, [demo.src])

  const revealChrome = useCallback(() => {
    setShowChrome(true)
  }, [])

  const playVideo = useCallback((video: HTMLVideoElement, force = false) => {
    if (userPaused && !force) return
    video.muted = muted || !soundUnlocked
    video.play()
      .then(() => {
        if (soundUnlocked && !muted) video.muted = false
        setIsPlaying(true)
      })
      .catch(() => {
        if (muted) {
          setIsPlaying(false)
          return
        }

        video.muted = true
        video.play()
          .then(() => {
            if (soundUnlocked) video.muted = false
            setIsPlaying(true)
          })
          .catch(() => setIsPlaying(false))
      })
  }, [muted, soundUnlocked, userPaused])

  useEffect(() => {
    if (!active) {
      setShowChrome(true)
      return
    }

    if (chromeTimerRef.current) {
      window.clearTimeout(chromeTimerRef.current)
    }

    if (hasVideoIssue || !isVideoReady) {
      setShowChrome(true)
      return
    }

    if (!showChrome) return

    chromeTimerRef.current = window.setTimeout(() => {
      setShowChrome(false)
    }, 2000)

    return () => {
      if (chromeTimerRef.current) {
        window.clearTimeout(chromeTimerRef.current)
      }
    }
  }, [active, hasVideoIssue, isVideoReady, showChrome])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !shouldLoadVideo) return

    let stopped = false
    let hls: Hls | null = null
    const isHls = /\.m3u8(?:[?#]|$)/i.test(demo.src)
    const canPlayNativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'))

    const handleFatalError = () => {
      if (!stopped) setHasVideoError(true)
    }

    video.pause()
    video.removeAttribute('src')
    video.load()

    if (!isHls || canPlayNativeHls) {
      video.src = demo.src
      video.load()
      return () => {
        stopped = true
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }

    import('hls.js')
      .then(({ default: Hls }) => {
        if (stopped) return
        if (!Hls.isSupported()) {
          handleFatalError()
          return
        }

        hls = new Hls({
          enableWorker: true,
          maxBufferLength: active ? 30 : 12,
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) handleFatalError()
        })
        hls.loadSource(demo.src)
        hls.attachMedia(video)
      })
      .catch(handleFatalError)

    return () => {
      stopped = true
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [active, demo.src, shouldLoadVideo])

  useEffect(() => {
    if (!active || isVideoReady || hasVideoError) return

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true)
    }, 4500)

    return () => window.clearTimeout(timer)
  }, [active, hasVideoError, isVideoReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video || hasVideoIssue || !isVideoReady) return

    if (active) {
      if (userPaused) {
        video.pause()
        setIsPlaying(false)
        return
      }
      video.muted = effectiveMuted
      video.currentTime = 0
      setCurrentTime(0)
      playVideo(video, true)
      return
    }

    video.pause()
    setIsPlaying(false)
  }, [active, demo.src, effectiveMuted, hasVideoIssue, isVideoReady, muted, playVideo, soundUnlocked, userPaused])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = effectiveMuted
    if (!muted && soundUnlocked && active && !video.paused) video.muted = false
  }, [active, effectiveMuted, muted, soundUnlocked])

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      setUserPaused(false)
      playVideo(video)
      return
    }

    setUserPaused(true)
    video.pause()
    setIsPlaying(false)
  }

  const toggleSound = () => {
    const video = videoRef.current
    if (!video) return

    if (effectiveMuted) {
      onSoundUnlocked()
      onMutedChange(false)
      video.muted = false
      if (!userPaused) playVideo(video)
      return
    }

    video.muted = true
    onMutedChange(true)
  }

  const handleVideoReady = () => {
    const video = videoRef.current
    setIsVideoReady(true)
    if (!video || !active || hasVideoIssue || userPaused) return
    playVideo(video)
  }

  return (
    <div
      role="button"
      tabIndex={hidden ? -1 : 0}
      onClick={() => {
        if (active) revealChrome()
        onClick()
      }}
      onPointerMove={active ? revealChrome : undefined}
      onFocus={active ? revealChrome : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          revealChrome()
          onClick()
        }
      }}
      aria-label={`Select Skillomate preview video ${index + 1} of ${DEMO_VIDEOS.length}`}
      className={[
        'premium-reel-card group absolute left-1/2 top-0 w-[min(62vw,244px)] overflow-hidden text-left outline-none min-[480px]:w-[min(72vw,330px)] sm:w-[360px] lg:w-[370px]',
        'transition-all duration-500 ease-out',
        active ? 'is-active' : 'hover:opacity-70',
        hidden ? 'pointer-events-none opacity-0' : '',
      ].join(' ')}
      style={{
        transform: `translateX(calc(-50% + ${translateX}%)) translateY(${translateY}px) rotateY(${rotateY}deg) scale(${scale})`,
        transformOrigin: 'center',
        opacity,
        zIndex: active ? 40 : 30 - distance,
      }}
    >
      <div className="premium-video-surface relative aspect-[9/16]">
        <div
          className={[
            'premium-reel-placeholder absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(208,147,39,0.34),transparent_34%),linear-gradient(160deg,#151923_0%,#090b10_48%,#1a1005_100%)]',
            active && isVideoReady && !hasVideoIssue && !showChrome ? 'is-hidden' : '',
          ].join(' ')}
        >
          <div className="absolute inset-x-5 top-14 rounded-3xl border border-white/10 bg-black/25 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime font-(family-name:--font-grotesk)">
              {demo.meta}
            </p>
            <p className="mt-3 text-3xl font-bold leading-[0.95] text-white">
              {demo.title}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/62 font-(family-name:--font-grotesk)">
              Watch practical Skillomate lessons inside a mobile-first learning flow.
            </p>
          </div>
          <div className="absolute bottom-24 left-6 right-6 grid grid-cols-2 gap-2">
            {['Video', 'Projects', 'Nex AI', 'Progress'].map((label) => (
              <span key={label} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-[11px] font-bold text-white/72 backdrop-blur-sm font-(family-name:--font-grotesk)">
                {label}
              </span>
            ))}
          </div>
        </div>
        {hasVideoIssue ? (
          <div className="absolute inset-0 flex flex-col justify-end bg-black/15 p-5">
            <div className="mb-16 rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime font-(family-name:--font-grotesk)">
                Preview unavailable
              </p>
              <p className="mt-3 text-2xl font-bold leading-tight text-white">{demo.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/62 font-(family-name:--font-grotesk)">
                The video could not load right now, but the Skillomate preview is still available.
              </p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay={active}
            muted={effectiveMuted}
            playsInline
            preload={active ? 'auto' : 'metadata'}
            onEnded={active ? onEnded : undefined}
            onError={() => setHasVideoError(true)}
            onLoadedData={handleVideoReady}
            onCanPlay={handleVideoReady}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className={[
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
              isVideoReady ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
        )}
        <div
          className={[
            'premium-reel-video-shade absolute inset-0 bg-linear-to-t from-black/84 via-black/10 to-black/28',
            active && isVideoReady && !hasVideoIssue && !showChrome ? 'is-hidden' : '',
          ].join(' ')}
        />

        {active && !isVideoReady && !hasVideoIssue && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-md font-(family-name:--font-grotesk)">
              Loading preview
            </span>
          </div>
        )}

        {!active && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
              <Play size={16} fill="currentColor" strokeWidth={0} />
            </span>
          </div>
        )}

        <div
          className={[
            'premium-reel-chrome absolute left-3 right-3 top-3 flex items-center justify-between gap-2',
            active && isVideoReady && !hasVideoIssue && !showChrome ? 'is-hidden' : '',
          ].join(' ')}
        >
          <span className="premium-reel-chip">
            Skillomate preview
          </span>
          <span className="premium-reel-counter">
            {index + 1} of {DEMO_VIDEOS.length}
          </span>
        </div>

        <div
          className={[
            'premium-reel-caption absolute bottom-4 left-4 right-4',
            active && isVideoReady && !hasVideoIssue && !showChrome ? 'is-minimal' : '',
          ].join(' ')}
        >
          <div className="flex items-end justify-between gap-3">
            <div
              className={[
                'premium-reel-chrome',
                active && isVideoReady && !hasVideoIssue && !showChrome ? 'is-hidden' : '',
              ].join(' ')}
            >
              <p className="text-lg font-bold text-white">{demo.title}</p>
              <p className="mt-1 text-sm font-medium text-white/64 font-(family-name:--font-grotesk)">
                {index + 1} of {DEMO_VIDEOS.length}
              </p>
            </div>

            {active && !hasVideoIssue && (
              <div
                className={[
                  'premium-reel-chrome flex shrink-0 items-center gap-2',
                  isVideoReady && !showChrome ? 'is-hidden' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    togglePlayback()
                  }}
                  aria-label={isPlaying ? 'Pause video' : 'Play video'}
                  className="premium-reel-icon-button"
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" strokeWidth={0} />}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSound()
                  }}
                  aria-label={effectiveMuted ? 'Unmute video' : 'Mute video'}
                  className="premium-reel-icon-button"
                >
                  {effectiveMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              </div>
            )}
          </div>

          {active && !hasVideoIssue && (
            <div
              className={[
                'premium-reel-progress premium-reel-chrome mt-4',
                active && isVideoReady && !hasVideoIssue && !showChrome ? 'is-hidden' : '',
              ].join(' ')}
            >
              <div>
                <span style={{ width: `${progress}%` }} />
              </div>
              <p>
                {formatTime(currentTime)} / {formatTime(duration || 30)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ManualVideoCarousel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const lastNavigationAt = useRef(0)
  const dragStartX = useRef<number | null>(null)

  const unlockSound = useCallback(() => {
    setMuted(false)
    setSoundUnlocked(true)
    try {
      window.localStorage.setItem(SOUND_UNLOCK_STORAGE_KEY, 'true')
    } catch {
      // Ignore storage failures; playback still works for the current session.
    }
  }, [])

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOUND_UNLOCK_STORAGE_KEY) === 'true') {
        setMuted(false)
        setSoundUnlocked(true)
      }
    } catch {
      // Ignore storage failures; browser autoplay policy will decide audio.
    }
  }, [])

  useEffect(() => {
    if (soundUnlocked) return

    window.addEventListener('pointerdown', unlockSound, { once: true })
    window.addEventListener('keydown', unlockSound, { once: true })
    window.addEventListener('touchstart', unlockSound, { once: true, passive: true })

    return () => {
      window.removeEventListener('pointerdown', unlockSound)
      window.removeEventListener('keydown', unlockSound)
      window.removeEventListener('touchstart', unlockSound)
    }
  }, [soundUnlocked, unlockSound])

  const previous = useCallback(() => {
    setActiveIndex((current) => (current - 1 + DEMO_VIDEOS.length) % DEMO_VIDEOS.length)
  }, [])

  const next = useCallback(() => {
    setActiveIndex((current) => (current + 1) % DEMO_VIDEOS.length)
  }, [])

  const navigateWithThrottle = useCallback((direction: 'previous' | 'next') => {
    const now = Date.now()
    if (now - lastNavigationAt.current < 520) return
    lastNavigationAt.current = now
    if (direction === 'previous') previous()
    if (direction === 'next') next()
  }, [next, previous])

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(delta) < 12) return
    navigateWithThrottle(delta > 0 ? 'next' : 'previous')
  }

  const handleDragEnd = (clientX: number) => {
    if (dragStartX.current === null) return
    const delta = dragStartX.current - clientX
    dragStartX.current = null
    if (Math.abs(delta) < 36) return
    navigateWithThrottle(delta > 0 ? 'next' : 'previous')
  }

  return (
    <div className="premium-reel-stage relative left-1/2 mt-0 w-screen max-w-none -translate-x-1/2 sm:left-auto sm:mx-auto sm:mt-6 sm:w-[min(98vw,680px)] sm:translate-x-0 lg:mt-0 lg:w-[620px] xl:w-[660px]">
      <div className="premium-reel-nav absolute inset-x-1 top-1/2 z-50 flex -translate-y-1/2 items-center justify-between">
          <button
            type="button"
            onClick={previous}
            aria-label="Previous reel"
            className="premium-reel-arrow"
          >
            <ChevronLeft size={21} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next reel"
            className="premium-reel-arrow"
          >
            <ChevronRight size={21} />
          </button>
      </div>

      <div
        className="premium-reel-viewport relative mx-auto h-[500px] w-full touch-pan-y cursor-grab active:cursor-grabbing sm:h-[615px] lg:h-[650px]"
        onWheel={handleWheel}
        onTouchStart={(event) => { dragStartX.current = event.touches[0]?.clientX ?? null }}
        onTouchEnd={(event) => { handleDragEnd(event.changedTouches[0]?.clientX ?? 0) }}
        onPointerDown={(event) => {
          dragStartX.current = event.clientX
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={(event) => { handleDragEnd(event.clientX) }}
        onPointerCancel={() => {
          dragStartX.current = null
        }}
      >
        <div className="relative h-full">
          {DEMO_VIDEOS.map((demo, index) => (
            <ReelCard
              key={demo.src}
              demo={demo}
              index={index}
              offset={getReelOffset(index, activeIndex)}
              active={index === activeIndex}
              muted={muted}
              soundUnlocked={soundUnlocked}
              onMutedChange={setMuted}
              onSoundUnlocked={unlockSound}
              onClick={() => setActiveIndex(index)}
              onEnded={next}
            />
          ))}
        </div>
      </div>

      <div className="premium-reel-dots-slider mt-5" aria-label="Skillomate preview slider">
        {DEMO_VIDEOS.map((demo, index) => (
          <button
            key={demo.src}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`Show video ${index + 1} of ${DEMO_VIDEOS.length}`}
            aria-current={activeIndex === index}
          />
        ))}
      </div>

      <a
        href={SKILLOMATE_CHECKOUT_URL}
        className="btn-primary mx-auto mt-5 flex w-[min(82vw,300px)] items-center justify-center rounded-full px-6 py-3.5 text-sm font-bold shadow-[0_14px_34px_rgba(208,147,39,0.28)] font-(family-name:--font-grotesk) sm:hidden"
      >
        Start Learning — ₹299
      </a>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-0 pb-8 pt-4 sm:pb-14 sm:pt-12 md:pb-18 lg:pt-14">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-dots opacity-35" />
      </div>

      <div className="container-xl relative !px-0 sm:!px-6">
        <div className="grid min-h-[calc(100svh-6.25rem)] min-w-0 place-items-center sm:min-h-[calc(100svh-4rem)]">
          <h1 className="sr-only">Skillomate AI learning app preview</h1>
          <div className="relative z-10 w-full min-w-0 justify-self-center">
            <ManualVideoCarousel />
          </div>
        </div>
      </div>
    </section>
  )
}
