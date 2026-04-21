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

import { useReducer, useCallback, useMemo, useEffect, useRef } from 'react'
import type { LinePuzzle, Mode, Slot } from '../data/types.js'
import { classifyGuess, isRouteComplete } from './classify.js'
import { shuffleStops, slotCount } from './puzzle.js'
import { storage } from '../storage/index.js'
import { recordCompletion } from './stats.js'

export type GameStatus = 'playing' | 'won' | 'lost'

export interface HardGameState {
  mode: 'hard'
  puzzle: LinePuzzle
  status: GameStatus
  slots: Slot[]
  maxSlots: number
  statsRecorded: boolean
}

export interface EasyGameState {
  mode: 'easy'
  puzzle: LinePuzzle
  status: GameStatus
  shuffledStops: string[]          // pool order (fixed; persisted)
  placements: (string | null)[]    // length = stops.length; null = empty slot
  checked: boolean
  statsRecorded: boolean
}

export type GameState = HardGameState | EasyGameState

type Action =
  | { type: 'GUESS'; code: string }
  | { type: 'PLACE'; code: string; slot: number; fromSlot?: number }
  | { type: 'RETURN_TO_POOL'; slot: number }
  | { type: 'CHECK' }
  | { type: 'GIVE_UP' }
  | { type: 'STATS_RECORDED' }
  | { type: 'RESET'; puzzle: LinePuzzle; mode: Mode }

// Bump when GameState shape changes — old saves are then silently discarded.
// v4 (MB-479): keys gained a `:<category>` suffix so IC and Sprinter puzzles
// for the same date persist independently.
const STORAGE_VERSION = 4
const storageKey = (date: string, category: string) => `game:${date}:${category}`

function initialHardState(puzzle: LinePuzzle): HardGameState {
  return {
    mode: 'hard',
    puzzle,
    status: 'playing',
    slots: [],
    maxSlots: slotCount(puzzle.stops.length),
    statsRecorded: false,
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
    statsRecorded: false,
  }
}

function initialState(puzzle: LinePuzzle, mode: Mode): GameState {
  return mode === 'easy' ? initialEasyState(puzzle) : initialHardState(puzzle)
}

/**
 * Hydrate from storage if today's key exists and the stored puzzle still
 * matches. A puzzle mismatch means the generator shifted under the saved game
 * (rare: rebuild of network.json mid-day), in which case we start fresh.
 *
 * The stored `mode` wins over the requested one: within a day, the mode is
 * committed the first time it's saved (see MB-463 lock rules).
 */
function loadOrInit(puzzle: LinePuzzle, mode: Mode): GameState {
  const stored = storage.get<GameState>(storageKey(puzzle.date, puzzle.category), STORAGE_VERSION)
  if (!stored) return initialState(puzzle, mode)
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

/**
 * MB-463 lock: can the player still switch today's mode?
 *
 * - Easy is one-way. Once the pool is revealed the stations are seen, so we
 *   never allow easy → hard.
 * - Hard while playing: switching to easy is the "give up" path. Allowed even
 *   mid-game — the resulting score/share will reflect easy mode.
 * - Hard after the game ends: no more switching; the day is over.
 */
export function isModeLocked(state: GameState): boolean {
  if (state.mode === 'easy') return true
  return state.status !== 'playing'
}

/**
 * Derive a stats-completion entry from a terminal game state. Mirrors the
 * score/correct-count math in the useGameState hook's useMemo so the values
 * written to the stats store match what ScoreScreen displays.
 */
function buildCompletion(state: GameState): import('./stats.js').GameCompletion {
  const stopsPossible = state.puzzle.stops.length
  if (state.mode === 'hard') {
    const stopsGuessed = state.slots.filter(s => s.status !== 'not-on-route').length
    const orderBroken = state.slots.some(s => s.status === 'wrong-order')
    const wrongGuesses = state.slots.filter(s => s.status === 'not-on-route').length
    const perfect = state.status === 'won' && !orderBroken
    const points = stopsGuessed + (perfect ? 1 : 0)
    return {
      category: state.puzzle.category,
      mode: 'hard',
      date: state.puzzle.date,
      points,
      stopsGuessed,
      stopsPossible,
      perfect,
      wrongGuesses,
    }
  }
  const stopsGuessed = state.placements.reduce((n, code, i) => (
    code !== null && code === state.puzzle.stops[i] ? n + 1 : n
  ), 0)
  const orderBroken = stopsGuessed < stopsPossible
  const perfect = state.status === 'won' && !orderBroken
  const points = stopsGuessed + (perfect ? 1 : 0)
  return {
    category: state.puzzle.category,
    mode: 'easy',
    date: state.puzzle.date,
    points,
    stopsGuessed,
    stopsPossible,
    perfect,
    wrongGuesses: 0,
  }
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

    case 'GIVE_UP': {
      if (state.status !== 'playing') return state
      // Easy mode: flip `checked` so the solution reveal renders alongside any
      // current placements. Hard mode: just mark lost; the score screen and
      // map's revealAll path already handle the reveal from there.
      if (state.mode === 'easy') {
        return { ...state, status: 'lost', checked: true }
      }
      return { ...state, status: 'lost' }
    }

    case 'STATS_RECORDED': {
      if (state.statsRecorded) return state
      return { ...state, statsRecorded: true }
    }

    case 'RESET':
      return initialState(action.puzzle, action.mode)

    default:
      return state
  }
}

interface UseGameStateOptions {
  /**
   * When true, skip all persistence and stats side-effects. Used by practice
   * mode (MB-480) where each session is throwaway: nothing read from storage
   * on mount, nothing written on state change, nothing recorded on completion.
   */
  ephemeral?: boolean
}

export function useGameState(
  puzzle: LinePuzzle,
  mode: Mode = 'hard',
  options: UseGameStateOptions = {},
) {
  const ephemeral = options.ephemeral === true
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => ephemeral ? initialState(puzzle, mode) : loadOrInit(puzzle, mode),
  )

  useEffect(() => {
    if (ephemeral) return
    storage.set(storageKey(state.puzzle.date, state.puzzle.category), state, STORAGE_VERSION)
  }, [state, ephemeral])

  // Session-scoped guard so StrictMode's double-invoke of the effect below
  // doesn't record the same completion twice before the flag flips in state.
  const recordedKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (ephemeral) return
    if (state.status === 'playing' || state.statsRecorded) return
    const key = `${state.puzzle.date}:${state.puzzle.category}:${state.mode}`
    if (recordedKeysRef.current.has(key)) return
    recordedKeysRef.current.add(key)
    recordCompletion(buildCompletion(state))
    dispatch({ type: 'STATS_RECORDED' })
  }, [state, ephemeral])

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

  const giveUp = useCallback(() => {
    dispatch({ type: 'GIVE_UP' })
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
    giveUp,
    reset,
  }
}
