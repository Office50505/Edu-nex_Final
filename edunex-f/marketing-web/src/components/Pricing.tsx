'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check } from 'lucide-react'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

const INCLUDED = [
  'Step-by-step video courses',
  'Built-in AI assistant',
  'Lesson progress tracking',
  'Learning on mobile and web',
  'Certificate on eligible course completion',
]

export default function Pricing() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} id="pricing" className="section-gap relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-175 h-125 rounded-full animate-glow-pulse"
          style={{ background: 'radial-gradient(ellipse, rgba(208,147,39,0.11) 0%, transparent 100%)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute left-1/4 bottom-0 w-100 h-75 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(208,147,39,0.065) 0%, transparent 100%)', filter: 'blur(50px)' }}
        />
      </div>

      <div className="container-xl max-w-3xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Start your next skill{' '}
            <span className="text-gradient">with Skillomate.</span>
          </h2>
          <p className="text-gray-400 font-(family-name:--font-grotesk) text-[15px]">
            Get access to structured learning, guidance from your AI assistant, and a place to track your progress.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, delay: 0.15 }}
          className="glass-card-featured rounded-2xl overflow-hidden"
        >
          <div className="p-8 sm:p-10">
            <div className="mb-2">
              <h3 className="text-2xl font-bold text-white">Skillomate access</h3>
            </div>
            <p className="text-gray-400 text-sm mb-8 font-(family-name:--font-grotesk)">
              Start learning with Skillomate for ₹299.
            </p>

            <ul className="space-y-3.5 mb-10">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 font-(family-name:--font-grotesk)">
                  <span className="mt-0.5 shrink-0 w-4.5 h-4.5 rounded-full bg-lime/15 flex items-center justify-center">
                    <Check size={10} className="text-lime" strokeWidth={3} />
                  </span>
                  <span className="text-gray-300 text-sm leading-snug">{item}</span>
                </li>
              ))}
            </ul>

            {/* Price display */}
            <div className="flex items-end gap-3 mb-6">
              <span className="text-white text-5xl font-extrabold tracking-tight leading-none">₹299</span>
              <div className="pb-1">
                <p className="text-lime text-xs font-semibold font-(family-name:--font-grotesk)">Skillomate access</p>
              </div>
            </div>

            <motion.a
              href={SKILLOMATE_CHECKOUT_URL}
              whileHover={{ scale: 1.015, y: -1 }}
              whileTap={{ scale: 0.985 }}
              className="btn-primary block w-full py-4 text-[16px] text-center rounded-full font-(family-name:--font-grotesk)"
            >
              Start Learning for ₹299
            </motion.a>

            <p className="text-center text-gray-500 text-xs mt-3.5 font-(family-name:--font-grotesk)">
              External AI tools, paid plans, or credits may require separate payment.
            </p>
          </div>

        </motion.div>
      </div>
    </section>
  )
}
