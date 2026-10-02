'use client'

import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'
import OfferCtaLabel from '@/components/OfferCtaLabel'

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 pt-20 pb-10 overflow-hidden">
      {/* Glow backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2 w-175 h-64 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(208,147,39,0.09) 0%, transparent 100%)', filter: 'blur(50px)' }}
        />
      </div>

      <div className="container-xl relative">
        {/* CTA block */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 badge-glow rounded-full text-xs font-bold uppercase tracking-wider mb-5 font-(family-name:--font-grotesk)">
            Skillomate
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Learn practical AI skills,{' '}
            <span className="text-gradient">step by step.</span>
          </h2>
          <p className="text-gray-400 mb-8 font-(family-name:--font-grotesk) text-[15px] max-w-md mx-auto">
            Follow structured video courses, ask questions as you learn, and track your progress in Skillomate.
          </p>
          <a
            href={SKILLOMATE_CHECKOUT_URL}
            className="btn-primary inline-flex items-center gap-2.5 rounded-full px-5 py-4 text-[13px] font-bold font-(family-name:--font-grotesk)"
          >
            <OfferCtaLabel arrow />
          </a>

          {/* Mini trust row */}
          <div className="flex items-center justify-center gap-6 mt-8 text-gray-400 text-xs font-(family-name:--font-grotesk)">
            {['Video courses', 'AI assistant', 'Progress tracking', 'Mobile & web'].map((t, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-lime">✓</span>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="divider-gradient mb-8" />

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-gray-500 text-xs font-(family-name:--font-grotesk)">
          <p>© {new Date().getFullYear()} Skillomate. All rights reserved.</p>
          <div className="flex items-center gap-5">
            {['Privacy', 'Terms'].map(l => (
              <a key={l} href="#" className="hover:text-gray-500 transition-colors">{l}</a>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 max-w-55 text-center">
            Keep practicing. Your output improves with every project.
          </p>
        </div>
      </div>
    </footer>
  )
}
