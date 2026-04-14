/**
 * MB-392: Game engine — state management and guess validation
 *
 * Manages the full game lifecycle: puzzle setup, guess submission,
 * per-guess feedback, win/lose detection.
 */

import { useReducer, useCallback } from 'react'
import type { NetworkGraph, Puzzle, GuessResult } from '../data/types.js'
import { findRoutes, validateGuess } from './solver.js'

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_GUESSES = 6

// ── State ────────────────────────────────────────────────────────────────────

export type GameStatus = 'playing' | 'won' | 'lost'

export interface GuessRow {
  stations: string[]    // station codes the player guessed
  result: GuessResult   // correctness per station
  isOptimal: boolean    // guess matches the optimal solution
}

export interface GameState {
  puzzle: Puzzle
  status: GameStatus
  guesses: GuessRow[]
  currentInput: string[]  // stations being built up for the current guess
  solution: string[]      // the optimal transfer stations (hidden from player)
  allSolutions: string[][]
  transferCount: number   // number of transfers in optimal route
}

// ── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_STATION'; code: string }
  | { type: 'REMOVE_LAST_STATION' }
  | { type: 'CLEAR_INPUT' }
  | { type: 'SUBMIT_GUESS' }
  | { type: 'RESET'; puzzle: Puzzle; graph: NetworkGraph }

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'ADD_STATION': {
      if (state.status !== 'playing') return state
      if (state.currentInput.includes(action.code)) return state  // no dupes
      if (action.code === state.puzzle.from || action.code === state.puzzle.to) return state
      return { ...state, currentInput: [...state.currentInput, action.code] }
    }

    case 'REMOVE_LAST_STATION': {
      if (state.currentInput.length === 0) return state
      return { ...state, currentInput: state.currentInput.slice(0, -1) }
    }

    case 'CLEAR_INPUT': {
      return { ...state, currentInput: [] }
    }

    case 'SUBMIT_GUESS': {
      if (state.status !== 'playing') return state
      const guess = state.currentInput

      // Build a Route object for validation
      const route = {
        from: state.puzzle.from,
        to: state.puzzle.to,
        transfers: state.solution,
        allRoutes: state.allSolutions,
        transferCount: state.transferCount,
      }

      const result = validateGuess(route, guess)
      const isOptimal = state.allSolutions.some(
        sol => sol.length === guess.length && sol.every((s, i) => s === guess[i])
      )

      const row: GuessRow = { stations: guess, result, isOptimal }
      const newGuesses = [...state.guesses, row]

      let status: GameStatus = 'playing'
      if (result.isWin) status = 'won'
      else if (newGuesses.length >= MAX_GUESSES) status = 'lost'

      return {
        ...state,
        guesses: newGuesses,
        currentInput: [],
        status,
      }
    }

    case 'RESET': {
      const route = findRoutes(action.graph, action.puzzle.from, action.puzzle.to)
      return {
        puzzle: action.puzzle,
        status: 'playing',
        guesses: [],
        currentInput: [],
        solution: route.transfers,
        allSolutions: route.allRoutes,
        transferCount: route.transferCount,
      }
    }

    default:
      return state
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGameState(puzzle: Puzzle, graph: NetworkGraph) {
  const route = findRoutes(graph, puzzle.from, puzzle.to)

  const [state, dispatch] = useReducer(reducer, {
    puzzle,
    status: 'playing' as GameStatus,
    guesses: [],
    currentInput: [],
    solution: route.transfers,
    allSolutions: route.allRoutes,
    transferCount: route.transferCount,
  })

  const addStation = useCallback((code: string) => {
    dispatch({ type: 'ADD_STATION', code })
  }, [])

  const removeLastStation = useCallback(() => {
    dispatch({ type: 'REMOVE_LAST_STATION' })
  }, [])

  const clearInput = useCallback(() => {
    dispatch({ type: 'CLEAR_INPUT' })
  }, [])

  const submitGuess = useCallback(() => {
    dispatch({ type: 'SUBMIT_GUESS' })
  }, [])

  const reset = useCallback((newPuzzle: Puzzle) => {
    dispatch({ type: 'RESET', puzzle: newPuzzle, graph })
  }, [graph])

  return { state, addStation, removeLastStation, clearInput, submitGuess, reset }
}
