import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import ProblemSection from '@/components/ProblemSection'
import BeforeAfterSection from '@/components/BeforeAfterSection'
import Pricing from '@/components/Pricing'
import Testimonials from '@/components/Testimonials'
import FAQ from '@/components/FAQ'
import Footer from '@/components/Footer'
import StickyBar from '@/components/StickyBar'
import MarketingCheckoutFlow from '@/components/MarketingCheckoutFlow'

export default function Home() {
  return (
    <div className="relative min-h-screen bg-bg">
      <div className="sticky top-0 z-[80]">
        <Navbar />
      </div>

      <main>
        <Hero />
        <ProblemSection />
        <BeforeAfterSection />
        <Pricing />
        <Testimonials />
        <FAQ />
      </main>

      <Footer />
      <StickyBar />
      <MarketingCheckoutFlow />
    </div>
  )
}
