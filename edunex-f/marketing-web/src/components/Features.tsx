'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  Wand2,
  BarChart3,
  Target,
  Brain,
  Layers,
  FlaskConical,
  ArrowRight,
} from 'lucide-react'
import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

interface Feature {
  icon: React.ReactNode
  label: string
  title: string
  description: string
  accent?: boolean
}

const FEATURES: Feature[] = [
  {
    icon: <Wand2 size={22} />,
    label: 'Creation',
    title: 'AI Campaign Builder',
    description:
      'Generate high-converting campaigns in seconds. EduNex writes copy, selects audiences, and sets bidding strategies — all driven by your revenue goals.',
    accent: true,
  },
  {
    icon: <BarChart3 size={22} />,
    label: 'Analytics',
    title: 'Revenue Analytics',
    description:
      'Real-time dashboards that connect every marketing touchpoint to actual revenue. Know exactly which campaigns drive growth and which drain budget.',
  },
  {
    icon: <Target size={22} />,
    label: 'Segmentation',
    title: 'Smart Segmentation',
    description:
      'AI-powered audience segments that update automatically as behaviour changes. Target the right people with the right message at the right moment.',
  },
  {
    icon: <Brain size={22} />,
    label: 'Scoring',
    title: 'Predictive Lead Scoring',
    description:
      'Rank every lead by purchase likelihood using hundreds of behavioural signals. Focus your team where it matters and watch conversion rates soar.',
  },
  {
    icon: <Layers size={22} />,
    label: 'Automation',
    title: 'Multi-Channel Automation',
    description:
      'Coordinate email, SMS, paid ads, and social from a single AI brain. Campaigns adapt in real time based on which channel is performing best.',
  },
  {
    icon: <FlaskConical size={22} />,
    label: 'Optimisation',
    title: 'A/B Testing Engine',
    description:
      'Automatically generate, run, and evaluate experiments across every campaign variable. Ship only winning variants and compoundd growth over time.',
  },
]

/* ─── Feature card ───────────────────────────────────────────────────────── */
function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay: (index % 3) * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative glass-card rounded-2xl p-7 border transition-all duration-400 overflow-hidden cursor-default ${
        feature.accent
          ? 'border-[#eab308]/20 hover:border-[#eab308]/45'
          : 'border-white/[0.07] hover:border-white/15'
      }`}
    >
      {/* Corner glow on hover */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(234,179,8,0.12), transparent 70%)' }}
      />

      {/* Shimmer on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none overflow-hidden rounded-2xl">
        <div className="shimmer-overlay" />
      </div>

      <div className="relative z-10">
        {/* Label */}
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#eab308]/70 mb-4 block">
          {feature.label}
        </span>

        {/* Icon */}
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 ${
            feature.accent
              ? 'bg-[#eab308]/15 text-[#eab308] group-hover:bg-[#eab308]/25'
              : 'bg-white/[0.06] text-gray-300 group-hover:bg-white/[0.1] group-hover:text-[#eab308]'
          }`}
        >
          {feature.icon}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 mb-3 group-hover:text-[#eab308] transition-colors duration-300">
          {feature.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-400 leading-relaxed mb-5">
          {feature.description}
        </p>

        {/* Learn more */}
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 group-hover:text-[#eab308] transition-colors duration-300">
          Learn more
          <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform duration-200" />
        </span>
      </div>
    </motion.div>
  )
}

/* ─── Section ────────────────────────────────────────────────────────────── */
export default function Features() {
  const headRef = useRef(null)
  const inView = useInView(headRef, { once: true, margin: '-100px' })

  return (
    <section id="features" className="relative section-pad overflow-hidden">
      {/* Soft background accent */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(234,179,8,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="container-xl relative z-10">
        {/* Header */}
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#eab308] mb-4 block">
            Platform Features
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            Everything you need to
            <br />
            <span className="text-gradient">dominate your market</span>
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed">
            One AI platform that replaces five tools. From campaign creation to
            revenue attribution, EduNex handles the entire marketing stack.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="text-center mt-12"
        >
          <a
            href={SKILLOMATE_CHECKOUT_URL}
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-[#eab308] transition-colors font-medium"
          >
            See all features in the docs
            <ArrowRight size={14} />
          </a>
        </motion.div>
      </div>
    </section>
  )
}
