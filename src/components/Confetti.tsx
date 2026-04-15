/**
 * MB-397: Confetti celebration on win.
 * Pure CSS animation — no external dependencies.
 */

import { useState } from 'react'

const COLORS = ['#FFC917', '#003082', '#00A04A', '#FF6B6B', '#4FC3F7', '#FFD54F', '#EF5350']
const COUNT = 64

interface Particle {
  id: number
  x: number       // % from left
  color: string
  delay: number   // s
  duration: number // s
  size: number    // px
  drift: number   // px horizontal drift
  round: boolean  // circle vs square
}

export function Confetti() {
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 1.8,
      duration: 2 + Math.random() * 1.5,
      size: 7 + Math.random() * 9,
      drift: (Math.random() - 0.5) * 80,
      round: Math.random() > 0.5,
    })),
  )

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
      aria-hidden="true"
    >
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute confetti-particle"
          style={{
            left: `${p.x}%`,
            top: '-12px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
