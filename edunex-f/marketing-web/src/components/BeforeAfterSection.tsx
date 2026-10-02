'use client'

import type Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

const PRIMARY_PREVIEW_VIDEO = '/marketing-web/videos/skillomate-primary-preview.mp4'

const PREVIEWS = [
  {
    title: 'Know where to begin.',
    description: 'Explore a course and follow its lessons in a clear order.',
    asset: 'Primary Skillomate preview',
    videoSrc: PRIMARY_PREVIEW_VIDEO,
  },
  {
    title: 'Make room for questions.',
    description: 'Get help understanding what you are learning without leaving the app.',
    asset: 'Built-in AI assistant screen',
    videoSrc: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/13/v1/13.m3u8',
  },
  {
    title: 'Pick up where you left off.',
    description: 'Track completed lessons and continue your learning journey.',
    asset: 'Learning progress screen',
    videoSrc: 'https://d2vntxz4x493rp.cloudfront.net/landing-page/marketing-videos/20/v1/20.m3u8',
  },
]

function PreviewVideo({
  src,
  label,
  active,
}: {
  src: string
  label: string
  active: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !active) return

    let stopped = false
    let hls: Hls | null = null
    const isHls = /\.m3u8(?:[?#]|$)/i.test(src)
    const canPlayNativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'))

    const markFailed = () => {
      if (!stopped) setFailed(true)
    }

    setReady(false)
    setFailed(false)
    video.pause()
    video.removeAttribute('src')
    video.load()

    if (!isHls || canPlayNativeHls) {
      video.src = src
      video.load()
      video.play().catch(() => {})

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
          markFailed()
          return
        }

        hls = new Hls({
          enableWorker: true,
          maxBufferLength: 12,
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) markFailed()
        })
        hls.loadSource(src)
        hls.attachMedia(video)
        video.play().catch(() => {})
      })
      .catch(markFailed)

    return () => {
      stopped = true
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [active, src])

  return (
    <>
      <video
        ref={videoRef}
        aria-label={label}
        muted
        loop
        playsInline
        preload="metadata"
        onCanPlay={() => {
          setReady(true)
          videoRef.current?.play().catch(() => {})
        }}
        onError={() => setFailed(true)}
        className={[
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
          ready && !failed ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/18 to-black/18" />
    </>
  )
}

export default function BeforeAfterSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} id="app-preview" className="section-gap">
      <div className="container-xl max-w-[370px] sm:max-w-[1200px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-8 max-w-2xl text-center sm:mb-12"
        >
          <h2 className="text-[34px] font-bold leading-tight text-white sm:text-5xl">
            Take a look inside{' '}
            <span className="text-gradient">Skillomate.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[300px] text-gray-400 font-(family-name:--font-grotesk) sm:mt-4 sm:max-w-none">
            Your courses, learning assistant, and progress—together in one place.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PREVIEWS.map((preview, index) => {
            return (
              <motion.article
                key={preview.title}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="glass-card rounded-2xl p-4 sm:p-5"
              >
                <div className="relative mb-4 flex aspect-[9/16] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/35 sm:mb-5">
                  <div className="absolute inset-0 bg-linear-to-br from-lime/10 via-transparent to-white/5" />
                  <PreviewVideo
                    src={preview.videoSrc}
                    label={`${preview.asset} preview video`}
                    active={inView}
                  />
                </div>

                <h3 className="text-xl font-bold text-white">{preview.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400 font-(family-name:--font-grotesk)">
                  {preview.description}
                </p>
              </motion.article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
