/**
 * Game engine — state management and guess validation.
 *
 * Supports two modes:
 *   'daily'    — one puzzle per day, progress persisted in localStorage
 *   'practice' — unlimited random puzzles, no persistence
 */

import { useReducer, useCallback, useEffect } from 'react'
import type { NetworkGraph, Puzzle, GuessResult } from '../data/types.js'
import { findRoutes, validateGuess } from './solver.js'

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_GUESSES = 6

// ── Types ─────────────────────────────────────────────────────────────────────

export type GameStatus = 'playing' | 'won' | 'lost'
export type GameMode = 'daily' | 'practice'

export interface GuessRow {
  stations: string[]
  result: GuessResult
  isOptimal: boolean
}

export interface GameState {
  puzzle: Puzzle
  mode: GameMode
  status: GameStatus
  guesses: GuessRow[]
  currentInput: string[]
  solution: string[]
  allSolutions: string[][]
  transferCount: number
  shakingRowIdx: number | null  // row index currently playing shake animation
}

// ── localStorage persistence ──────────────────────────────────────────────────

export interface SavedDailyState {
  status: GameStatus
  guesses: GuessRow[]
}

export function loadDailyState(date: string): SavedDailyState | null {
  try {
    const raw = localStorage.getItem(`overstap_daily_${date}`)
    if (!raw) return null
    return JSON.parse(raw) as SavedDailyState
  } catch {
    return null
  }
}

function saveDailyState(date: string, status: GameStatus, guesses: GuessRow[]) {
  try {
    localStorage.setItem(`overstap_daily_${date}`, JSON.stringify({ status, guesses }))
  } catch { /* quota / private mode — silently ignore */ }
}

// ── Initial state factory ─────────────────────────────────────────────────────

function makeInitialState(
  puzzle: Puzzle,
  graph: NetworkGraph,
  mode: GameMode,
  saved?: SavedDailyState,
): GameState {
  const route = findRoutes(graph, puzzle.from, puzzle.to)
  return {
    puzzle,
    mode,
    status: saved?.status ?? 'playing',
    guesses: saved?.guesses ?? [],
    currentInput: [],
    solution: route.transfers,
    allSolutions: route.allRoutes,
    transferCount: route.transferCount,
    shakingRowIdx: null,
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_STATION'; code: string }
  | { type: 'REMOVE_LAST_STATION' }
  | { type: 'CLEAR_INPUT' }
  | { type: 'SUBMIT_GUESS' }
  | { type: 'CLEAR_SHAKE' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'ADD_STATION': {
      if (state.status !== 'playing') return state
      if (state.currentInput.includes(action.code)) return state
      if (action.code === state.puzzle.from || action.code === state.puzzle.to) return state
      return { ...state, currentInput: [...state.currentInput, action.code] }
    }

    case 'REMOVE_LAST_STATION': {
      if (state.currentInput.length === 0) return state
      return { ...state, currentInput: state.currentInput.slice(0, -1) }
    }

    case 'CLEAR_INPUT':
      return { ...state, currentInput: [] }

    case 'SUBMIT_GUESS': {
      if (state.status !== 'playing') return state
      const guess = state.currentInput

      const routeForValidation = {
        from: state.puzzle.from,
        to: state.puzzle.to,
        transfers: state.solution,
        allRoutes: state.allSolutions,
        transferCount: state.transferCount,
      }

      const rawResult = validateGuess(routeForValidation, guess)
      const result = { stations: guess, ...rawResult }
      const isOptimal = state.allSolutions.some(
        sol => sol.length === guess.length && sol.every((s, i) => s === guess[i]),
      )

      const row: GuessRow = { stations: guess, result, isOptimal }
      const newGuesses = [...state.guesses, row]

      let newStatus: GameStatus = 'playing'
      if (result.isWin) newStatus = 'won'
      else if (newGuesses.length >= MAX_GUESSES) newStatus = 'lost'

      return {
        ...state,
        guesses: newGuesses,
        currentInput: [],
        status: newStatus,
        // Trigger shake on wrong guesses only
        shakingRowIdx: result.isWin ? null : newGuesses.length - 1,
      }
    }

    case 'CLEAR_SHAKE':
      return { ...state, shakingRowIdx: null }

    default:
      return state
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGameState(
  puzzle: Puzzle,
  graph: NetworkGraph,
  mode: GameMode = 'daily',
  saved?: SavedDailyState,
) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => makeInitialState(puzzle, graph, mode, saved),
  )

  // Persist to localStorage after every guess (daily mode only)
  useEffect(() => {
    if (state.mode !== 'daily' || state.guesses.length === 0) return
    saveDailyState(state.puzzle.date, state.status, state.guesses)
  }, [state.mode, state.puzzle.date, state.status, state.guesses])

  const addStation        = useCallback((code: string) => dispatch({ type: 'ADD_STATION', code }), [])
  const removeLastStation = useCallback(() => dispatch({ type: 'REMOVE_LAST_STATION' }), [])
  const clearInput        = useCallback(() => dispatch({ type: 'CLEAR_INPUT' }), [])
  const submitGuess       = useCallback(() => dispatch({ type: 'SUBMIT_GUESS' }), [])
  const clearShake        = useCallback(() => dispatch({ type: 'CLEAR_SHAKE' }), [])

  return { state, addStation, removeLastStation, clearInput, submitGuess, clearShake }
}
