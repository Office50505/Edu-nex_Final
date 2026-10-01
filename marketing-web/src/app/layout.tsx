import type { Metadata } from 'next'
import { Space_Grotesk, Syne } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'Skillomate — Learn AI One Skill at a Time',
  description:
    'Explore practical AI courses in the Skillomate app with step-by-step video lessons, a built-in AI assistant, and progress tracking.',
  keywords: [
    'learn AI India',
    'AI course India',
    'AI skills',
    'AI Influencer Creation',
    'AI learning app',
    'Skillomate',
  ],
  openGraph: {
    title: 'Skillomate — Learn AI One Skill at a Time',
    description:
      'Follow practical AI courses, ask your built-in AI assistant questions, and track your learning progress in Skillomate.',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Skillomate — Learn AI One Skill at a Time',
    description: 'Start learning practical AI skills with Skillomate.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${spaceGrotesk.variable} ${syne.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
