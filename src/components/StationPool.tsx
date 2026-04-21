/**
 * Pool of unplaced stations in easy mode. Rendered as a vertical column with
 * the same row rhythm as the slot list, so the two columns align visually.
 * Chips are draggable (HTML5 DnD) and clickable as a tap-to-select fallback.
 */

import { useState } from 'react'
import type { Station } from '../data/types.js'

interface Props {
  stations: Record<string, Station>
  codes: string[]                   // ordered codes currently in the pool
  selectedCode: string | null       // tap-to-move selection
  onSelect: (code: string) => void  // toggle selection on tap
  onDropFromSlot: (slot: number) => void  // a slot-chip dropped onto the pool
  onDragActiveChange: (active: boolean) => void  // MB-470
}

export function StationPool({ stations, codes, selectedCode, onSelect, onDropFromSlot, onDragActiveChange }: Props) {
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
            return (
              <li key={code} className="py-1">
                <PoolChip
                  code={code}
                  name={name}
                  fullName={fullName}
                  isSelected={selectedCode === code}
                  onSelect={onSelect}
                  onDragActiveChange={onDragActiveChange}
                />
              </li>
            )
          })
        )}

        <li className="h-[2.75rem]" aria-hidden />  {/* B-endpoint spacer */}
      </ol>
    </div>
  )
}

interface PoolChipProps {
  code: string
  name: string
  fullName: string
  isSelected: boolean
  onSelect: (code: string) => void
  onDragActiveChange: (active: boolean) => void
}

function PoolChip({ code, name, fullName, isSelected, onSelect, onDragActiveChange }: PoolChipProps) {
  const [isDragging, setIsDragging] = useState(false)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'pool-chip', code }))
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
    onDragActiveChange(true)
  }

  function handleDragEnd() {
    setIsDragging(false)
    onDragActiveChange(false)
  }

  // MB-470: `:active` fires during the mobile long-press hold (before dragstart),
  // giving press-feedback. `isDragging` takes over with a stronger ring once the
  // browser commits to the drag. Selected (tap-to-move) keeps its yellow ring.
  const baseTone = isSelected
    ? 'bg-[#FFC917] border-[#FFC917] text-gray-900 ring-2 ring-[#FFC917]/50'
    : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
  const dragRing = !isSelected
    ? (isDragging ? 'ring-2 ring-[#0063D3] shadow-md' : 'active:ring-2 active:ring-[#0063D3]/40')
    : ''

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(code)}
      className={`w-full h-10 px-3 rounded-xl border text-sm font-medium
                  cursor-grab active:cursor-grabbing select-none
                  transition-all truncate text-left
                  ${baseTone} ${dragRing}`}
      type="button"
      title={fullName}
    >
      {name}
    </button>
  )
}
