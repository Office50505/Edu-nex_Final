'use client'

import { useRef, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { BookOpen, FileText, LineChart, ArrowRight, Clock, Tag } from 'lucide-react'

type Category = 'All' | 'Templates' | 'Guides' | 'Case Studies'

interface Resource {
  category: Exclude<Category, 'All'>
  tag: string
  title: string
  description: string
  readTime: string
  icon: React.ReactNode
  accent: string
}

const RESOURCES: Resource[] = [
  {
    category: 'Templates',
    tag: 'Prompt Templates',
    title: 'AI Campaign Prompt Library',
    description:
      '120+ battle-tested prompts for generating ad copy, email sequences, and landing page content that converts.',
    readTime: '5 min read',
    icon: <FileText size={20} />,
    accent: '#eab308',
  },
  {
    category: 'Guides',
    tag: 'Growth Guide',
    title: 'The Revenue Attribution Playbook',
    description:
      'A step-by-step guide to connecting every marketing dollar to closed revenue — from first touch to won deal.',
    readTime: '12 min read',
    icon: <BookOpen size={20} />,
    accent: '#a78bfa',
  },
  {
    category: 'Case Studies',
    tag: 'Case Study',
    title: 'How Meridian Scaled to $10M ARR',
    description:
      'Meridian used EduNex to reduce CAC by 47% and triple MQL-to-SQL conversion in under 90 days.',
    readTime: '8 min read',
    icon: <LineChart size={20} />,
    accent: '#34d399',
  },
  {
    category: 'Templates',
    tag: 'Workflow Templates',
    title: 'AI Workflow Cookbook',
    description:
      '35 pre-built automation workflows for every stage of the funnel — TOFU to post-purchase nurture.',
    readTime: '6 min read',
    icon: <FileText size={20} />,
    accent: '#eab308',
  },
  {
    category: 'Guides',
    tag: 'Strategy Guide',
    title: 'Marketing Metrics That Actually Matter',
    description:
      'Cut through vanity metrics. Learn which 12 KPIs truly predict revenue growth for modern SaaS teams.',
    readTime: '10 min read',
    icon: <BookOpen size={20} />,
    accent: '#a78bfa',
  },
  {
    category: 'Case Studies',
    tag: 'Enterprise Success',
    title: "ZenithCorp's 3x Pipeline in 60 Days",
    description:
      'Enterprise software company ZenithCorp rebuilt their entire demand gen with EduNex and tripled pipeline.',
    readTime: '9 min read',
    icon: <LineChart size={20} />,
    accent: '#34d399',
  },
]

const CATEGORIES: Category[] = ['All', 'Templates', 'Guides', 'Case Studies']

function ResourceCard({ resource, index }: { resource: Resource; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay: (index % 3) * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className="group glass-card rounded-2xl border border-white/[0.07] hover:border-white/15 overflow-hidden transition-all duration-400 cursor-pointer"
    >
      {/* Thumbnail */}
      <div
        className="relative h-44 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${resource.accent}10 0%, rgba(255,255,255,0.02) 100%)`,
        }}
      >
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: resource.accent }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: `${resource.accent}15`, border: `1px solid ${resource.accent}30` }}
          >
            {resource.icon}
          </div>
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
          style={{ background: `radial-gradient(ellipse at 50% 50%, ${resource.accent}08, transparent 70%)` }} />
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ background: `${resource.accent}15`, color: resource.accent }}
          >
            {resource.tag}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-600">
            <Clock size={10} /> {resource.readTime}
          </span>
        </div>

        <h3 className="font-bold text-gray-900 text-base mb-2 group-hover:text-[#eab308] transition-colors duration-300 leading-snug">
          {resource.title}
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">{resource.description}</p>

        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 group-hover:text-[#eab308] transition-colors duration-300">
          Read more <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
        </span>
      </div>
    </motion.article>
  )
}

export default function ResourceLibrary() {
  const [active, setActive] = useState<Category>('All')
  const headRef = useRef(null)
  const inView = useInView(headRef, { once: true, margin: '-100px' })

  const filtered = active === 'All' ? RESOURCES : RESOURCES.filter((r) => r.category === active)

  return (
    <section id="resources" className="relative section-pad overflow-hidden">
      <div className="container-xl">
        {/* Header */}
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#eab308] mb-4 block">
            Resource Library
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5">
            Resources to help you
            <br />
            <span className="text-gradient">grow faster</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Templates, playbooks, and case studies from the world's fastest-growing marketing teams.
          </p>
        </motion.div>

        {/* Category filter */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, delay: 0.15 }}
          className="flex items-center justify-center gap-2 flex-wrap mb-12"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                active === cat
                  ? 'bg-[#eab308] text-black shadow-[0_0_20px_rgba(234,179,8,0.3)]'
                  : 'glass border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20'
              }`}
            >
              {cat}
            </button>
          ))}
        </motion.div>

        {/* Cards grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {filtered.map((resource, i) => (
              <ResourceCard key={resource.title} resource={resource} index={i} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
