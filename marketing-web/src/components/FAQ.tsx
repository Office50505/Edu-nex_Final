'use client'

import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

const ITEMS = [
  {
    q: "What is Skillomate?",
    a: "Skillomate is an AI-skills learning app with structured video courses, a built-in AI assistant, progress tracking, and learning access across mobile and web.",
  },
  {
    q: "Which course is currently available?",
    a: "The confirmed first course is AI Influencer Creation. Additional courses should only be shown here when their title, content, and publication status are confirmed.",
  },
  {
    q: "How does the built-in AI assistant help?",
    a: "The assistant helps learners ask questions about lessons, concepts, prompts, and the tools they are learning. It supports learning, but it should not be treated as a guarantee that every answer is always complete or correct.",
  },
  {
    q: "Do I get a certificate?",
    a: "Skillomate can provide a certificate after completing an eligible course. Eligibility and completion rules should be confirmed in the app for each course.",
  },
  {
    q: "What does the selected plan include?",
    a: "The landing page should only list confirmed plan benefits: step-by-step video courses, the built-in AI assistant, progress tracking, mobile and web access, and certificates for eligible completed courses.",
  },
  {
    q: "Are external AI tools included?",
    a: "External AI tool subscriptions, paid plans, credits, or generation costs should be treated as separate unless the confirmed Skillomate plan explicitly includes them.",
  },
  {
    q: "What is the current price?",
    a: "Skillomate access is currently shown at ₹299. External AI tool subscriptions, paid plans, credits, or generation costs may require separate payment.",
  },
  {
    q: "Can I learn on mobile and web?",
    a: "Yes. The product brief confirms Skillomate supports learning through mobile and web.",
  },
]

function Item({
  q, a, open, index, onToggle,
}: { q: string; a: string; open: boolean; index: number; onToggle: () => void }) {
  return (
    <div
      className={`border-b border-white/8 last:border-0 transition-colors duration-200 ${open ? 'border-lime/20' : ''}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`shrink-0 text-[11px] font-bold font-(family-name:--font-grotesk) mt-0.5 w-5 transition-colors duration-200 ${open ? 'text-lime' : 'text-gray-400'}`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={`font-semibold text-[15px] leading-snug transition-colors duration-200 ${open ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
            {q}
          </span>
        </div>
        <span className="shrink-0 mt-0.5 transition-transform duration-200">
          {open
            ? <Minus size={15} className="text-lime" />
            : <Plus size={15} className="text-gray-400 group-hover:text-gray-500" />
          }
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pl-8 pb-5 text-gray-400 text-sm leading-[1.75] font-(family-name:--font-grotesk)">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FAQ() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section ref={ref} className="section-gap">
      <div className="container-xl max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-3">
            Fair Questions.{' '}
            <span className="text-gradient">Straight Answers.</span>
          </h2>
          <p className="text-gray-400 font-(family-name:--font-grotesk) text-[15px]">
            If something&apos;s holding you back, it&apos;s probably here.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="glass-card rounded-2xl px-6 sm:px-8"
        >
          {ITEMS.map((item, i) => (
            <Item
              key={i}
              index={i}
              q={item.q}
              a={item.a}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
