/**
 * GuessInput — the active row where the player builds their current guess.
 *
 * MB-398: All touch targets are minimum 44px. Delete button uses a larger hit area.
 */

import type { Station } from '../data/types.js'
import { StationInput } from './StationInput.js'

interface Props {
  currentInput: string[]
  stations: Record<string, Station>
  excludeCodes: string[]
  onAdd: (code: string) => void
  onRemoveLast: () => void
  onClear: () => void
  onSubmit: () => void
  disabled?: boolean
}

export function GuessInput({
  currentInput,
  stations,
  excludeCodes,
  onAdd,
  onRemoveLast,
  onClear,
  onSubmit,
  disabled,
}: Props) {
  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
      {/* Current chips */}
      {currentInput.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {currentInput.map((code, i) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-50
                         border border-yellow-200 text-sm font-medium text-gray-800 min-h-[40px]"
            >
              <span className="text-xs text-gray-400 font-mono">{i + 1}</span>
              {stations[code]?.nameShort ?? code}
            </span>
          ))}
          {/* Delete button with large touch target */}
          <button
            onClick={onRemoveLast}
            disabled={disabled}
            aria-label="Verwijder laatste station"
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg
                       text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors
                       disabled:opacity-40 active:bg-gray-100"
          >
            <span className="text-lg" aria-hidden="true">⌫</span>
          </button>
        </div>
      )}

      {/* Autocomplete input */}
      <StationInput
        stations={stations}
        excludeCodes={excludeCodes}
        onSelect={onAdd}
        disabled={disabled}
        placeholder="Voeg een tussenhalte toe…"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={disabled}
          className="flex-1 py-3 rounded-xl bg-[#FFC917] text-gray-900 font-semibold text-sm
                     hover:bg-yellow-400 active:bg-yellow-500 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px]
                     touch-manipulation"
        >
          Controleer
        </button>
        {currentInput.length > 0 && (
          <button
            onClick={onClear}
            disabled={disabled}
            className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm
                       hover:bg-gray-50 active:bg-gray-100 transition-colors
                       disabled:opacity-40 min-h-[48px] touch-manipulation"
          >
            Wissen
          </button>
        )}
      </div>

      {/* Hint for 0-transfer puzzles */}
      {currentInput.length === 0 && (
        <p className="text-xs text-gray-400 text-center">
          Geen overstap nodig? Klik direct op Controleer.
        </p>
      )}
    </div>
  )
}
