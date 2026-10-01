'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Quote } from 'lucide-react'

interface Testimonial {
  name: string
  role: string
  company: string
  text: string
  result: string
  initials: string
  bg: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Sarah Chen',
    role: 'Chief Marketing Officer',
    company: 'TechFlow',
    text: "EduNex completely transformed our marketing ROI. Within 60 days we saw a 3x increase in attributed revenue without touching our budget. It's the closest thing to a magic marketing button I've ever seen.",
    result: '3x revenue in 60 days',
    initials: 'SC',
    bg: '#0d9488',
  },
  {
    name: 'Marcus Rodriguez',
    role: 'VP of Marketing',
    company: 'Scalex',
    text: 'The predictive lead scoring alone was worth the subscription. Our sales team now spends 80% of their time on the top 20% of leads — and our close rates have never been higher.',
    result: '+187% campaign performance',
    initials: 'MR',
    bg: '#7c3aed',
  },
  {
    name: 'Emily Watson',
    role: 'Head of Demand Gen',
    company: 'GrowthBase',
    text: "Finally, an attribution model that actually works across our entire funnel. I can now walk into board meetings with clear proof of marketing's revenue contribution. EduNex made me look like a genius.",
    result: 'Full-funnel attribution unlocked',
    initials: 'EW',
    bg: '#0284c7',
  },
  {
    name: 'David Park',
    role: 'Founder & CEO',
    company: 'LaunchPad',
    text: "We doubled our qualified leads in the first month. The AI is eerily good at figuring out which audiences are ready to buy. Our CAC dropped 43% and we didn't change a single targeting parameter ourselves.",
    result: '2x qualified leads, -43% CAC',
    initials: 'DP',
    bg: '#b45309',
  },
  {
    name: 'Jessica Miller',
    role: 'CMO',
    company: 'DataBridge',
    text: "Best marketing investment we've ever made, full stop. EduNex pays for itself within the first week of the month every single month. I've recommended it to every CMO I know.",
    result: '10x ROI on subscription cost',
    initials: 'JM',
    bg: '#be185d',
  },
  {
    name: 'Alex Thompson',
    role: 'Marketing Lead',
    company: 'OrbitalHQ',
    text: 'The multi-channel automation is a game changer. We used to have three specialists managing campaigns on each channel. Now one junior marketer oversees everything and performance is up across the board.',
    result: 'Reduced team spend by 60%',
    initials: 'AT',
    bg: '#1d4ed8',
  },
]

function StarRating({ n = 5 }: { n?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="#eab308">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

function TestimonialCard({ t, index }: { t: Testimonial; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay: (index % 3) * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="group glass-card rounded-2xl p-7 border border-white/[0.07] hover:border-white/15 transition-all duration-400 flex flex-col relative overflow-hidden"
    >
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 0%, rgba(234,179,8,0.04), transparent 70%)' }} />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Top row */}
        <div className="flex items-start justify-between mb-5">
          <StarRating />
          <Quote size={18} className="text-[#eab308]/30 shrink-0" />
        </div>

        {/* Quote */}
        <p className="text-sm text-gray-300 leading-relaxed flex-1 mb-6 italic">
          &ldquo;{t.text}&rdquo;
        </p>

        {/* Result badge */}
        <div className="px-3 py-1.5 rounded-lg bg-[#eab308]/10 border border-[#eab308]/20 text-[11px] font-bold text-[#eab308] mb-5 self-start">
          ✦ {t.result}
        </div>

        {/* Profile */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: t.bg }}
          >
            {t.initials}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{t.name}</div>
            <div className="text-xs text-gray-500">{t.role} · {t.company}</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Testimonials() {
  const headRef = useRef(null)
  const inView = useInView(headRef, { once: true, margin: '-100px' })

  return (
    <section className="relative section-pad overflow-hidden">
      {/* Subtle gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(234,179,8,0.025), transparent 60%)',
        }}
      />

      <div className="container-xl relative z-10">
        {/* Header */}
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#eab308] mb-4 block">
            Customer Stories
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            Loved by the teams
            <br />
            <span className="text-gradient">driving real revenue</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Don&apos;t take our word for it. Here&apos;s what our customers say after their
            first 90 days with EduNex.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={t.name} t={t} index={i} />
          ))}
        </div>

        {/* Bottom trust bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-6 md:gap-10 text-center"
        >
          {[
            { val: '4.9/5', label: 'on G2' },
            { val: '4.8/5', label: 'on Capterra' },
            { val: '#1', label: 'AI Marketing Tool' },
            { val: '10K+', label: 'Reviews' },
          ].map(({ val, label }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="text-2xl font-extrabold text-gray-900">{val}</span>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
