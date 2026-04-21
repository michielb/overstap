/**
 * Running player stats (MB-464, extended in MB-479).
 *
 * Cumulative totals per category × mode so the stats screen can surface IC and
 * Sprinter performance separately. Incremented exactly once per completed game
 * — the `statsRecorded` flag on the per-day game state is the guard against
 * double-counting on reload.
 *
 * Streak semantics (MB-479): `lastPlayedDate` moves whenever EITHER puzzle is
 * completed. Completing the second puzzle on the same day is a no-op for the
 * streak — one finished puzzle per day is enough to "play today".
 */

import { useEffect, useState } from 'react'
import type { Category, Mode } from '../data/types.js'
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

export interface CategoryStats {
  easy: ModeStats
  hard: HardStats
}

export interface Stats {
  ic: CategoryStats
  sprinter: CategoryStats
  lastPlayedDate: string  // YYYY-MM-DD, '' if never played
}

export interface GameCompletion {
  category: Category
  mode: Mode
  date: string
  points: number
  stopsGuessed: number
  stopsPossible: number
  perfect: boolean          // earned the perfect-order bonus
  wrongGuesses: number      // hard mode only; ignored for easy
}

export interface DerivedCategoryStats {
  easy: { avgPoints: number; accuracy: number; perfectRate: number }
  hard: { avgPoints: number; accuracy: number; perfectRate: number }
}

export interface DerivedStats {
  ic: DerivedCategoryStats
  sprinter: DerivedCategoryStats
}

const STATS_KEY = 'stats'
const STATS_VERSION = 2   // v1 = flat {easy,hard}; v2 = category-split

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

function emptyCategoryStats(): CategoryStats {
  return { easy: emptyModeStats(), hard: emptyHardStats() }
}

export function emptyStats(): Stats {
  return { ic: emptyCategoryStats(), sprinter: emptyCategoryStats(), lastPlayedDate: '' }
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

function isValidCategoryStats(v: unknown): v is CategoryStats {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return isValidModeStats(o.easy) && isValidHardStats(o.hard)
}

function isValidStats(v: unknown): v is Stats {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isValidCategoryStats(o.ic) &&
    isValidCategoryStats(o.sprinter) &&
    typeof o.lastPlayedDate === 'string'
  )
}

/**
 * One-time migration: a v1 envelope stored { easy, hard, lastPlayedDate } with
 * no category axis. Treat that history as IC (most early puzzles were IC-
 * flavoured) and zero the Sprinter side. Runs lazily the first time readStats
 * is called after the version bump.
 */
function migrateV1(): Stats | null {
  const raw = storage.get<unknown>(STATS_KEY, 1)
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (!isValidModeStats(o.easy) || !isValidHardStats(o.hard)) return null
  const migrated: Stats = {
    ic: { easy: { ...o.easy }, hard: { ...o.hard } },
    sprinter: emptyCategoryStats(),
    lastPlayedDate: typeof o.lastPlayedDate === 'string' ? o.lastPlayedDate : '',
  }
  storage.set(STATS_KEY, migrated, STATS_VERSION)
  return migrated
}

export function readStats(): Stats {
  const raw = storage.get<unknown>(STATS_KEY, STATS_VERSION)
  if (isValidStats(raw)) {
    return {
      ic: { easy: { ...raw.ic.easy }, hard: { ...raw.ic.hard } },
      sprinter: { easy: { ...raw.sprinter.easy }, hard: { ...raw.sprinter.hard } },
      lastPlayedDate: raw.lastPlayedDate,
    }
  }
  const migrated = migrateV1()
  return migrated ?? emptyStats()
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
  const cat = current[entry.category]
  const nextCat: CategoryStats = entry.mode === 'hard'
    ? {
        easy: cat.easy,
        hard: {
          gamesPlayed: cat.hard.gamesPlayed + 1,
          totalPoints: cat.hard.totalPoints + entry.points,
          totalStopsGuessed: cat.hard.totalStopsGuessed + entry.stopsGuessed,
          totalStopsPossible: cat.hard.totalStopsPossible + entry.stopsPossible,
          perfectRounds: cat.hard.perfectRounds + (entry.perfect ? 1 : 0),
          wrongGuesses: cat.hard.wrongGuesses + entry.wrongGuesses,
        },
      }
    : {
        easy: {
          gamesPlayed: cat.easy.gamesPlayed + 1,
          totalPoints: cat.easy.totalPoints + entry.points,
          totalStopsGuessed: cat.easy.totalStopsGuessed + entry.stopsGuessed,
          totalStopsPossible: cat.easy.totalStopsPossible + entry.stopsPossible,
          perfectRounds: cat.easy.perfectRounds + (entry.perfect ? 1 : 0),
        },
        hard: cat.hard,
      }
  const next: Stats = {
    ic: entry.category === 'ic' ? nextCat : current.ic,
    sprinter: entry.category === 'sprinter' ? nextCat : current.sprinter,
    lastPlayedDate: entry.date,   // either puzzle's completion moves the marker
  }
  writeStats(next)
  return next
}

function safeDiv(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0
}

function deriveCategory(cs: CategoryStats): DerivedCategoryStats {
  return {
    easy: {
      avgPoints: safeDiv(cs.easy.totalPoints, cs.easy.gamesPlayed),
      accuracy: safeDiv(cs.easy.totalStopsGuessed, cs.easy.totalStopsPossible),
      perfectRate: safeDiv(cs.easy.perfectRounds, cs.easy.gamesPlayed),
    },
    hard: {
      avgPoints: safeDiv(cs.hard.totalPoints, cs.hard.gamesPlayed),
      accuracy: safeDiv(cs.hard.totalStopsGuessed, cs.hard.totalStopsPossible),
      perfectRate: safeDiv(cs.hard.perfectRounds, cs.hard.gamesPlayed),
    },
  }
}

export function deriveStats(stats: Stats): DerivedStats {
  return { ic: deriveCategory(stats.ic), sprinter: deriveCategory(stats.sprinter) }
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
