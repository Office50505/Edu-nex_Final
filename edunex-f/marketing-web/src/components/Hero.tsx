'use client'

import type Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'
import { OFFER_DISCOUNT_PERCENT, OFFER_PRICE, ORIGINAL_PRICE } from '@/lib/pricing'

const PRIMARY_PREVIEW_VIDEO = '/marketing-web/videos/skillomate-primary-preview.mp4'

const DEMO_VIDEOS = [
  { src: PRIMARY_PREVIEW_VIDEO, title: 'Skillomate in action', meta: 'Primary preview' },
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

function ReelCard({
  demo,
  index,
  offset,
  active,
  playbackActive,
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
  playbackActive: boolean
  muted: boolean
  soundUnlocked: boolean
  onMutedChange: (muted: boolean) => void
  onSoundUnlocked: () => void
  onClick: () => void
  onEnded: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasVideoError, setHasVideoError] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const hasVideoIssue = hasVideoError || loadTimedOut
  const distance = Math.abs(offset)
  const hidden = distance > 2
  const translateX = offset * 58
  const translateY = active ? 0 : distance === 1 ? 30 : 58
  const rotateY = offset * -24
  const scale = active ? 1 : distance === 1 ? 0.7 : 0.52
  const opacity = active ? 1 : distance === 1 ? 0.5 : 0.16
  const effectiveMuted = muted || !soundUnlocked
  const shouldLoadVideo = !hidden

  useEffect(() => {
    setHasVideoError(false)
    setIsVideoReady(false)
    setLoadTimedOut(false)
    setUserPaused(false)
  }, [demo.src])

  const playVideo = useCallback((video: HTMLVideoElement, force = false) => {
    if (userPaused && !force) return
    video.muted = muted || !soundUnlocked
    video.play()
      .then(() => {
        if (soundUnlocked && !muted) video.muted = false
      })
      .catch(() => {
        if (muted) {
          return
        }

        video.muted = true
        video.play()
          .then(() => {
            if (soundUnlocked) video.muted = false
          })
          .catch(() => {})
      })
  }, [muted, soundUnlocked, userPaused])

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

    if (playbackActive) {
      if (userPaused) {
        video.pause()
        return
      }
      video.muted = effectiveMuted
      playVideo(video, true)
      return
    }

    video.pause()
  }, [demo.src, effectiveMuted, hasVideoIssue, isVideoReady, muted, playVideo, playbackActive, soundUnlocked, userPaused])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = effectiveMuted
    if (!muted && soundUnlocked && playbackActive && !video.paused) video.muted = false
  }, [effectiveMuted, muted, playbackActive, soundUnlocked])

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
    if (!video || !playbackActive || hasVideoIssue || userPaused) return
    playVideo(video)
  }

  return (
    <div
      role="button"
      tabIndex={hidden ? -1 : 0}
      onClick={() => {
        onClick()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
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
        {hasVideoIssue ? (
          <div className="absolute inset-0 bg-black" />
        ) : (
          <video
            ref={videoRef}
            autoPlay={playbackActive}
            muted={effectiveMuted}
            playsInline
            preload={active ? 'auto' : 'metadata'}
            onEnded={playbackActive ? onEnded : undefined}
            onError={() => setHasVideoError(true)}
            onLoadedData={handleVideoReady}
            onCanPlay={handleVideoReady}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {active && !hasVideoIssue && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleSound()
            }}
            aria-label={effectiveMuted ? 'Unmute video' : 'Mute video'}
            className="premium-reel-sound-button"
          >
            {effectiveMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        )}
      </div>
    </div>
  )
}

function ManualVideoCarousel() {
  const stageRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [soundUnlocked, setSoundUnlocked] = useState(false)
  const [stageInView, setStageInView] = useState(true)
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

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setStageInView(entry.isIntersecting && entry.intersectionRatio >= 0.35)
      },
      { threshold: [0, 0.35, 0.65] },
    )

    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

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

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(delta) < 12) return
    navigateWithThrottle(delta > 0 ? 'next' : 'previous')
  }, [navigateWithThrottle])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleDragEnd = (clientX: number) => {
    if (dragStartX.current === null) return
    const delta = dragStartX.current - clientX
    dragStartX.current = null
    if (Math.abs(delta) < 36) return
    navigateWithThrottle(delta > 0 ? 'next' : 'previous')
  }

  return (
    <div ref={stageRef} className="premium-reel-stage relative left-1/2 mt-0 w-screen max-w-none -translate-x-1/2 sm:left-auto sm:mx-auto sm:mt-6 sm:w-[min(98vw,680px)] sm:translate-x-0 lg:mt-0 lg:w-[620px] xl:w-[660px]">
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
        ref={viewportRef}
        className="premium-reel-viewport relative mx-auto h-[500px] w-full touch-pan-y cursor-grab active:cursor-grabbing sm:h-[615px] lg:h-[650px]"
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
              playbackActive={stageInView && index === activeIndex}
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

      <div className="premium-reel-mobile-cta sm:hidden">
        <p className="flex flex-col items-center text-center font-(family-name:--font-grotesk)">
          <span className="text-[23px] font-black leading-none tracking-[0.01em] text-white drop-shadow-[0_0_18px_rgba(224,173,75,0.26)]">
            AI influencer course
          </span>
          <span className="mt-1 self-end pr-2 text-[12px] font-semibold italic tracking-[0.16em] text-lime/90">
            by skillomate
          </span>
        </p>
        <p className="flex items-center justify-center gap-2 text-[13px] font-bold text-white/86 font-(family-name:--font-grotesk)">
          <span className="text-white/48 line-through decoration-white/52 decoration-2">{ORIGINAL_PRICE}</span>
          <span className="text-white">{OFFER_PRICE}</span>
          <span className="rounded-full border border-lime/25 bg-lime/12 px-2 py-0.5 text-[10px] font-black tracking-[0.12em] text-lime">
            {OFFER_DISCOUNT_PERCENT}% OFF
          </span>
        </p>
        <a
          href={SKILLOMATE_CHECKOUT_URL}
          className="btn-primary flex w-[min(86vw,330px)] items-center justify-center rounded-full px-4 py-3.5 text-sm font-bold shadow-[0_14px_34px_rgba(208,147,39,0.28)] font-(family-name:--font-grotesk)"
        >
          Subscribe Now — {OFFER_PRICE} →
        </a>
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-0 pb-2 pt-4 sm:pb-14 sm:pt-12 md:pb-18 lg:pt-14">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-dots opacity-35" />
      </div>

      <div className="container-xl relative !px-0 sm:!px-6">
        <div className="grid min-w-0 place-items-center sm:min-h-[calc(100svh-4rem)]">
          <h1 className="sr-only">Skillomate AI learning app preview</h1>
          <div className="relative z-10 w-full min-w-0 justify-self-center">
            <ManualVideoCarousel />
          </div>
        </div>
      </div>
    </section>
  )
}
