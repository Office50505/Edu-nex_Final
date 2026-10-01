'use client'

const MESSAGE = 'Learn with AI  ·  Earn with AI'

export default function AnnouncementBar() {
  const repeated = Array(12).fill(MESSAGE)

  return (
    <div
      className="w-full overflow-hidden py-2.5 relative"
      style={{ background: '#D09327' }}
    >
      {/* Fade edges */}
      <div
        className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, #D09327, transparent)' }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(-90deg, #D09327, transparent)' }}
      />

      <div className="flex animate-ticker whitespace-nowrap" style={{ width: 'max-content' }}>
        {repeated.map((msg, i) => (
          <span
            key={i}
            className="inline-flex items-center text-white text-xs sm:text-[13px] font-bold font-(family-name:--font-grotesk) px-8"
          >
            {msg}
            <span className="mx-6 opacity-40">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}
