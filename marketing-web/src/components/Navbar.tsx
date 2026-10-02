'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import Image from 'next/image'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

const MARKETING_BASE_PATH = '/marketing-web'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className="relative">
      <header
        className={`transition-all duration-300 ${
          scrolled
            ? 'bg-bg/94 backdrop-blur-2xl border-b border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.22)]'
            : 'bg-bg/90 backdrop-blur-xl border-b border-white/5'
        }`}
      >
        <div className="container-xl">
          <div className="flex items-center justify-between h-16">
            <a href="#" className="flex items-center" aria-label="Skillomate home">
              <Image
                src={`${MARKETING_BASE_PATH}/skillomate-logo-navbar.png`}
                alt="Skillomate"
                width={180}
                height={60}
                className="h-8 w-auto object-contain sm:h-9"
                priority
              />
            </a>

            <a
              href={SKILLOMATE_CHECKOUT_URL}
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold font-(family-name:--font-grotesk) btn-primary"
            >
              Start Learning — ₹299
            </a>

            <button
              onClick={() => setOpen(v => !v)}
              className="sm:hidden p-2 text-gray-300 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute top-full inset-x-0 z-40 bg-bg/96 backdrop-blur-2xl border-b border-white/10 px-6 py-5 sm:hidden"
          >
            <a
              href={SKILLOMATE_CHECKOUT_URL}
              onClick={() => setOpen(false)}
              className="block w-full py-3.5 rounded-full text-sm font-bold text-center font-(family-name:--font-grotesk) btn-primary"
            >
              Start Learning — ₹299
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
