/**
 * MB-393: Score screen
 *
 * Shown after the game ends (win or lose).
 * Displays: rating, guess breakdown, wrong-guess count, clipboard share.
 */

import { useState } from 'react'
import type { GuessRow } from '../game/useGameState.js'
import type { Station } from '../data/types.js'
import { MAX_GUESSES } from '../game/useGameState.js'

interface Props {
  won: boolean
  guesses: GuessRow[]
  solution: string[]
  transferCount: number
  stations: Record<string, Station>
  puzzleDate: string
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function rating(guessCount: number, won: boolean): string {
  if (!won) return 'Helaas'
  if (guessCount === 1) return 'Fantastisch!'
  if (guessCount === 2) return 'Uitstekend'
  if (guessCount === 3) return 'Goed gedaan'
  if (guessCount === 4) return 'Bijna perfect'
  if (guessCount === 5) return 'Net gered'
  return 'Geslaagd!'
}

function buildShareText(
  guesses: GuessRow[],
  transferCount: number,
  won: boolean,
  date: string,
): string {
  const slots = Math.max(transferCount, 1)

  const rows = guesses.map(row => {
    if (row.result.isWin) return '🟩'.repeat(slots)
    const correct = row.result.correct.filter(Boolean).length
    const wrong = row.stations.length - correct
    return '🟥'.repeat(wrong) + '🟩'.repeat(correct)
  })

  // Pad with blank rows if lost
  while (rows.length < MAX_GUESSES && !won) {
    rows.push('⬛'.repeat(slots))
  }

  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  return `Overstap — ${date}\n${score}\n\n${rows.join('\n')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScoreScreen({ won, guesses, solution, transferCount, stations, puzzleDate }: Props) {
  const [copied, setCopied] = useState(false)

  const guessCount = guesses.length
  const wrongGuessRows = guesses.filter(r => !r.result.isWin)
  const wrongStations = [...new Set(
    wrongGuessRows.flatMap(r =>
      r.stations.filter((_, i) => !r.result.correct[i])
    )
  )]

  const solutionText = solution.length === 0
    ? 'directe trein — geen overstap'
    : solution.map(c => stations[c]?.nameShort ?? c).join(' → ')

  const shareText = buildShareText(guesses, transferCount, won, puzzleDate)

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: show the text in an alert
      window.alert(shareText)
    }
  }

  return (
    <div className={`w-full rounded-2xl p-5 space-y-4
      ${won ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}
    >
      {/* Rating + score */}
      <div className="text-center">
        <p className={`text-2xl font-bold mb-1 ${won ? 'text-emerald-800' : 'text-red-800'}`}>
          {rating(guessCount, won)}
        </p>
        {won && (
          <p className={`text-sm ${won ? 'text-emerald-600' : 'text-red-600'}`}>
            Opgelost in <span className="font-semibold">{guessCount}/{MAX_GUESSES}</span> pogingen
          </p>
        )}
      </div>

      {/* Solution reveal */}
      <div className={`rounded-xl p-3 text-center text-sm
        ${won ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
      >
        <span className="font-medium">Oplossing:</span> {solutionText}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-around text-center">
        <Stat value={guessCount} label="Pogingen" />
        <Stat value={transferCount} label="Overstappen" />
        <Stat value={wrongGuessRows.length} label="Foute rijen" />
      </div>

      {/* Wrong stations tried */}
      {wrongStations.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Fout geprobeerd:</p>
          <div className="flex flex-wrap gap-1.5">
            {wrongStations.map(code => (
              <span key={code} className="px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600">
                {stations[code]?.nameShort ?? code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Share button */}
      <button
        onClick={handleShare}
        className="w-full py-2.5 rounded-xl bg-[#003082] text-white font-semibold text-sm
                   hover:bg-blue-900 active:bg-blue-950 transition-colors"
      >
        {copied ? '✓ Gekopieerd!' : 'Deel resultaat'}
      </button>

      {/* Preview of share text */}
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
