/**
 * Game engine for v2: two modes on one reducer.
 *
 * Hard mode (default): player free-recalls stops one at a time; each guess is
 * classified correct / wrong-order / not-on-route and appended as a slot.
 *
 * Easy mode: all stops are shown shuffled in a pool; player places them into
 * the N slots (pool → slots, slots → pool, slots → slots). Submits once via
 * CHECK; each placement is then judged by absolute position.
 */

import { useReducer, useCallback, useMemo, useEffect } from 'react'
import type { LinePuzzle, Mode, Slot } from '../data/types.js'
import { classifyGuess, isRouteComplete } from './classify.js'
import { shuffleStops, slotCount } from './puzzle.js'
import { storage } from '../storage/index.js'

export type GameStatus = 'playing' | 'won' | 'lost'

export interface HardGameState {
  mode: 'hard'
  puzzle: LinePuzzle
  status: GameStatus
  slots: Slot[]
  maxSlots: number
}

export interface EasyGameState {
  mode: 'easy'
  puzzle: LinePuzzle
  status: GameStatus
  shuffledStops: string[]          // pool order (fixed; persisted)
  placements: (string | null)[]    // length = stops.length; null = empty slot
  checked: boolean
}

export type GameState = HardGameState | EasyGameState

type Action =
  | { type: 'GUESS'; code: string }
  | { type: 'PLACE'; code: string; slot: number; fromSlot?: number }
  | { type: 'RETURN_TO_POOL'; slot: number }
  | { type: 'CHECK' }
  | { type: 'RESET'; puzzle: LinePuzzle; mode: Mode }

// Bump when GameState shape changes — old saves are then silently discarded.
const STORAGE_VERSION = 2
const storageKey = (date: string) => `game:${date}`

function initialHardState(puzzle: LinePuzzle): HardGameState {
  return {
    mode: 'hard',
    puzzle,
    status: 'playing',
    slots: [],
    maxSlots: slotCount(puzzle.stops.length),
  }
}

function initialEasyState(puzzle: LinePuzzle): EasyGameState {
  return {
    mode: 'easy',
    puzzle,
    status: 'playing',
    shuffledStops: shuffleStops(puzzle.stops, puzzle.date),
    placements: Array.from({ length: puzzle.stops.length }, () => null),
    checked: false,
  }
}

function initialState(puzzle: LinePuzzle, mode: Mode): GameState {
  return mode === 'easy' ? initialEasyState(puzzle) : initialHardState(puzzle)
}

/**
 * Hydrate from storage if today's key exists and the stored puzzle + mode still
 * match. A puzzle mismatch means the generator shifted under the saved game; a
 * mode mismatch means the player switched modes (e.g. via URL flag). Both are
 * treated as "start fresh."
 */
function loadOrInit(puzzle: LinePuzzle, mode: Mode): GameState {
  const stored = storage.get<GameState>(storageKey(puzzle.date), STORAGE_VERSION)
  if (!stored) return initialState(puzzle, mode)
  if (stored.mode !== mode) return initialState(puzzle, mode)
  const p = stored.puzzle
  const matches =
    p &&
    p.date === puzzle.date &&
    p.from === puzzle.from &&
    p.to === puzzle.to &&
    Array.isArray(p.stops) &&
    p.stops.length === puzzle.stops.length &&
    p.stops.every((s, i) => s === puzzle.stops[i])
  return matches ? stored : initialState(puzzle, mode)
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'GUESS': {
      if (state.mode !== 'hard' || state.status !== 'playing') return state
      if (state.slots.some(s => s.station === action.code)) return state  // no dupes
      if (action.code === state.puzzle.from || action.code === state.puzzle.to) return state

      const status = classifyGuess(state.puzzle.stops, state.slots, action.code)
      const nextSlots = [...state.slots, { station: action.code, status }]

      let nextStatus: GameStatus = 'playing'
      if (isRouteComplete(state.puzzle.stops, nextSlots)) nextStatus = 'won'
      else if (nextSlots.length >= state.maxSlots) nextStatus = 'lost'

      return { ...state, slots: nextSlots, status: nextStatus }
    }

    case 'PLACE': {
      if (state.mode !== 'easy' || state.status !== 'playing') return state
      if (action.slot < 0 || action.slot >= state.placements.length) return state
      if (!state.shuffledStops.includes(action.code)) return state

      const placements = [...state.placements]
      const { slot: targetSlot, code, fromSlot } = action

      if (fromSlot !== undefined && fromSlot !== targetSlot) {
        // Slot-to-slot drag: swap occupants. If target is empty, the swap is
        // equivalent to a plain move (source becomes null).
        if (fromSlot < 0 || fromSlot >= placements.length) return state
        if (placements[fromSlot] !== code) return state  // stale drag payload
        placements[fromSlot] = placements[targetSlot]
        placements[targetSlot] = code
      } else {
        // Pool-to-slot (or self-drop): clear the code from any existing slot,
        // then drop it on the target. The target's prior occupant (if any)
        // returns to the pool (pool = shuffledStops minus placements).
        for (let i = 0; i < placements.length; i++) {
          if (placements[i] === code) placements[i] = null
        }
        placements[targetSlot] = code
      }
      return { ...state, placements }
    }

    case 'RETURN_TO_POOL': {
      if (state.mode !== 'easy' || state.status !== 'playing') return state
      if (action.slot < 0 || action.slot >= state.placements.length) return state
      const placements = [...state.placements]
      placements[action.slot] = null
      return { ...state, placements }
    }

    case 'CHECK': {
      if (state.mode !== 'easy' || state.status !== 'playing') return state
      if (state.placements.some(p => p === null)) return state
      return { ...state, checked: true, status: 'won' }
    }

    case 'RESET':
      return initialState(action.puzzle, action.mode)

    default:
      return state
  }
}

export function useGameState(puzzle: LinePuzzle, mode: Mode = 'hard') {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadOrInit(puzzle, mode))

  useEffect(() => {
    storage.set(storageKey(state.puzzle.date), state, STORAGE_VERSION)
  }, [state])

  const guess = useCallback((code: string) => {
    dispatch({ type: 'GUESS', code })
  }, [])

  const place = useCallback((code: string, slot: number, fromSlot?: number) => {
    dispatch({ type: 'PLACE', code, slot, fromSlot })
  }, [])

  const returnToPool = useCallback((slot: number) => {
    dispatch({ type: 'RETURN_TO_POOL', slot })
  }, [])

  const check = useCallback(() => {
    dispatch({ type: 'CHECK' })
  }, [])

  const reset = useCallback((newPuzzle: LinePuzzle, newMode: Mode) => {
    dispatch({ type: 'RESET', puzzle: newPuzzle, mode: newMode })
  }, [])

  // ── Hard-mode derived fields ───────────────────────────────────────────────
  // In easy mode these are derived from placements so the same view-model shape
  // can feed the ScoreScreen.

  const placedCodes = useMemo(() => {
    if (state.mode === 'hard') return state.slots.map(s => s.station)
    return state.placements.filter((c): c is string => c !== null)
  }, [state])

  const { correctCount, orderBroken, score, slotsForScore } = useMemo(() => {
    if (state.mode === 'hard') {
      const correct = state.slots.filter(s => s.status !== 'not-on-route').length
      const broken = state.slots.some(s => s.status === 'wrong-order')
      const s = correct + (state.status === 'won' && !broken ? 1 : 0)
      return { correctCount: correct, orderBroken: broken, score: s, slotsForScore: state.slots }
    }
    // Easy mode: synthesize Slot[] from placements + true order.
    const slots: Slot[] = state.placements.map((code, i) => {
      if (code === null) return { station: '', status: 'wrong-order' as const }
      const isCorrect = code === state.puzzle.stops[i]
      return { station: code, status: isCorrect ? 'correct' : 'wrong-order' }
    })
    const placedSlots = slots.filter(s => s.station !== '')
    const correct = placedSlots.filter(s => s.status === 'correct').length
    const broken = placedSlots.some(s => s.status === 'wrong-order')
    const s = state.checked ? correct + (!broken ? 1 : 0) : 0
    return { correctCount: correct, orderBroken: broken, score: s, slotsForScore: placedSlots }
  }, [state])

  return {
    state,
    placedCodes,
    correctCount,
    orderBroken,
    score,
    slotsForScore,
    guess,
    place,
    returnToPool,
    check,
    reset,
  }
}
