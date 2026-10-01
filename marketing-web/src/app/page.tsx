import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import ProblemSection from '@/components/ProblemSection'
import BeforeAfterSection from '@/components/BeforeAfterSection'
import ModulesSection from '@/components/ModulesSection'
import Pricing from '@/components/Pricing'
import FAQ from '@/components/FAQ'
import Footer from '@/components/Footer'
import StickyBar from '@/components/StickyBar'

export default function Home() {
  return (
    <div className="relative min-h-screen bg-bg">
      <div className="sticky top-0 z-40">
        <Navbar />
      </div>

      <main>
        <Hero />
        <ProblemSection />
        <BeforeAfterSection />
        <ModulesSection />
        <Pricing />
        <FAQ />
      </main>

      <Footer />
      <StickyBar />
    </div>
  )
}
