/**
 * EasySlotList — vertical route view for easy mode.
 *
 * Every slot row is a uniform-height pill so the list keeps the same vertical
 * rhythm as the pool column next to it. Empty slots are dashed pills that
 * accept drops; filled slots pre-check are solid NS-blue pills the player can
 * drag out or tap to return; post-check slots are green/red with an icon.
 */

import { useState } from 'react'
import type { Station } from '../data/types.js'

interface Props {
  fromStation: Station
  toStation: Station
  placements: (string | null)[]
  stopsInOrder: string[]          // true order; only consulted after check
  checked: boolean
  selectedCode: string | null     // if set, empty slots highlight as tap targets
  isDragActive: boolean           // MB-470: any chip currently being dragged
  stations: Record<string, Station>
  onPlace: (code: string, slot: number, fromSlot?: number) => void
  onReturnToPool: (slot: number) => void
  onSlotTap: (slot: number) => void
  onDragActiveChange: (active: boolean) => void
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
  isDragActive,
  stations,
  onPlace,
  onReturnToPool,
  onSlotTap,
  onDragActiveChange,
}: Props) {
  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <ol className="flex flex-col gap-1.5">
        <EndpointRow station={fromStation} variant="origin" />

        {placements.map((code, i) => (
          <SlotRow
            key={`slot-${i}`}
            slotIndex={i}
            code={code}
            correctCode={stopsInOrder[i]}
            checked={checked}
            selectedCode={selectedCode}
            isDragActive={isDragActive}
            stations={stations}
            onPlace={onPlace}
            onReturnToPool={onReturnToPool}
            onSlotTap={onSlotTap}
            onDragActiveChange={onDragActiveChange}
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
  slotIndex: number
  code: string | null
  correctCode: string
  checked: boolean
  selectedCode: string | null
  isDragActive: boolean
  stations: Record<string, Station>
  onPlace: (code: string, slot: number, fromSlot?: number) => void
  onReturnToPool: (slot: number) => void
  onSlotTap: (slot: number) => void
  onDragActiveChange: (active: boolean) => void
}

function SlotRow({
  slotIndex,
  code,
  correctCode,
  checked,
  selectedCode,
  isDragActive,
  stations,
  onPlace,
  onReturnToPool,
  onSlotTap,
  onDragActiveChange,
}: SlotRowProps) {
  const [isDragging, setIsDragging] = useState(false)
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
    setIsDragging(true)
    onDragActiveChange(true)
  }

  function handleDragEnd() {
    setIsDragging(false)
    onDragActiveChange(false)
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
  // Highlight empty slots whenever the player is staging a move — either
  // tap-to-move (`selectedCode`) or an active drag (MB-470).
  const isEmptySelected = code === null && !checked && (selectedCode !== null || isDragActive)

  let pillClass = ''
  let content: React.ReactNode = null

  if (isCorrect) {
    pillClass = 'bg-emerald-500 text-white'
    content = (
      <>
        <CheckIcon />
        <span className="truncate flex-1">{shortName}</span>
      </>
    )
  } else if (isWrong) {
    pillClass = 'bg-red-500 text-white'
    content = (
      <>
        <CrossIcon />
        <span className="truncate flex-1">{shortName}</span>
      </>
    )
  } else if (isFilledPrecheck) {
    // MB-470: press-feedback + active-drag ring. `:active` fires during the
    // mobile long-press hold before dragstart, giving the user immediate
    // acknowledgement that their press registered. `isDragging` takes over
    // with a stronger ring once the browser commits to the drag.
    const ring = isDragging
      ? 'ring-2 ring-white shadow-md'
      : 'active:ring-2 active:ring-white/60'
    pillClass = `bg-[#0063D3] text-white cursor-grab active:cursor-grabbing ${ring}`
    content = <span className="truncate flex-1">{shortName}</span>
  } else if (isEmptySelected) {
    pillClass = 'bg-yellow-50 border-2 border-dashed border-[#FFC917]'
    content = null
  } else {
    pillClass = 'bg-gray-50 border-2 border-dashed border-gray-200'
    content = null
  }

  return (
    <li className="py-1">
      <div
        draggable={isFilledPrecheck}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        title={code !== null ? fullName : undefined}
        className={`w-full h-10 pl-3 pr-3 rounded-xl text-sm font-medium shadow-sm select-none
                    flex items-center gap-2 transition-all ${pillClass}`}
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
