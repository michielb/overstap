/**
 * SlotList — vertical route view of the player's guesses.
 *
 * Shows origin at top, destination at bottom, and the configured number of
 * intermediate slots between them. Each slot is either empty or filled with
 * a station + icon (correct / wrong-order / not-on-route).
 */

import type { Slot, Station } from '../data/types.js'

interface Props {
  fromStation: Station
  toStation: Station
  slots: Slot[]
  maxSlots: number
  stations: Record<string, Station>
  /** Rendered in place of the first empty slot row. MB-465. */
  activeInput?: React.ReactNode
}

export function SlotList({ fromStation, toStation, slots, maxSlots, stations, activeInput }: Props) {
  const emptyCount = Math.max(0, maxSlots - slots.length)
  const hasActiveInput = activeInput !== undefined && emptyCount > 0
  const trailingEmpty = hasActiveInput ? emptyCount - 1 : emptyCount

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <ol className="relative flex flex-col gap-1.5">
        {/* Vertical rail */}
        <span
          aria-hidden
          className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-200"
        />

        <EndpointRow station={fromStation} variant="origin" />

        {slots.map((slot, i) => (
          <SlotRow
            key={`slot-${i}`}
            index={i + 1}
            slot={slot}
            stations={stations}
          />
        ))}

        {hasActiveInput && (
          <ActiveInputRow index={slots.length + 1}>{activeInput}</ActiveInputRow>
        )}

        {Array.from({ length: trailingEmpty }).map((_, i) => (
          <EmptyRow
            key={`empty-${i}`}
            index={slots.length + (hasActiveInput ? i + 2 : i + 1)}
          />
        ))}

        <EndpointRow station={toStation} variant="destination" />
      </ol>
    </div>
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
  return (
    <li className="relative flex items-center gap-3 py-1.5">
      <span
        className={`relative z-10 w-10 h-10 rounded-full ${dotColor} flex items-center
                    justify-center text-xs font-bold text-gray-900 shadow-sm`}
      >
        {variant === 'origin' ? 'A' : 'B'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide">
          {variant === 'origin' ? 'Vertrek' : 'Bestemming'}
        </p>
        <p className="text-sm font-semibold text-gray-900 truncate">{station.name}</p>
      </div>
    </li>
  )
}

function SlotRow({
  index,
  slot,
  stations,
}: {
  index: number
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
        <span className="text-xs text-gray-300 font-mono tabular-nums shrink-0">{index}</span>
      </div>
    </li>
  )
}

function EmptyRow({ index }: { index: number }) {
  return (
    <li className="relative flex items-center gap-3 py-1">
      <span
        className="relative z-10 w-10 h-10 rounded-full bg-gray-50 border-2 border-dashed
                   border-gray-200 flex items-center justify-center text-xs text-gray-300
                   font-mono tabular-nums"
      >
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 italic">Nog te raden</p>
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
