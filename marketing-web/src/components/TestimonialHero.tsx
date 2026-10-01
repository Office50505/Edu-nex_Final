'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

export default function TestimonialHero() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="section-gap">
      <div className="container-xl max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          {/* Quote mark */}
          <div className="text-[#FF6B2B] text-6xl font-bold leading-none mb-6 font-[family-name:var(--font-playfair)]">&ldquo;</div>

          {/* Quote */}
          <blockquote className="text-2xl sm:text-3xl md:text-4xl font-bold italic text-gray-900 leading-snug mb-10">
            I was spending ₹35,000 a month on a freelance agency. After this platform,
            I made 40 campaign variations in one weekend. My ROAS went from 1.8x to 4.1x —
            not because the ads were magically better, but because I could finally{' '}
            <em className="text-[#FF6B2B]">test enough to find what actually worked.</em>{' '}
            Agency is cancelled.
          </blockquote>

          {/* Attribution */}
          <div className="font-[family-name:var(--font-grotesk)]">
            <p className="text-gray-900 font-semibold text-base">— Arjun Mehta</p>
            <p className="text-gray-400 text-sm mt-1">D2C skincare brand on Shopify · Bengaluru</p>
          </div>

          {/* Divider */}
          <div className="mt-12 flex items-center justify-center gap-4 text-gray-300">
            <div className="h-px flex-1 max-w-[100px] bg-white/10" />
            <p className="text-sm font-[family-name:var(--font-grotesk)] text-gray-400 italic">
              The gap between who has this skill and who doesn&apos;t is growing every month.
              I&apos;d rather you be on the right side of it.
            </p>
            <div className="h-px flex-1 max-w-[100px] bg-white/10" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
