'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

export default function FinalCTA() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="relative section-pad overflow-hidden">

      {/* Background glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(234,179,8,0.07) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-20 blur-[80px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(234,179,8,0.5), transparent 60%)' }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="container-xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full border border-[#eab308]/20 mb-8"
          >
            <Sparkles size={13} className="text-[#eab308]" />
            <span className="text-sm text-gray-300">Join 50,000+ teams already growing</span>
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.75, delay: 0.15 }}
            className="text-[clamp(2.4rem,6vw,4.5rem)] font-extrabold leading-[1.05] tracking-[-0.03em] mb-6"
          >
            <span className="text-gray-900">Ready to 10x your</span>
            <br />
            <span className="text-gradient">marketing revenue?</span>
          </motion.h2>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.22 }}
            className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Start your free 14-day trial today. No credit card required, no
            engineers needed, no long-term contracts. Just measurable revenue
            growth.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <motion.a
              href={SKILLOMATE_CHECKOUT_URL}
              whileHover={{ scale: 1.04, boxShadow: '0 0 50px rgba(234,179,8,0.5)' }}
              whileTap={{ scale: 0.97 }}
              className="group inline-flex items-center gap-2.5 px-10 py-4 bg-[#eab308] text-black font-black text-base rounded-xl glow-gold transition-all"
            >
              Start Learning for ₹299
              <ArrowRight
                size={18}
                className="group-hover:translate-x-1 transition-transform duration-200"
              />
            </motion.a>
            <motion.a
              href="#"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2.5 px-10 py-4 glass border border-white/10 rounded-xl text-gray-900 font-bold hover:border-[#eab308]/30 transition-all"
            >
              Book a Demo
            </motion.a>
          </motion.div>

          {/* Social proof strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="flex flex-wrap items-center justify-center gap-8 text-sm text-gray-500"
          >
            {[
              'No credit card required',
              'Setup in under 30 minutes',
              'Cancel anytime',
              'Lifetime updates included',
            ].map((text, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#eab308]" />
                {text}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
