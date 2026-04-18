/**
 * Classify a single guess against the puzzle's ordered stop list.
 *
 * Rule:
 *   - If the station is not on the route → 'not-on-route'
 *   - Else if its route-position > all prior correctly-placed guesses → 'correct'
 *   - Else → 'wrong-order'
 *
 * The "prior correctly-placed" set = stations previously classified 'correct'.
 * Once 'wrong-order' is assigned it stays that way (no retroactive upgrade).
 */

import type { Slot, SlotStatus } from '../data/types.js'

export function classifyGuess(
  stops: string[],
  slots: Slot[],
  guess: string,
): SlotStatus {
  const pos = stops.indexOf(guess)
  if (pos === -1) return 'not-on-route'

  const maxCorrectPos = slots
    .filter(s => s.status === 'correct')
    .reduce((max, s) => Math.max(max, stops.indexOf(s.station)), -1)

  return pos > maxCorrectPos ? 'correct' : 'wrong-order'
}

/**
 * True once every route stop has been entered (as 'correct' or 'wrong-order').
 * The player has "completed the route" regardless of order.
 */
export function isRouteComplete(stops: string[], slots: Slot[]): boolean {
  const placed = new Set(slots.filter(s => s.status !== 'not-on-route').map(s => s.station))
  return stops.every(s => placed.has(s))
}
