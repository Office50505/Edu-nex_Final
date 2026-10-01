'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Bot, GraduationCap, ListChecks } from 'lucide-react'

const PREVIEWS = [
  {
    icon: GraduationCap,
    title: 'Know where to begin.',
    description: 'Explore a course and follow its lessons in a clear order.',
    asset: 'Course and lesson list screen',
  },
  {
    icon: Bot,
    title: 'Make room for questions.',
    description: 'Get help understanding what you are learning without leaving the app.',
    asset: 'Built-in AI assistant screen',
  },
  {
    icon: ListChecks,
    title: 'Pick up where you left off.',
    description: 'Track completed lessons and continue your learning journey.',
    asset: 'Learning progress screen',
  },
]

export default function BeforeAfterSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} id="app-preview" className="section-gap">
      <div className="container-xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center"
        >
          <h2 className="text-4xl font-bold text-white sm:text-5xl">
            Take a look inside{' '}
            <span className="text-gradient">Skillomate.</span>
          </h2>
          <p className="mt-4 text-gray-400 font-(family-name:--font-grotesk)">
            Your courses, learning assistant, and progress—together in one place.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PREVIEWS.map((preview, index) => {
            const Icon = preview.icon

            return (
              <motion.article
                key={preview.title}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="glass-card rounded-2xl p-5"
              >
                <div className="relative mb-5 flex aspect-[9/16] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/35">
                  <div className="absolute inset-0 bg-linear-to-br from-lime/10 via-transparent to-white/5" />
                  <div className="relative max-w-[220px] px-5 text-center">
                    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-lime/25 bg-lime/10 text-lime">
                      <Icon size={22} />
                    </span>
                    <p className="text-sm font-bold text-white">{preview.asset}</p>
                    <p className="mt-2 text-xs leading-relaxed text-gray-500 font-(family-name:--font-grotesk)">
                      Real app screenshot needed.
                    </p>
                  </div>
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
