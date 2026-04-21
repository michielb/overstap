/**
 * ScoreScreen — end-of-game summary.
 *
 * Shows the report: "There were N stops. You guessed M." plus perfect-order
 * bonus if earned. Includes a shareable result line.
 */

import { useState } from 'react'
import type { LinePuzzle, Mode, Slot, Station } from '../data/types.js'

interface Props {
  won: boolean
  puzzle: LinePuzzle
  slots: Slot[]
  stations: Record<string, Station>
  score: number
  orderBroken: boolean
  mode: Mode
}

// ── Share format ─────────────────────────────────────────────────────────────

const MODE_LABEL: Record<Mode, string> = {
  easy: 'Makkelijk',
  hard: 'Moeilijk',
}

function buildShareText(
  puzzle: LinePuzzle,
  slots: Slot[],
  score: number,
  orderBroken: boolean,
  won: boolean,
  mode: Mode,
): string {
  const grid = slots.map(s => {
    if (s.status === 'correct') return '🟩'
    if (s.status === 'wrong-order') return '🟨'
    return '🟥'
  }).join('')

  const totalStops = puzzle.stops.length
  const correctStops = slots.filter(s => s.status !== 'not-on-route').length
  const bonus = won && !orderBroken ? ' ⭐' : ''

  const fromS = puzzle.from
  const toS = puzzle.to

  return [
    `Treintje — ${puzzle.date} · ${MODE_LABEL[mode]}`,
    `${fromS} → ${toS}`,
    `${correctStops}/${totalStops} stations, ${score} punten${bonus}`,
    grid,
  ].join('\n')
}

// ── Component ────────────────────────────────────────────────────────────────

export function ScoreScreen({ won, puzzle, slots, stations, score, orderBroken, mode }: Props) {
  const [copied, setCopied] = useState(false)

  const totalStops = puzzle.stops.length
  const correctStops = slots.filter(s => s.status !== 'not-on-route').length
  const wrongStations = slots.filter(s => s.status === 'not-on-route')

  const routeText = puzzle.stops.map(c => stations[c]?.nameShort ?? c).join(' → ')
  const shareText = buildShareText(puzzle, slots, score, orderBroken, won, mode)

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.alert(shareText)
    }
  }

  const heading = won
    ? (orderBroken ? 'Compleet!' : 'Perfect!')
    : 'Helaas'
  const tone = won ? 'emerald' : 'red'

  return (
    <div className={`w-full rounded-2xl p-5 space-y-4
      ${tone === 'emerald' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}
    >
      <div className="text-center">
        <p className={`text-2xl font-bold mb-1
          ${tone === 'emerald' ? 'text-emerald-800' : 'text-red-800'}`}
        >
          {heading}
        </p>
        <p className="text-sm text-gray-600">
          Er waren <span className="font-semibold">{totalStops}</span> tussenstations.
          Je raadde er <span className="font-semibold">{correctStops}</span>.
        </p>
        {won && !orderBroken && (
          <p className="text-sm text-amber-700 mt-1">+1 bonus voor perfecte volgorde ⭐</p>
        )}
      </div>

      {/* Solution reveal */}
      <div className="rounded-xl p-3 text-center text-sm bg-white border border-gray-200">
        <span className="font-medium text-gray-700">De route: </span>
        <span className="text-gray-600">{routeText || '—'}</span>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-around text-center">
        <Stat value={score} label="Punten" />
        <Stat value={correctStops} label={`van ${totalStops}`} />
        <Stat value={wrongStations.length} label="Fouten" />
      </div>

      {/* Wrong-station attempts */}
      {wrongStations.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Fout geprobeerd:</p>
          <div className="flex flex-wrap gap-1.5">
            {wrongStations.map(s => (
              <span
                key={s.station}
                className="px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600"
              >
                {stations[s.station]?.nameShort ?? s.station}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleShare}
        className="w-full py-2.5 rounded-xl bg-[#003082] text-white font-semibold text-sm
                   hover:bg-blue-900 active:bg-blue-950 transition-colors"
      >
        {copied ? '✓ Gekopieerd!' : 'Deel resultaat'}
      </button>

      <pre className="text-xs text-gray-400 text-center font-mono whitespace-pre-wrap leading-relaxed">
        {shareText}
      </pre>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
