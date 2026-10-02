'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { TrendingUp, Users, Award, Star } from 'lucide-react'

/* ─── Animated counter hook ──────────────────────────────────────────────── */
function useCounter(target: number, duration = 2200, started = false) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!started) return
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [started, target, duration])

  return value
}

/* ─── Stat card ──────────────────────────────────────────────────────────── */
interface StatProps {
  icon: React.ReactNode
  prefix?: string
  value: number
  suffix: string
  decimals?: number
  label: string
  description: string
  delay: number
}

function StatCard({ icon, prefix = '', value, suffix, decimals = 0, label, description, delay }: StatProps) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const count = useCounter(value, 2400, inView)

  const displayValue =
    decimals > 0
      ? (count / Math.pow(10, decimals)).toFixed(1)
      : count.toLocaleString()

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative group glass-card rounded-2xl p-8 border border-white/[0.07] hover:border-[#eab308]/25 transition-all duration-500 overflow-hidden"
    >
      {/* hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{ background: 'radial-gradient(circle at 50% 0%, rgba(234,179,8,0.06), transparent 70%)' }} />

      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-[#eab308]/10 border border-[#eab308]/20 flex items-center justify-center mb-5">
          {icon}
        </div>

        <div className="text-[2.6rem] font-extrabold text-white tracking-tight leading-none mb-2">
          {prefix}{displayValue}{suffix}
        </div>

        <div className="text-base font-semibold text-gray-900 mb-1.5">{label}</div>
        <div className="text-sm text-gray-500 leading-relaxed">{description}</div>
      </div>
    </motion.div>
  )
}

/* ─── Section ────────────────────────────────────────────────────────────── */
const STATS: StatProps[] = [
  {
    icon: <TrendingUp size={18} className="text-[#eab308]" />,
    prefix: '$',
    value: 24,
    suffix: 'B+',
    decimals: 1,
    label: 'Revenue Generated',
    description: 'Total attributed revenue driven by EduNex campaigns globally.',
    delay: 0,
  },
  {
    icon: <Users size={18} className="text-[#eab308]" />,
    value: 50000,
    suffix: '+',
    label: 'Marketing Teams',
    description: 'Growing companies rely on EduNex to run their marketing engine.',
    delay: 0.1,
  },
  {
    icon: <Award size={18} className="text-[#eab308]" />,
    value: 98,
    suffix: '%',
    label: 'Success Rate',
    description: 'Of customers report hitting their revenue targets within 90 days.',
    delay: 0.2,
  },
  {
    icon: <Star size={18} className="text-[#eab308]" />,
    value: 49,
    suffix: '/5',
    decimals: 1,
    label: 'Average Rating',
    description: 'Rated across G2, Capterra, and ProductHunt by verified users.',
    delay: 0.3,
  },
]

export default function SocialProof() {
  const headRef = useRef(null)
  const headInView = useInView(headRef, { once: true, margin: '-100px' })

  return (
    <section className="relative section-pad overflow-hidden">
      {/* Subtle divider glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)' }}
      />

      <div className="container-xl">
        {/* Header */}
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 30 }}
          animate={headInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#eab308] mb-4 block">
            By the Numbers
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
            Proven results,<br />
            <span className="text-gradient">not just promises</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Real metrics from real companies using EduNex to grow their revenue.
          </p>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </div>
    </section>
  )
}
