'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, X, Minus } from 'lucide-react'

type Val = true | false | 'partial'

interface Row {
  feature: string
  nexus: Val
  legacy: Val
  custom: Val
}

const ROWS: Row[] = [
  { feature: 'AI-Powered Campaign Optimisation',     nexus: true,    legacy: false,     custom: 'partial' },
  { feature: 'Real-Time Revenue Attribution',         nexus: true,    legacy: false,     custom: false     },
  { feature: 'Predictive Lead Scoring',               nexus: true,    legacy: 'partial', custom: false     },
  { feature: 'Multi-Channel Automation',              nexus: true,    legacy: true,      custom: 'partial' },
  { feature: 'Dedicated AI Model Training',           nexus: true,    legacy: false,     custom: false     },
  { feature: 'Smart A/B Testing Engine',              nexus: true,    legacy: 'partial', custom: false     },
  { feature: 'Revenue Forecasting',                   nexus: true,    legacy: false,     custom: false     },
  { feature: 'No-Code Workflow Builder',              nexus: true,    legacy: true,      custom: false     },
  { feature: 'Instant Integrations (200+)',           nexus: true,    legacy: 'partial', custom: false     },
  { feature: '24/7 Dedicated Support',                nexus: true,    legacy: false,     custom: true      },
]

function CellIcon({ val }: { val: Val }) {
  if (val === true)
    return (
      <span className="inline-flex w-6 h-6 rounded-full bg-[#eab308]/15 items-center justify-center">
        <Check size={13} className="text-[#eab308]" strokeWidth={2.5} />
      </span>
    )
  if (val === false)
    return (
      <span className="inline-flex w-6 h-6 rounded-full bg-white/[0.04] items-center justify-center">
        <X size={13} className="text-gray-600" strokeWidth={2.5} />
      </span>
    )
  return (
    <span className="inline-flex w-6 h-6 rounded-full bg-[#FF6B2B]/10 items-center justify-center">
      <Minus size={13} className="text-[#FF6B2B]" strokeWidth={2.5} />
    </span>
  )
}

export default function Comparison() {
  const headRef = useRef(null)
  const inView = useInView(headRef, { once: true, margin: '-100px' })

  return (
    <section className="relative section-pad overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(234,179,8,0.03), transparent 65%)',
        }}
      />

      <div className="container-xl relative z-10">
        {/* Header */}
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#eab308] mb-4 block">
            Why EduNex
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            The only AI built
            <br />
            <span className="text-gradient">purely for revenue</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Generic marketing tools bolt AI on as an afterthought. EduNex is built
            AI-first, with every feature designed to drive measurable revenue growth.
          </p>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden"
        >
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] border-b border-white/[0.08]">
            <div className="p-5 text-sm text-gray-500 font-medium">Feature</div>
            {[
              { label: 'EduNex',         highlight: true },
              { label: 'Legacy Tools',    highlight: false },
              { label: 'Custom Build',    highlight: false },
            ].map(({ label, highlight }) => (
              <div
                key={label}
                className={`p-5 text-center text-sm font-bold min-w-[110px] ${
                  highlight
                    ? 'text-[#eab308]'
                    : 'text-gray-500'
                } ${highlight ? 'bg-[#eab308]/[0.04]' : ''}`}
              >
                {highlight && (
                  <span className="block text-[10px] text-[#eab308]/60 font-normal mb-0.5 uppercase tracking-wider">
                    Recommended
                  </span>
                )}
                {label}
              </div>
            ))}
          </div>

          {/* Feature rows */}
          {ROWS.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.04 + 0.3 }}
              className={`grid grid-cols-[1fr_auto_auto_auto] border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors`}
            >
              <div className="p-4 md:p-5 text-sm text-gray-300">{row.feature}</div>
              <div className="p-4 md:p-5 flex items-center justify-center min-w-[110px] bg-[#eab308]/[0.02]">
                <CellIcon val={row.nexus} />
              </div>
              <div className="p-4 md:p-5 flex items-center justify-center min-w-[110px]">
                <CellIcon val={row.legacy} />
              </div>
              <div className="p-4 md:p-5 flex items-center justify-center min-w-[110px]">
                <CellIcon val={row.custom} />
              </div>
            </motion.div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-5 p-5 border-t border-white/[0.05]">
            <span className="text-xs text-gray-600">Key:</span>
            {[
              { icon: <Check size={11} className="text-[#eab308]" />, label: 'Included', bg: 'bg-[#eab308]/15' },
              { icon: <Minus size={11} className="text-[#FF6B2B]" />, label: 'Limited', bg: 'bg-[#FF6B2B]/10' },
              { icon: <X size={11} className="text-gray-600" />, label: 'Not available', bg: 'bg-white/[0.04]' },
            ].map(({ icon, label, bg }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-4 h-4 rounded-full ${bg} flex items-center justify-center`}>{icon}</span>
                {label}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
