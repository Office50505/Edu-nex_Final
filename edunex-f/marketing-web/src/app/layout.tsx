import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { MARKETING_BASE_PATH } from '@/lib/links'

export const metadata: Metadata = {
  title: 'Skillomate — Learn AI One Skill at a Time',
  description:
    'Explore practical AI courses in the Skillomate app with step-by-step video lessons, a built-in AI assistant, and progress tracking.',
  alternates: {
    canonical: `${MARKETING_BASE_PATH}/`,
  },
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
    description: 'Subscribe to practical AI skills with Skillomate.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" style={{
      '--font-grotesk': 'Space Grotesk, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      '--font-playfair': 'Syne, Fraunces, Georgia, serif',
    } as React.CSSProperties}>
      <body className="antialiased">
        <Script id="canonical-marketing-route" strategy="beforeInteractive">
          {`if(location.pathname==="${MARKETING_BASE_PATH}/index.html"){history.replaceState(null,"","${MARKETING_BASE_PATH}/"+location.search+location.hash)}`}
        </Script>
        {children}
      </body>
    </html>
  )
}
