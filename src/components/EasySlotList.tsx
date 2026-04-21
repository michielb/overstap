/**
 * EasySlotList — vertical route view for easy mode.
 *
 * Every slot row is a uniform-height pill so the list keeps the same vertical
 * rhythm as the pool column next to it. Empty slots are dashed pills that
 * accept drops; filled slots pre-check are solid NS-blue pills the player can
 * drag out or tap to return; post-check slots are green/red with an icon.
 */

import type { Station } from '../data/types.js'

interface Props {
  fromStation: Station
  toStation: Station
  placements: (string | null)[]
  stopsInOrder: string[]          // true order; only consulted after check
  checked: boolean
  selectedCode: string | null     // if set, empty slots highlight as tap targets
  stations: Record<string, Station>
  onPlace: (code: string, slot: number, fromSlot?: number) => void
  onReturnToPool: (slot: number) => void
  onSlotTap: (slot: number) => void
}

interface DragPayload {
  kind: 'pool-chip' | 'slot-chip'
  code: string
  slot?: number
}

function readPayload(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData('text/plain')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.kind === 'pool-chip' && typeof parsed.code === 'string') return parsed
    if (parsed?.kind === 'slot-chip' && typeof parsed.code === 'string' && typeof parsed.slot === 'number') return parsed
    return null
  } catch {
    return null
  }
}

export function EasySlotList({
  fromStation,
  toStation,
  placements,
  stopsInOrder,
  checked,
  selectedCode,
  stations,
  onPlace,
  onReturnToPool,
  onSlotTap,
}: Props) {
  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <ol className="flex flex-col gap-1.5">
        <EndpointRow station={fromStation} variant="origin" />

        {placements.map((code, i) => (
          <SlotRow
            key={`slot-${i}`}
            index={i + 1}
            slotIndex={i}
            code={code}
            correctCode={stopsInOrder[i]}
            checked={checked}
            selectedCode={selectedCode}
            stations={stations}
            onPlace={onPlace}
            onReturnToPool={onReturnToPool}
            onSlotTap={onSlotTap}
          />
        ))}

        <EndpointRow station={toStation} variant="destination" />
      </ol>
    </div>
  )
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function EndpointRow({ station, variant }: { station: Station; variant: 'origin' | 'destination' }) {
  const bgColor = variant === 'origin' ? 'bg-[#FFC917]' : 'bg-[#003082]'
  const textColor = variant === 'origin' ? 'text-gray-900' : 'text-white'
  const label = variant === 'origin' ? 'A' : 'B'
  return (
    <li className="py-1">
      <div
        className={`w-full h-10 pl-3 pr-3 rounded-xl ${bgColor} ${textColor} text-sm font-semibold
                    flex items-center justify-between gap-2 shadow-sm`}
      >
        <span className="truncate">{station.nameShort ?? station.name}</span>
        <span className={`text-[10px] font-bold shrink-0 ${variant === 'origin' ? 'text-gray-700' : 'text-white/70'}`}>
          {label}
        </span>
      </div>
    </li>
  )
}

interface SlotRowProps {
  index: number
  slotIndex: number
  code: string | null
  correctCode: string
  checked: boolean
  selectedCode: string | null
  stations: Record<string, Station>
  onPlace: (code: string, slot: number, fromSlot?: number) => void
  onReturnToPool: (slot: number) => void
  onSlotTap: (slot: number) => void
}

function SlotRow({
  index,
  slotIndex,
  code,
  correctCode,
  checked,
  selectedCode,
  stations,
  onPlace,
  onReturnToPool,
  onSlotTap,
}: SlotRowProps) {
  const isCorrect = checked && code === correctCode
  const isWrong = checked && code !== null && code !== correctCode
  const station = code ? stations[code] : null
  const shortName = station?.nameShort ?? station?.name ?? code ?? ''
  const fullName = station?.name ?? code ?? ''

  function handleDragOver(e: React.DragEvent) {
    if (checked) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent) {
    if (checked) return
    e.preventDefault()
    const payload = readPayload(e)
    if (!payload) return
    const fromSlot = payload.kind === 'slot-chip' ? payload.slot : undefined
    onPlace(payload.code, slotIndex, fromSlot)
  }

  function handleDragStart(e: React.DragEvent) {
    if (!code || checked) return
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'slot-chip', code, slot: slotIndex }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleClick() {
    if (checked) return
    if (code === null) {
      onSlotTap(slotIndex)
      return
    }
    onReturnToPool(slotIndex)
  }

  // Pick pill visuals. Height stays h-10 across all branches so rhythm holds.
  const isFilledPrecheck = code !== null && !checked
  const isEmptySelected = code === null && selectedCode !== null && !checked

  let pillClass = ''
  let content: React.ReactNode = null

  if (isCorrect) {
    pillClass = 'bg-emerald-500 text-white'
    content = (
      <>
        <CheckIcon />
        <span className="truncate flex-1">{shortName}</span>
        <span className="text-[10px] font-mono tabular-nums text-white/60 shrink-0">{index}</span>
      </>
    )
  } else if (isWrong) {
    pillClass = 'bg-red-500 text-white'
    content = (
      <>
        <CrossIcon />
        <span className="truncate flex-1">{shortName}</span>
        <span className="text-[10px] font-mono tabular-nums text-white/60 shrink-0">{index}</span>
      </>
    )
  } else if (isFilledPrecheck) {
    pillClass = 'bg-[#0063D3] text-white cursor-grab active:cursor-grabbing'
    content = (
      <>
        <span className="truncate flex-1">{shortName}</span>
        <span className="text-[10px] font-mono tabular-nums text-white/60 shrink-0">{index}</span>
      </>
    )
  } else if (isEmptySelected) {
    pillClass = 'bg-yellow-50 border-2 border-dashed border-[#FFC917]'
    content = (
      <>
        <span className="flex-1" />
        <span className="text-[10px] font-mono tabular-nums text-yellow-700 shrink-0">{index}</span>
      </>
    )
  } else {
    pillClass = 'bg-gray-50 border-2 border-dashed border-gray-200'
    content = (
      <>
        <span className="flex-1" />
        <span className="text-[10px] font-mono tabular-nums text-gray-300 shrink-0">{index}</span>
      </>
    )
  }

  return (
    <li className="py-1">
      <div
        draggable={isFilledPrecheck}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        title={code !== null ? fullName : undefined}
        className={`w-full h-10 pl-3 pr-3 rounded-xl text-sm font-medium shadow-sm select-none
                    flex items-center gap-2 transition-colors ${pillClass}`}
      >
        {content}
      </div>
    </li>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
      <path d="M4 10l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
