/**
 * Classify a single guess against the puzzle's ordered stop list.
 *
 * Rule (strict slot match):
 *   - If the station is not on the route → 'not-on-route'
 *   - Else if the guess lands in its correct slot — i.e. it equals
 *     `stops[slots.length]` — → 'correct'
 *   - Else → 'wrong-order'
 *
 * The Nth guess is evaluated against the Nth route stop. Naming a station
 * that's on the route but in the wrong slot yields 'wrong-order', whether it
 * was "too early" or "too late". Beyond stops.length (after wrong-order /
 * not-on-route fill slots past the route length) every on-route guess is
 * 'wrong-order'.
 */

import type { Slot, SlotStatus } from '../data/types.js'

export function classifyGuess(
  stops: string[],
  slots: Slot[],
  guess: string,
): SlotStatus {
  if (!stops.includes(guess)) return 'not-on-route'
  const expected = stops[slots.length]
  return guess === expected ? 'correct' : 'wrong-order'
}

/**
 * True once every route stop has been entered (as 'correct' or 'wrong-order').
 * The player has "completed the route" regardless of order.
 */
export function isRouteComplete(stops: string[], slots: Slot[]): boolean {
  const placed = new Set(slots.filter(s => s.status !== 'not-on-route').map(s => s.station))
  return stops.every(s => placed.has(s))
}
