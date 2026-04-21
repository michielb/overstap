/**
 * Running player stats (MB-464).
 *
 * Cumulative totals per mode so a future stats screen can surface averages,
 * accuracy, and perfect-round rate. Incremented exactly once per completed
 * game — the `statsRecorded` flag on the per-day game state is the guard
 * against double-counting on reload.
 */

import { useEffect, useState } from 'react'
import type { Mode } from '../data/types.js'
import { storage } from '../storage/index.js'

export interface ModeStats {
  gamesPlayed: number
  totalPoints: number
  totalStopsGuessed: number
  totalStopsPossible: number
  perfectRounds: number
}

export interface HardStats extends ModeStats {
  wrongGuesses: number
}

export interface Stats {
  easy: ModeStats
  hard: HardStats
  lastPlayedDate: string  // YYYY-MM-DD, '' if never played
}

export interface GameCompletion {
  mode: Mode
  date: string
  points: number
  stopsGuessed: number
  stopsPossible: number
  perfect: boolean          // earned the perfect-order bonus
  wrongGuesses: number      // hard mode only; ignored for easy
}

export interface DerivedStats {
  easy: { avgPoints: number; accuracy: number; perfectRate: number }
  hard: { avgPoints: number; accuracy: number; perfectRate: number }
}

const STATS_KEY = 'stats'
const STATS_VERSION = 1

function emptyModeStats(): ModeStats {
  return {
    gamesPlayed: 0,
    totalPoints: 0,
    totalStopsGuessed: 0,
    totalStopsPossible: 0,
    perfectRounds: 0,
  }
}

function emptyHardStats(): HardStats {
  return { ...emptyModeStats(), wrongGuesses: 0 }
}

export function emptyStats(): Stats {
  return { easy: emptyModeStats(), hard: emptyHardStats(), lastPlayedDate: '' }
}

function isValidModeStats(v: unknown): v is ModeStats {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.gamesPlayed === 'number' &&
    typeof o.totalPoints === 'number' &&
    typeof o.totalStopsGuessed === 'number' &&
    typeof o.totalStopsPossible === 'number' &&
    typeof o.perfectRounds === 'number'
  )
}

function isValidHardStats(v: unknown): v is HardStats {
  if (!isValidModeStats(v)) return false
  return typeof (v as { wrongGuesses?: unknown }).wrongGuesses === 'number'
}

function isValidStats(v: unknown): v is Stats {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (!isValidModeStats(o.easy)) return false
  if (!isValidHardStats(o.hard)) return false
  if (typeof o.lastPlayedDate !== 'string') return false
  return true
}

export function readStats(): Stats {
  const raw = storage.get<unknown>(STATS_KEY, STATS_VERSION)
  if (!isValidStats(raw)) return emptyStats()
  return {
    easy: { ...raw.easy },
    hard: { ...raw.hard },
    lastPlayedDate: raw.lastPlayedDate,
  }
}

const subscribers = new Set<() => void>()

function writeStats(stats: Stats): void {
  storage.set(STATS_KEY, stats, STATS_VERSION)
  subscribers.forEach(fn => { fn() })
}

/**
 * Increment the stored stats for a completed game. The caller is responsible
 * for guarding against double-counting (via `GameState.statsRecorded`).
 */
export function recordCompletion(entry: GameCompletion): Stats {
  const current = readStats()
  if (entry.mode === 'hard') {
    const next: Stats = {
      easy: current.easy,
      hard: {
        gamesPlayed: current.hard.gamesPlayed + 1,
        totalPoints: current.hard.totalPoints + entry.points,
        totalStopsGuessed: current.hard.totalStopsGuessed + entry.stopsGuessed,
        totalStopsPossible: current.hard.totalStopsPossible + entry.stopsPossible,
        perfectRounds: current.hard.perfectRounds + (entry.perfect ? 1 : 0),
        wrongGuesses: current.hard.wrongGuesses + entry.wrongGuesses,
      },
      lastPlayedDate: entry.date,
    }
    writeStats(next)
    return next
  }
  const next: Stats = {
    easy: {
      gamesPlayed: current.easy.gamesPlayed + 1,
      totalPoints: current.easy.totalPoints + entry.points,
      totalStopsGuessed: current.easy.totalStopsGuessed + entry.stopsGuessed,
      totalStopsPossible: current.easy.totalStopsPossible + entry.stopsPossible,
      perfectRounds: current.easy.perfectRounds + (entry.perfect ? 1 : 0),
    },
    hard: current.hard,
    lastPlayedDate: entry.date,
  }
  writeStats(next)
  return next
}

function safeDiv(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0
}

export function deriveStats(stats: Stats): DerivedStats {
  return {
    easy: {
      avgPoints: safeDiv(stats.easy.totalPoints, stats.easy.gamesPlayed),
      accuracy: safeDiv(stats.easy.totalStopsGuessed, stats.easy.totalStopsPossible),
      perfectRate: safeDiv(stats.easy.perfectRounds, stats.easy.gamesPlayed),
    },
    hard: {
      avgPoints: safeDiv(stats.hard.totalPoints, stats.hard.gamesPlayed),
      accuracy: safeDiv(stats.hard.totalStopsGuessed, stats.hard.totalStopsPossible),
      perfectRate: safeDiv(stats.hard.perfectRounds, stats.hard.gamesPlayed),
    },
  }
}

export function useStats(): { stats: Stats; derived: DerivedStats } {
  const [stats, setStats] = useState<Stats>(() => readStats())
  useEffect(() => {
    const listener = () => { setStats(readStats()) }
    subscribers.add(listener)
    return () => { subscribers.delete(listener) }
  }, [])
  return { stats, derived: deriveStats(stats) }
}
