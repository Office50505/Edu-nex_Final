'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

export default function StickyBar() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const fn = () => setVisible(window.scrollY > 600)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="fixed bottom-0 inset-x-0 z-50 bg-bg/94 backdrop-blur-2xl border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.28)]"
        >
          <div className="container-xl py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-2 h-2 rounded-full bg-lime animate-pulse shrink-0" />
                <span className="text-gray-200 font-semibold text-sm hidden sm:inline font-(family-name:--font-grotesk)">
                  Skillomate
                </span>
                <span className="text-gray-400 text-xs hidden md:inline font-(family-name:--font-grotesk)">
                  — Learn practical AI skills, step by step
                </span>
              </div>
              <a
                href={SKILLOMATE_CHECKOUT_URL}
                className="btn-primary shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold font-(family-name:--font-grotesk)"
              >
                Start Learning — ₹299 →
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
