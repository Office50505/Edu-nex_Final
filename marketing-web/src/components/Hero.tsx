'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown, ChevronUp, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

const VIDEO_CDN_BASE = (process.env.NEXT_PUBLIC_VIDEO_CDN_BASE || 'https://cdn.skillomate.com/videos').replace(/\/$/, '')

const cdnVideo = (fileName: string) => `${VIDEO_CDN_BASE}/${fileName}`

const DEMO_VIDEOS = [
  { src: cdnVideo('v16.mp4') },
  { src: cdnVideo('v12.mp4') },
  { src: cdnVideo('v20.mp4') },
  { src: cdnVideo('v22.mp4') },
  { src: cdnVideo('v15.mp4') },
]

const PROOF_POINTS = [
  'Beginner-friendly',
  'Hindi + English',
  'Mobile & web',
]

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
  onClick,
  onEnded,
}: {
  demo: (typeof DEMO_VIDEOS)[number]
  index: number
  offset: number
  active: boolean
  onClick: () => void
  onEnded: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasVideoError, setHasVideoError] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const hasVideoIssue = hasVideoError || loadTimedOut
  const distance = Math.abs(offset)
  const hidden = distance > 2
  const translateY = offset * 84
  const scale = active ? 1 : distance === 1 ? 0.74 : 0.58

  useEffect(() => {
    setHasVideoError(false)
    setIsVideoReady(false)
    setLoadTimedOut(false)
  }, [demo.src])

  useEffect(() => {
    if (!active || isVideoReady || hasVideoError) return

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true)
    }, 4500)

    return () => window.clearTimeout(timer)
  }, [active, hasVideoError, isVideoReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video || hasVideoIssue) return

    if (active) {
      video.muted = true
      setMuted(true)
      video.currentTime = 0
      video.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
      return
    }

    video.pause()
    setIsPlaying(false)
  }, [active, demo.src, hasVideoIssue])

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
      return
    }

    video.pause()
    setIsPlaying(false)
  }

  const toggleSound = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  return (
    <div
      role="button"
      tabIndex={hidden ? -1 : 0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      aria-label={`Select Skillomate preview video ${index + 1} of ${DEMO_VIDEOS.length}`}
      className={[
        'group absolute left-4 right-9 top-1/2 overflow-hidden rounded-2xl border text-left outline-none sm:left-5 sm:right-10',
        'transition-all duration-500 ease-out',
        active
          ? 'z-30 border-lime/75 bg-[#17130b] opacity-100 shadow-[0_30px_90px_rgba(0,0,0,0.48),0_0_46px_rgba(208,147,39,0.18)]'
          : 'z-10 border-white/10 bg-white/[0.035] opacity-45 hover:border-lime/35 hover:opacity-70',
        hidden ? 'pointer-events-none opacity-0' : '',
      ].join(' ')}
      style={{
        transform: `translateY(calc(-50% + ${translateY}%)) scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      <div className="relative aspect-[9/16]">
        {hasVideoIssue ? (
          <div className="absolute inset-0 flex flex-col justify-end bg-[radial-gradient(circle_at_50%_16%,rgba(208,147,39,0.22),transparent_34%),linear-gradient(160deg,#111827_0%,#090b10_48%,#171006_100%)] p-5">
            <div className="mb-16 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime font-(family-name:--font-grotesk)">
                Video unavailable
              </p>
              <p className="mt-3 text-2xl font-bold leading-tight text-white">Skillomate preview</p>
              <p className="mt-2 text-sm leading-relaxed text-white/62 font-(family-name:--font-grotesk)">
                Add the correct CDN file for this Skillomate preview video.
              </p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={demo.src}
            autoPlay={active}
            muted
            playsInline
            preload={active ? 'auto' : 'metadata'}
            onEnded={active ? onEnded : undefined}
            onError={() => setHasVideoError(true)}
            onLoadedData={() => setIsVideoReady(true)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/82 via-black/12 to-black/25" />

        {active && !isVideoReady && !hasVideoIssue && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-md font-(family-name:--font-grotesk)">
              Loading video
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

        <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2">
          <span className="rounded-sm bg-lime px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black">
            Preview
          </span>
          <span className="rounded border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-bold text-white/80 backdrop-blur-sm">
            {index + 1} of {DEMO_VIDEOS.length}
          </span>
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-base font-bold text-white">Skillomate preview</p>
            <p className="mt-1 text-xs font-medium text-white/62 font-(family-name:--font-grotesk)">
              {index + 1} of {DEMO_VIDEOS.length}
            </p>
          </div>

          {active && !hasVideoIssue && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  togglePlayback()
                }}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md transition-colors hover:border-lime/50 hover:text-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70"
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" strokeWidth={0} />}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  toggleSound()
                }}
                aria-label={muted ? 'Unmute video' : 'Mute video'}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md transition-colors hover:border-lime/50 hover:text-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70"
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ManualVideoCarousel() {
  const [activeIndex, setActiveIndex] = useState(0)
  const lastNavigationAt = useRef(0)
  const dragStartY = useRef<number | null>(null)

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
    if (Math.abs(event.deltaY) < 12) return
    navigateWithThrottle(event.deltaY > 0 ? 'next' : 'previous')
  }

  const handleDragEnd = (clientY: number) => {
    if (dragStartY.current === null) return
    const delta = dragStartY.current - clientY
    dragStartY.current = null
    if (Math.abs(delta) < 36) return
    navigateWithThrottle(delta > 0 ? 'next' : 'previous')
  }

  return (
    <div className="relative mx-auto w-full max-w-[270px] sm:max-w-[330px] lg:max-w-[340px]">
      <div className="absolute left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-3">
          <button
            type="button"
            onClick={previous}
            aria-label="Previous reel"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur-md transition-colors hover:border-lime/50 hover:text-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70 sm:h-11 sm:w-11 sm:bg-white/[0.04]"
          >
            <ChevronUp size={19} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next reel"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur-md transition-colors hover:border-lime/50 hover:text-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70 sm:h-11 sm:w-11 sm:bg-white/[0.04]"
          >
            <ChevronDown size={19} />
          </button>
      </div>

      <div
        className="relative mx-auto h-[420px] w-full touch-pan-y overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1119]/90 shadow-[0_30px_90px_rgba(0,0,0,0.32)] cursor-grab active:cursor-grabbing sm:h-[540px] lg:h-[560px]"
        onWheel={handleWheel}
        onTouchStart={(event) => { dragStartY.current = event.touches[0]?.clientY ?? null }}
        onTouchEnd={(event) => { handleDragEnd(event.changedTouches[0]?.clientY ?? 0) }}
        onPointerDown={(event) => { dragStartY.current = event.clientY }}
        onPointerUp={(event) => { handleDragEnd(event.clientY) }}
        onPointerCancel={() => { dragStartY.current = null }}
      >
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/[0.06] via-transparent to-lime/[0.08]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-24 bg-linear-to-b from-[#0d1119] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-24 bg-linear-to-t from-[#0d1119] to-transparent" />

        <div className="absolute left-4 top-4 z-50 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-bold text-white/75 backdrop-blur-sm font-(family-name:--font-grotesk)">
          {activeIndex + 1} / {DEMO_VIDEOS.length}
        </div>

        <div className="absolute right-4 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2">
          {DEMO_VIDEOS.map((demo, index) => (
            <button
              key={demo.src}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show Skillomate preview video ${index + 1}`}
              className={[
                'w-2.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70',
                activeIndex === index ? 'h-8 bg-lime' : 'h-2.5 bg-white/25 hover:bg-white/45',
              ].join(' ')}
            />
          ))}
        </div>

        <div className="relative h-full">
          {DEMO_VIDEOS.map((demo, index) => (
            <ReelCard
              key={demo.src}
              demo={demo}
              index={index}
              offset={getReelOffset(index, activeIndex)}
              active={index === activeIndex}
              onClick={() => setActiveIndex(index)}
              onEnded={next}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-0 pb-14 pt-6 sm:pt-10 md:pb-18">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute left-1/2 top-0 h-130 w-210 -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(208,147,39,0.13) 0%, transparent 68%)', filter: 'blur(70px)' }}
        />
        <div className="absolute inset-0 bg-dots opacity-35" />
      </div>

      <div className="container-xl relative">
        <div className="grid min-h-[calc(100svh-4rem)] min-w-0 items-center gap-8 sm:gap-10 lg:grid-cols-[minmax(0,560px)_minmax(340px,380px)] lg:justify-center lg:gap-20 xl:gap-24">
          <div className="mx-auto min-w-0 max-w-[320px] text-center sm:max-w-2xl lg:mx-0 lg:max-w-[560px] lg:text-left">
            <h1
              className="text-[2.35rem] font-bold leading-[0.96] text-white min-[390px]:text-[2.65rem] sm:text-[clamp(3.3rem,8vw,5.2rem)] sm:leading-[0.98] lg:text-[clamp(4.1rem,5.4vw,5.15rem)]"
            >
              <span className="block">Learn AI</span>
              <span className="block text-gradient-static">with Skillomate.</span>
            </h1>

            <p
              className="mx-auto mt-4 max-w-[330px] text-[13px] leading-relaxed text-gray-400 sm:mt-6 sm:max-w-xl sm:text-lg lg:mx-0 font-(family-name:--font-grotesk)"
            >
              Practical AI courses, guided projects, video lessons, progress tracking, and an AI assistant inside one learning app.
            </p>

            <div
              className="mt-4 flex flex-col items-center justify-center gap-2.5 sm:mt-7 sm:flex-row sm:gap-3 lg:justify-start"
            >
              <motion.a
                href={SKILLOMATE_CHECKOUT_URL}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-sm font-bold sm:px-8 sm:py-4 sm:text-base font-(family-name:--font-grotesk)"
              >
                Start Learning for ₹299
                <ArrowRight size={18} />
              </motion.a>
              <a
                href="#app-preview"
                className="inline-flex items-center justify-center rounded-full border border-white/12 px-7 py-3.5 text-sm font-bold text-white/78 transition-colors hover:border-lime/45 hover:text-lime sm:px-8 sm:py-4 sm:text-base font-(family-name:--font-grotesk)"
              >
                See Skillomate in Action
              </a>
            </div>

            <div
              className="mx-auto mt-6 hidden max-w-2xl flex-col items-center justify-center gap-2 text-xs text-gray-400 sm:flex sm:flex-row sm:flex-wrap sm:gap-x-5 lg:mx-0 lg:justify-start font-(family-name:--font-grotesk)"
            >
              {PROOF_POINTS.map((point) => (
                <span key={point} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                  {point}
                </span>
              ))}
            </div>
          </div>

          <div className="relative min-w-0 justify-self-center lg:justify-self-end">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[86%] w-[112%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80"
              style={{ background: 'radial-gradient(ellipse, rgba(208,147,39,0.18) 0%, transparent 68%)', filter: 'blur(46px)' }}
            />
            <ManualVideoCarousel />
          </div>
        </div>
      </div>
    </section>
  )
}
