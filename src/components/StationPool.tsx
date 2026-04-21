/**
 * Pool of unplaced stations in easy mode. Rendered as a vertical column with
 * the same row rhythm as the slot list, so the two columns align visually.
 * Chips are draggable (HTML5 DnD) and clickable as a tap-to-select fallback.
 */

import type { Station } from '../data/types.js'

interface Props {
  stations: Record<string, Station>
  codes: string[]                   // ordered codes currently in the pool
  selectedCode: string | null       // tap-to-move selection
  onSelect: (code: string) => void  // toggle selection on tap
  onDropFromSlot: (slot: number) => void  // a slot-chip dropped onto the pool
}

export function StationPool({ stations, codes, selectedCode, onSelect, onDropFromSlot }: Props) {
  function handleDragStart(e: React.DragEvent, code: string) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'pool-chip', code }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (payload?.kind === 'slot-chip' && typeof payload.slot === 'number') {
        onDropFromSlot(payload.slot)
      }
    } catch {
      // ignore malformed drag payload
    }
  }

  return (
    <div
      className="min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-4"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      aria-label="Tussenstations om te plaatsen"
    >
      {/* Column layout mirrors SlotList's gap-1.5 flex rhythm. The spacer rows
          at top and bottom match the taller A/B endpoint rows so chips align
          horizontally with the slot list next to them. */}
      <ol className="flex flex-col gap-1.5">
        <li className="h-[2.75rem]" aria-hidden />  {/* A-endpoint spacer */}

        {codes.length === 0 ? (
          <li className="py-1">
            <p className="text-sm text-gray-300 italic text-center">Alle stations geplaatst</p>
          </li>
        ) : (
          codes.map(code => {
            const station = stations[code]
            const name = station?.nameShort ?? station?.name ?? code
            const fullName = station?.name ?? code
            const isSelected = selectedCode === code
            return (
              <li key={code} className="py-1">
                <button
                  draggable
                  onDragStart={e => handleDragStart(e, code)}
                  onClick={() => onSelect(code)}
                  className={`w-full h-10 px-3 rounded-xl border text-sm font-medium
                              cursor-grab active:cursor-grabbing select-none
                              transition-colors truncate text-left
                              ${isSelected
                                ? 'bg-[#FFC917] border-[#FFC917] text-gray-900 ring-2 ring-[#FFC917]/50'
                                : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'}`}
                  type="button"
                  title={fullName}
                >
                  {name}
                </button>
              </li>
            )
          })
        )}

        <li className="h-[2.75rem]" aria-hidden />  {/* B-endpoint spacer */}
      </ol>
    </div>
  )
}
