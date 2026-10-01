'use client'

import { useEffect, useState } from 'react'

export default function MouseGlow() {
  const [pos, setPos] = useState({ x: -9999, y: -9999 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9] transition-opacity duration-300"
      style={{
        background: `radial-gradient(700px circle at ${pos.x}px ${pos.y}px, rgba(234,179,8,0.035), transparent 70%)`,
      }}
    />
  )
}
