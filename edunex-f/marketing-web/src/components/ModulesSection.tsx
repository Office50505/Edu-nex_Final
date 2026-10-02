'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Clock, MonitorSmartphone } from 'lucide-react'
import { publishedCourses, upcomingCourses } from '@/data/courses'

export default function ModulesSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} id="courses" className="section-gap">
      <div className="container-xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center"
        >
          <span className="mb-5 inline-block rounded-full border border-white/10 px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-gray-500 font-(family-name:--font-grotesk)">
            Courses
          </span>
          <h2 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
            Find your{' '}
            <em className="text-lime not-italic">next skill.</em>
          </h2>
          <p className="text-gray-400 font-(family-name:--font-grotesk)">
            Explore the courses available in Skillomate and choose where you want to begin.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {publishedCourses.map((course, index) => (
            <motion.article
              key={course.slug}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="glass-card-featured rounded-2xl p-6 sm:p-7"
            >
              <div className="flex flex-col gap-6 sm:flex-row">
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/35 sm:w-52 sm:shrink-0">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(208,147,39,0.18),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.06),transparent)]" />
                  <div className="relative text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime font-(family-name:--font-grotesk)">
                      Course
                    </p>
                    <p className="mt-2 text-lg font-bold text-white">AI</p>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-lime/20 bg-lime/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-lime font-(family-name:--font-grotesk)">
                      Available
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-gray-400 font-(family-name:--font-grotesk)">
                      <MonitorSmartphone size={12} />
                      {course.access}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-gray-400 font-(family-name:--font-grotesk)">
                      <Clock size={12} />
                      {course.language}
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold text-white">{course.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-400 font-(family-name:--font-grotesk)">
                    {course.description}
                  </p>

                  <a
                    href={course.href}
                    className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-2.5 text-sm font-bold text-white/80 transition-colors hover:border-lime/45 hover:text-lime font-(family-name:--font-grotesk)"
                  >
                    Explore Course
                    <ArrowRight size={15} />
                  </a>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        {upcomingCourses.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {upcomingCourses.map((course) => (
              <article key={course.slug} className="glass-card rounded-2xl p-6 opacity-80">
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 font-(family-name:--font-grotesk)">
                  Upcoming
                </span>
                <h3 className="mt-4 text-xl font-bold text-white">{course.title}</h3>
                <p className="mt-2 text-sm text-gray-400 font-(family-name:--font-grotesk)">
                  {course.description}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
