/**
 * Classify a single guess against the puzzle's ordered stop list.
 *
 * MB-496 skip-ahead rule:
 *   - Off-route station → 'not-on-route'.
 *   - On-route station whose earlier slots are all already filled at guess
 *     time → 'correct' (green).
 *   - On-route station typed while at least one earlier slot is still empty
 *     → 'wrong-order' (amber). It still fills its own slot, but the
 *     non-linear guess is recorded so it costs the perfect-bonus.
 *
 * Every guess consumes one row of the buffer (maxSlots). The player wins
 * when all stops have been named; they lose when the buffer runs out first.
 */

import type { Slot, SlotStatus } from '../data/types.js'

export function classifyGuess(
  stops: string[],
  placements: readonly (string | null)[],
  guess: string,
): SlotStatus {
  const idx = stops.indexOf(guess)
  if (idx < 0) return 'not-on-route'
  for (let i = 0; i < idx; i++) {
    if (placements[i] === null) return 'wrong-order'
  }
  return 'correct'
}

/** Build a slot→station map from the guess log. */
export function computePlacements(stops: string[], slots: Slot[]): (string | null)[] {
  const placements: (string | null)[] = Array(stops.length).fill(null)
  for (const s of slots) {
    if (s.status === 'not-on-route') continue
    const idx = stops.indexOf(s.station)
    if (idx >= 0) placements[idx] = s.station
  }
  return placements
}

/** True once every route stop has been named (in any order). */
export function isRouteComplete(stops: string[], slots: Slot[]): boolean {
  const named = new Set(slots.filter(s => s.status !== 'not-on-route').map(s => s.station))
  return stops.every(s => named.has(s))
}
