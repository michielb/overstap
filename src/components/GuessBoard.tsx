/**
 * GuessBoard — displays all past guesses with per-station correctness feedback.
 *
 * Green chip = station is in the right position in a valid solution.
 * Red/gray chip = station is wrong or in wrong position.
 * A special "direct" chip is shown for 0-transfer guesses.
 */

import type { GuessRow } from '../game/useGameState.js'
import type { Station } from '../data/types.js'
import { MAX_GUESSES } from '../game/useGameState.js'

interface Props {
  guesses: GuessRow[]
  stations: Record<string, Station>
  transferCount: number
}

export function GuessBoard({ guesses, stations, transferCount }: Props) {
  const emptyCount = MAX_GUESSES - guesses.length

  return (
    <div className="w-full space-y-2">
      {guesses.map((row, i) => (
        <FilledRow key={i} row={row} stations={stations} />
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <EmptyRow key={i} transferCount={transferCount} />
      ))}
    </div>
  )
}

// ── Filled row (past guess) ───────────────────────────────────────────────────

function FilledRow({ row, stations }: { row: GuessRow; stations: Record<string, Station> }) {
  if (row.stations.length === 0) {
    // Direct route guess (no transfers)
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-white border border-gray-200 min-h-[52px]">
        <Chip
          label="Direct (geen overstap)"
          correct={row.result.isWin}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-white border border-gray-200 min-h-[52px] flex-wrap">
      {row.stations.map((code, i) => (
        <Chip
          key={code}
          label={stations[code]?.name ?? code}
          correct={row.result.correct[i]}
        />
      ))}
      {row.isOptimal && (
        <span className="ml-auto text-xs text-emerald-600 font-medium shrink-0">optimaal</span>
      )}
    </div>
  )
}

// ── Empty row placeholder ────────────────────────────────────────────────────

function EmptyRow({ transferCount }: { transferCount: number }) {
  const slots = Math.max(transferCount, 1)
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-white border border-dashed border-gray-200 min-h-[52px]">
      {Array.from({ length: slots }).map((_, i) => (
        <div
          key={i}
          className="h-8 flex-1 rounded-lg bg-gray-100 min-w-[60px] max-w-[140px]"
        />
      ))}
    </div>
  )
}

// ── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, correct }: { label: string; correct: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium transition-colors
        ${correct
          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-700 border border-red-200'
        }`}
    >
      {label}
    </span>
  )
}
