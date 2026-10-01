'use client'

import { useRef } from 'react'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import { Database, SlidersHorizontal, Rocket, BarChart3 } from 'lucide-react'

interface Step {
  number: string
  icon: React.ReactNode
  title: string
  description: string
  detail: string[]
}

const STEPS: Step[] = [
  {
    number: '01',
    icon: <Database size={22} />,
    title: 'Connect Your Data',
    description: 'Plug in your CRM, ad platforms, and website analytics in minutes with one-click integrations.',
    detail: ['Salesforce & HubSpot', 'Google & Meta Ads', 'Segment & Mixpanel'],
  },
  {
    number: '02',
    icon: <SlidersHorizontal size={22} />,
    title: 'Configure Your AI',
    description: 'Set your revenue goals and let EduNex train a custom model on your historical data.',
    detail: ['Define KPIs & targets', 'AI model auto-trains', 'Audience discovery'],
  },
  {
    number: '03',
    icon: <Rocket size={22} />,
    title: 'Launch Campaigns',
    description: 'Deploy AI-optimised campaigns across every channel — copy, creative, and bids auto-generated.',
    detail: ['Multi-channel deploy', 'AI-written ad copy', 'Smart budget allocation'],
  },
  {
    number: '04',
    icon: <BarChart3 size={22} />,
    title: 'Measure & Scale',
    description: 'Watch revenue attribution in real time. EduNex continuously learns and scales what works.',
    detail: ['Real-time attribution', 'Auto budget scaling', 'Weekly AI reports'],
  },
]

function StepCard({ step, index }: { step: Step; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.13, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col"
    >
      {/* Step number badge + line connector */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-[#eab308]/10 border border-[#eab308]/30 shrink-0 glow-gold">
          <span className="text-[#eab308] font-black text-sm">{step.number}</span>
        </div>
        {/* Connector line (hidden on last) */}
        {index < STEPS.length - 1 && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 0.8, delay: index * 0.13 + 0.4 }}
            className="hidden lg:block flex-1 h-px origin-left"
            style={{ background: 'linear-gradient(90deg, rgba(234,179,8,0.4), rgba(234,179,8,0.05))' }}
          />
        )}
      </div>

      {/* Card content */}
      <div className="glass-card rounded-2xl p-6 border border-white/[0.07] hover:border-[#eab308]/20 transition-all duration-400 flex-1 group relative overflow-hidden">
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(234,179,8,0.05), transparent 70%)' }} />

        <div className="relative z-10">
          {/* Icon */}
          <div className="w-11 h-11 rounded-xl bg-[#eab308]/10 text-[#eab308] flex items-center justify-center mb-4 group-hover:bg-[#eab308]/20 transition-colors duration-300">
            {step.icon}
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
          <p className="text-sm text-gray-400 leading-relaxed mb-4">{step.description}</p>

          <ul className="space-y-1.5">
            {step.detail.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1 h-1 rounded-full bg-[#eab308] shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  )
}

export default function Workflow() {
  const headRef = useRef(null)
  const inView = useInView(headRef, { once: true, margin: '-100px' })

  return (
    <section id="workflow" className="relative section-pad overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(234,179,8,0.03), transparent 70%)',
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
            How It Works
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            From zero to revenue
            <br />
            <span className="text-gradient">in four steps</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Connect your stack, set your goals, and let the AI handle the rest.
            Most teams are live within two hours of signing up.
          </p>
        </motion.div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-4 items-start">
          {STEPS.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>

        {/* Bottom progress bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="mt-16 mx-auto max-w-xl"
        >
          <div className="glass-card rounded-2xl p-6 border border-white/[0.07] text-center">
            <p className="text-gray-900 font-bold text-lg mb-1">
              Average time to first AI-optimised campaign
            </p>
            <p className="text-gray-400 text-sm mb-5">Based on 5,000+ EduNex onboardings</p>
            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
              <span>0 min</span><span>120 min</span>
            </div>
            <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={inView ? { width: '18%' } : {}}
                transition={{ duration: 1.5, delay: 0.9, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-[#eab308] to-blue-400"
              />
            </div>
            <p className="mt-3 text-gray-900 font-extrabold text-2xl">
              ~22 min <span className="text-gray-500 text-base font-normal">avg. setup time</span>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
