/**
 * Game engine for v2: player guesses stops one at a time.
 *
 * Each guess is classified immediately as correct / wrong-order / not-on-route
 * and appended as a slot. The game ends when either every route stop has been
 * placed (win) or all slots are used (lose).
 */

import { useReducer, useCallback, useMemo } from 'react'
import type { LinePuzzle, Slot } from '../data/types.js'
import { classifyGuess, isRouteComplete } from './classify.js'
import { slotCount } from './puzzle.js'

export type GameStatus = 'playing' | 'won' | 'lost'

export interface GameState {
  puzzle: LinePuzzle
  status: GameStatus
  slots: Slot[]
  maxSlots: number
}

type Action =
  | { type: 'GUESS'; code: string }
  | { type: 'RESET'; puzzle: LinePuzzle }

function initialState(puzzle: LinePuzzle): GameState {
  return {
    puzzle,
    status: 'playing',
    slots: [],
    maxSlots: slotCount(puzzle.stops.length),
  }
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'GUESS': {
      if (state.status !== 'playing') return state
      if (state.slots.some(s => s.station === action.code)) return state  // no dupes
      if (action.code === state.puzzle.from || action.code === state.puzzle.to) return state

      const status = classifyGuess(state.puzzle.stops, state.slots, action.code)
      const nextSlots = [...state.slots, { station: action.code, status }]

      let nextStatus: GameStatus = 'playing'
      if (isRouteComplete(state.puzzle.stops, nextSlots)) nextStatus = 'won'
      else if (nextSlots.length >= state.maxSlots) nextStatus = 'lost'

      return { ...state, slots: nextSlots, status: nextStatus }
    }

    case 'RESET':
      return initialState(action.puzzle)

    default:
      return state
  }
}

export function useGameState(puzzle: LinePuzzle) {
  const initial = useMemo(() => initialState(puzzle), [puzzle])
  const [state, dispatch] = useReducer(reducer, initial)

  const guess = useCallback((code: string) => {
    dispatch({ type: 'GUESS', code })
  }, [])

  const reset = useCallback((newPuzzle: LinePuzzle) => {
    dispatch({ type: 'RESET', puzzle: newPuzzle })
  }, [])

  // Derived: codes the user has already placed (any status) — excluded from input
  const placedCodes = useMemo(
    () => state.slots.map(s => s.station),
    [state.slots],
  )

  const correctCount = state.slots.filter(s => s.status !== 'not-on-route').length
  const orderBroken = state.slots.some(s => s.status === 'wrong-order')
  const score = correctCount + (state.status === 'won' && !orderBroken ? 1 : 0)

  return { state, placedCodes, correctCount, orderBroken, score, guess, reset }
}
