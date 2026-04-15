/**
 * ScoreScreen — shown after the game ends (win or lose).
 *
 * MB-396: Share text includes puzzle number + URL.
 * MB-395: Practice mode shows "Nieuw traject" button.
 */

import { useState } from 'react'
import type { GuessRow, GameMode } from '../game/useGameState.js'
import type { Station } from '../data/types.js'
import { MAX_GUESSES } from '../game/useGameState.js'

interface Props {
  won: boolean
  guesses: GuessRow[]
  solution: string[]
  transferCount: number
  stations: Record<string, Station>
  puzzleDate: string
  puzzleNumber?: number   // only for daily mode
  mode: GameMode
  onNewPuzzle?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rating(guessCount: number, won: boolean): string {
  if (!won) return 'Helaas'
  if (guessCount === 1) return 'Fantastisch! 🎉'
  if (guessCount === 2) return 'Uitstekend!'
  if (guessCount === 3) return 'Goed gedaan'
  if (guessCount === 4) return 'Bijna perfect'
  if (guessCount === 5) return 'Net gered'
  return 'Geslaagd!'
}

function buildEmojiGrid(guesses: GuessRow[], transferCount: number, won: boolean): string {
  const slots = Math.max(transferCount, 1)

  const rows = guesses.map(row => {
    if (row.result.isWin) return '🟩'.repeat(slots)
    const correct = row.result.correct.filter(Boolean).length
    const wrong   = row.stations.length - correct
    return '🟥'.repeat(Math.max(wrong, 0)) + '🟩'.repeat(correct)
  })

  while (rows.length < MAX_GUESSES && !won) rows.push('⬛'.repeat(slots))

  return rows.join('\n')
}

function buildShareText(
  guesses: GuessRow[],
  transferCount: number,
  won: boolean,
  date: string,
  puzzleNumber: number | undefined,
): string {
  const score  = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  const header = puzzleNumber
    ? `Overstap #${puzzleNumber} — ${date}\n${score}`
    : `Overstap (oefenmodus) — ${score}`
  const grid   = buildEmojiGrid(guesses, transferCount, won)
  return `${header}\n\n${grid}\n\noverstap.nl`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScoreScreen({
  won,
  guesses,
  solution,
  transferCount,
  stations,
  puzzleDate,
  puzzleNumber,
  mode,
  onNewPuzzle,
}: Props) {
  const [copied, setCopied] = useState(false)

  const guessCount    = guesses.length
  const wrongRows     = guesses.filter(r => !r.result.isWin)
  const wrongStations = [...new Set(
    wrongRows.flatMap(r => r.stations.filter((_, i) => !r.result.correct[i])),
  )]

  const solutionText = solution.length === 0
    ? 'directe trein — geen overstap'
    : solution.map(c => stations[c]?.nameShort ?? c).join(' → ')

  const shareText = buildShareText(guesses, transferCount, won, puzzleDate, puzzleNumber)

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.alert(shareText)
    }
  }

  return (
    <div
      className={`w-full rounded-2xl p-5 space-y-4 animate-score-reveal
        ${won ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}
    >
      {/* Rating */}
      <div className="text-center">
        <p className={`text-2xl font-black mb-1 ${won ? 'text-emerald-800' : 'text-red-800'}`}>
          {rating(guessCount, won)}
        </p>
        {won && (
          <p className={`text-sm ${won ? 'text-emerald-600' : 'text-red-600'}`}>
            Opgelost in <span className="font-semibold">{guessCount}/{MAX_GUESSES}</span> pogingen
          </p>
        )}
      </div>

      {/* Solution reveal */}
      <div
        className={`rounded-xl p-3 text-center text-sm
          ${won ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
      >
        <span className="font-semibold">Oplossing:</span> {solutionText}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-around text-center">
        <Stat value={guessCount}    label="Pogingen" />
        <Stat value={transferCount} label="Overstappen" />
        <Stat value={wrongRows.length} label="Foute rijen" />
      </div>

      {/* Wrong stations */}
      {wrongStations.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Fout geprobeerd:</p>
          <div className="flex flex-wrap gap-1.5">
            {wrongStations.map(code => (
              <span
                key={code}
                className="px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600"
              >
                {stations[code]?.nameShort ?? code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Share button (daily mode) */}
      {mode === 'daily' && (
        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl bg-[#003082] text-white font-semibold text-sm
                     hover:bg-blue-900 active:bg-blue-950 transition-colors min-h-[48px]"
        >
          {copied ? '✓ Gekopieerd!' : '📋 Deel resultaat'}
        </button>
      )}

      {/* New puzzle button (practice mode) */}
      {mode === 'practice' && onNewPuzzle && (
        <button
          onClick={onNewPuzzle}
          className="w-full py-3 rounded-xl bg-[#FFC917] text-gray-900 font-semibold text-sm
                     hover:bg-yellow-400 active:bg-yellow-500 transition-colors min-h-[48px]"
        >
          Volgend traject →
        </button>
      )}

      {/* Share text preview (daily only) */}
      {mode === 'daily' && (
        <pre className="text-xs text-gray-400 text-center font-mono whitespace-pre-wrap leading-relaxed">
          {shareText}
        </pre>
      )}

      {/* Daily: come back tomorrow */}
      {mode === 'daily' && (
        <p className="text-xs text-gray-400 text-center">
          Kom morgen terug voor een nieuw puzzel.
        </p>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-black text-gray-800">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
