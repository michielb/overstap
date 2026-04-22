/**
 * SlotList — vertical route view of the player's guesses.
 *
 * Layout (MB-496):
 *   [A endpoint]
 *   every guess in the order it was made (✓ / ⇄ / ✗)
 *   [input row] labelled with the lowest still-unfilled slot number
 *   numbered empty rows, one per remaining unfilled slot, ascending by slot #
 *   blank "reserve" rows, one per unused spare capacity
 *   [B endpoint]
 *
 * Under skip-ahead scoring any on-route guess fills its true slot regardless
 * of the order it was named in, but the *row order* on screen stays purely
 * chronological — the user reads their guess log top-to-bottom.
 */

import type { Slot, Station } from '../data/types.js'

interface Props {
  fromStation: Station
  toStation: Station
  /** Ordered route stops between A and B. Needed to compute which slots are
   * still unfilled. Omit for post-game rollup views where every row is just
   * a guess-order record. */
  stops?: string[]
  slots: Slot[]
  maxSlots: number
  stations: Record<string, Station>
  /** Rendered in the input row, positioned right below the last guess. */
  activeInput?: React.ReactNode
}

export function SlotList({
  fromStation,
  toStation,
  stops,
  slots,
  maxSlots,
  stations,
  activeInput,
}: Props) {
  const unfilledIndices: number[] = []
  if (stops !== undefined) {
    const placed = new Set<number>()
    for (const s of slots) {
      if (s.status === 'not-on-route') continue
      const idx = stops.indexOf(s.station)
      if (idx >= 0) placed.add(idx)
    }
    for (let i = 0; i < stops.length; i++) {
      if (!placed.has(i)) unfilledIndices.push(i)
    }
  }

  const remainingReal = unfilledIndices.length
  const emptyRows = Math.max(0, maxSlots - slots.length)
  const remainingSpare = Math.max(0, emptyRows - remainingReal)
  const hasActiveInput = activeInput !== undefined && remainingReal > 0
  const inputIndex = unfilledIndices[0] ?? 0
  const trailingIndices = hasActiveInput ? unfilledIndices.slice(1) : unfilledIndices

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <ol className="relative flex flex-col gap-1.5">
        <Rail />
        <EndpointRow station={fromStation} variant="origin" />

        {slots.map((slot, i) => (
          <SlotRow key={`guess-${i}`} slot={slot} stations={stations} />
        ))}

        {hasActiveInput && (
          // Stable key so React keeps the DOM node across renders — preserves
          // keyboard focus on the station-autocomplete input between guesses.
          <ActiveInputRow key="active-input" index={inputIndex + 1}>
            {activeInput}
          </ActiveInputRow>
        )}

        {trailingIndices.map(idx => (
          <EmptyRow key={`empty-${idx}`} index={idx + 1} />
        ))}

        {Array.from({ length: remainingSpare }).map((_, i) => (
          <EmptyRow key={`spare-${i}`} index={null} />
        ))}

        <EndpointRow station={toStation} variant="destination" />
      </ol>
    </div>
  )
}

function Rail() {
  return (
    <span
      aria-hidden
      className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-200"
    />
  )
}

// ── Row variants ─────────────────────────────────────────────────────────────

function EndpointRow({
  station,
  variant,
}: {
  station: Station
  variant: 'origin' | 'destination'
}) {
  const dotColor = variant === 'origin' ? 'bg-[#FFC917]' : 'bg-[#003082]'
  const textColor = variant === 'origin' ? 'text-gray-900' : 'text-white'
  return (
    <li className="relative flex items-center gap-3 py-1.5">
      <span
        className={`relative z-10 w-10 h-10 rounded-full ${dotColor} flex items-center
                    justify-center text-xs font-bold ${textColor} shadow-sm`}
      >
        {variant === 'origin' ? 'A' : 'B'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{station.name}</p>
      </div>
    </li>
  )
}

function SlotRow({
  slot,
  stations,
}: {
  slot: Slot
  stations: Record<string, Station>
}) {
  const name = stations[slot.station]?.name ?? slot.station
  const cfg = SLOT_STYLE[slot.status]

  return (
    <li className="relative flex items-center gap-3 py-1">
      <span
        className={`relative z-10 w-10 h-10 rounded-full ${cfg.bg} flex items-center
                    justify-center text-sm shadow-sm`}
        aria-label={cfg.label}
      >
        {cfg.icon}
      </span>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <p className={`text-sm font-medium truncate ${cfg.text}`}>{name}</p>
      </div>
    </li>
  )
}

function EmptyRow({ index }: { index: number | null }) {
  return (
    <li className="relative flex items-center gap-3 py-1">
      <span
        className="relative z-10 w-10 h-10 rounded-full bg-gray-50 border-2 border-dashed
                   border-gray-200 flex items-center justify-center text-xs text-gray-300
                   font-mono tabular-nums"
      >
        {index ?? ''}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 italic">
          {index === null ? 'Reserve' : 'Nog te raden'}
        </p>
      </div>
    </li>
  )
}

function ActiveInputRow({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <li className="relative flex items-center gap-3 py-1">
      <span
        className="relative z-10 w-10 h-10 rounded-full bg-[#FFC917] flex items-center
                   justify-center text-xs font-bold text-gray-900 shadow-sm font-mono tabular-nums"
      >
        {index}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </li>
  )
}

// ── Visual config per slot status ────────────────────────────────────────────

const SLOT_STYLE: Record<Slot['status'], { bg: string; text: string; icon: React.ReactNode; label: string }> = {
  correct: {
    bg: 'bg-emerald-500 text-white',
    text: 'text-gray-900',
    icon: <CheckIcon />,
    label: 'Juist',
  },
  'wrong-order': {
    bg: 'bg-amber-400 text-white',
    text: 'text-gray-900',
    icon: <SwapIcon />,
    label: 'Goed station, verkeerde volgorde',
  },
  'not-on-route': {
    bg: 'bg-red-500 text-white',
    text: 'text-gray-400 line-through',
    icon: <CrossIcon />,
    label: 'Niet op de route',
  },
}

// ── Inline icons ─────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M4 10l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 7h11M12 3l4 4-4 4M15 13H4M8 17l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
