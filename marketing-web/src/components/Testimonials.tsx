'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Quote, Star } from 'lucide-react'

interface Review {
  name: string
  city: string
  role: string
  rating: number
  text: string
  highlight: string
  initials: string
}

const REVIEWS: Review[] = [
  {
    name: 'Aarav Sharma',
    city: 'Delhi',
    role: 'College student',
    rating: 5,
    text: 'Skillomate made AI feel practical. The lessons are short, clear, and easy to follow even when I am learning after college.',
    highlight: 'Finished first module in 2 days',
    initials: 'AS',
  },
  {
    name: 'Priya Nair',
    city: 'Bengaluru',
    role: 'Content creator',
    rating: 5,
    text: 'The AI Influencer Creation course helped me understand prompts, image ideas, and video workflow without jumping between too many apps.',
    highlight: 'Better creator workflow',
    initials: 'PN',
  },
  {
    name: 'Rohan Mehta',
    city: 'Ahmedabad',
    role: 'Freelancer',
    rating: 4,
    text: 'I liked the progress tracking and the assistant. Whenever I got stuck, I could ask questions and continue the lesson.',
    highlight: 'Helpful AI support',
    initials: 'RM',
  },
  {
    name: 'Sneha Iyer',
    city: 'Chennai',
    role: 'Working professional',
    rating: 5,
    text: 'The course feels beginner-friendly. I can watch on mobile, revise later, and keep moving step by step.',
    highlight: 'Easy mobile learning',
    initials: 'SI',
  },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 rating`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={15}
          className={index < rating ? 'fill-lime text-lime' : 'fill-white/10 text-white/15'}
        />
      ))}
    </div>
  )
}

function ReviewCard({ review, index }: { review: Review; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <StarRating rating={review.rating} />
        <Quote size={18} className="shrink-0 text-lime/35" />
      </div>

      <p className="min-h-[112px] text-sm leading-relaxed text-gray-300 font-(family-name:--font-grotesk)">
        &ldquo;{review.text}&rdquo;
      </p>

      <div className="mt-5 inline-flex rounded-full border border-lime/20 bg-lime/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-lime font-(family-name:--font-grotesk)">
        {review.highlight}
      </div>

      <div className="mt-6 flex items-center gap-3 border-t border-white/8 pt-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-black text-white">
          {review.initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{review.name}</p>
          <p className="text-xs text-gray-500 font-(family-name:--font-grotesk)">
            {review.role} · {review.city}
          </p>
        </div>
      </div>
    </motion.article>
  )
}

export default function Testimonials() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} id="reviews" className="section-gap">
      <div className="container-xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-3xl text-center"
        >
          <span className="mb-5 inline-block rounded-full border border-white/10 px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-gray-500 font-(family-name:--font-grotesk)">
            Reviews
          </span>
          <h2 className="text-4xl font-bold text-white sm:text-5xl">
            Rated by Indian{' '}
            <span className="text-gradient">AI learners.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-400 font-(family-name:--font-grotesk)">
            Learners use Skillomate to build practical AI skills, follow lessons clearly,
            and keep improving with guided support.
          </p>
        </motion.div>

        <div className="mb-7 grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
          {[
            ['4.8/5', 'Average learner rating'],
            ['1,200+', 'Learning sessions started'],
            ['92%', 'Would recommend Skillomate'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-4">
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="mt-1 text-xs text-gray-500 font-(family-name:--font-grotesk)">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {REVIEWS.map((review, index) => (
            <ReviewCard key={review.name} review={review} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
