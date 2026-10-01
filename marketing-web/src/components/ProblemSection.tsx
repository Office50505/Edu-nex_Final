'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { MessageCircle, PlayCircle } from 'lucide-react'

export default function ProblemSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="section-gap">
      <div className="container-xl">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white">
            A clearer way to{' '}
            <span className="text-gradient">learn AI.</span>
          </h2>
          <p className="mt-4 text-gray-400 text-lg max-w-2xl mx-auto font-(family-name:--font-grotesk)">
            A place to start, lessons to follow, and guidance when you need it.
          </p>
        </motion.div>

        {/* Comparison panel */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, delay: 0.15 }}
          className="glass-card-featured rounded-2xl overflow-hidden"
        >
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-lime/25 bg-lime/10 text-lime">
                  <PlayCircle size={19} />
                </span>
                <span className="text-gray-500 text-sm font-(family-name:--font-grotesk)">Structured video courses</span>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-white/10 mb-6 bg-black/40 p-6">
                <div className="absolute inset-0 bg-linear-to-br from-lime/10 via-transparent to-white/5 pointer-events-none" />
                <h3 className="relative text-2xl font-bold text-white mb-3">Learn step by step.</h3>
                <p className="relative text-sm text-gray-400 font-(family-name:--font-grotesk) leading-relaxed">
                  Follow structured video lessons that break down AI tools and techniques into manageable steps. Revisit a topic whenever you need another look.
                </p>
              </div>

              <p className="text-lime text-sm font-bold font-(family-name:--font-grotesk)">
                Follow the lesson. Try the technique.
              </p>
            </div>

            <div className="flex-1 p-8 lg:p-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-lime/25 bg-lime/10 text-lime">
                  <MessageCircle size={19} />
                </span>
                <span className="text-gray-500 text-sm font-(family-name:--font-grotesk)">Built-in AI assistant</span>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-lime/20 mb-6 bg-black/40 p-6"
                style={{ boxShadow: '0 0 20px rgba(208,147,39,0.1)' }}>
                <div className="absolute inset-0 bg-linear-to-br from-lime/12 via-transparent to-white/6 pointer-events-none" />
                <h3 className="relative text-2xl font-bold text-white mb-3">Ask as you learn.</h3>
                <p className="relative text-sm text-gray-300 font-(family-name:--font-grotesk) leading-relaxed">
                  Use the built-in AI assistant to ask questions about lessons, understand concepts, and get help with the tools you&apos;re learning.
                </p>
              </div>

              <p className="text-lime text-sm font-bold font-(family-name:--font-grotesk)">
                Get an explanation. Keep learning.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
