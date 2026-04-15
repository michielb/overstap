/**
 * MB-394: Daily puzzle generator (deterministic, date-seeded)
 *
 * Difficulty by day of week:
 *   Mon/Tue       → easy   (1 transfer)
 *   Wed/Thu/Sat   → medium (2 transfers)
 *   Fri/Sun       → hard   (3–5 transfers)
 *
 * No-repeat: puzzles cycle through a shuffled pool without repeating
 * within ~90 days. Epoch-based shuffle means the cycle re-shuffles
 * every 90 days so players never see the same sequence twice.
 *
 * Puzzle numbering: #1 = 2026-04-14 (launch date).
 */

import type { NetworkGraph, Puzzle } from '../data/types.js'
import { findRoutes } from './solver.js'

// ── Constants ─────────────────────────────────────────────────────────────────

export const LAUNCH_DATE = '2026-04-14'

// ── PRNG (mulberry32) ─────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysSinceEpoch(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 86_400_000)
}

// ── Difficulty ────────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard'

export function dayDifficulty(dateStr: string): Difficulty {
  const dow = new Date(dateStr).getDay() // 0=Sun, 1=Mon, …, 6=Sat
  if (dow === 1 || dow === 2) return 'easy'   // Mon, Tue
  if (dow === 0 || dow === 5) return 'hard'   // Sun, Fri
  return 'medium'                              // Wed, Thu, Sat
}

// ── Candidate cache ───────────────────────────────────────────────────────────

interface PuzzleCandidate {
  from: string
  to: string
  transferCount: number
  difficulty: Difficulty
}

let _cache: PuzzleCandidate[] | null = null

export function buildCandidates(graph: NetworkGraph): PuzzleCandidate[] {
  if (_cache) return _cache

  const stations = graph.transferStations
  const candidates: PuzzleCandidate[] = []
  const seen = new Set<string>()

  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const key = [stations[i], stations[j]].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      const route = findRoutes(graph, stations[i], stations[j])
      const tc = route.transferCount
      if (tc < 1 || tc > 5) continue

      const difficulty: Difficulty = tc === 1 ? 'easy' : tc === 2 ? 'medium' : 'hard'
      candidates.push({ from: stations[i], to: stations[j], transferCount: tc, difficulty })
    }
  }

  _cache = candidates
  return candidates
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Puzzle number ─────────────────────────────────────────────────────────────

/** Days since launch; puzzle #1 = LAUNCH_DATE. */
export function getPuzzleNumber(dateStr?: string): number {
  const date = dateStr ?? new Date().toISOString().slice(0, 10)
  return Math.max(1, daysSinceEpoch(date) - daysSinceEpoch(LAUNCH_DATE) + 1)
}

// ── Daily puzzle ──────────────────────────────────────────────────────────────

export function getDailyPuzzle(graph: NetworkGraph, dateStr?: string): Puzzle {
  const date = dateStr ?? new Date().toISOString().slice(0, 10)
  const difficulty = dayDifficulty(date)
  const dayNum = daysSinceEpoch(date)

  const all = buildCandidates(graph)
  const pool = all.filter(c => c.difficulty === difficulty)
  const source = pool.length > 0 ? pool : all

  if (source.length === 0) return { date, from: 'ASD', to: 'GN', solution: [] }

  // 90-day no-repeat: shuffle pool with an epoch-derived seed so the same
  // shuffled order is used for every player on the same day.
  const cycleLen = Math.min(90, source.length)
  const epoch = Math.floor(dayNum / cycleLen)
  const diffSeed = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 100_000 : 200_000
  const rng = mulberry32(epoch * 31_337 + diffSeed)
  const shuffled = shuffle(source, rng)

  const pick = shuffled[dayNum % cycleLen % shuffled.length]
  const route = findRoutes(graph, pick.from, pick.to)

  return { date, from: pick.from, to: pick.to, solution: route.transfers }
}

// ── Practice puzzle (random) ──────────────────────────────────────────────────

export function getRandomPuzzle(
  graph: NetworkGraph,
  difficulty: Difficulty,
  recentPairs: string[] = [],
): Puzzle | null {
  const all = buildCandidates(graph)
  const pool = all.filter(c => c.difficulty === difficulty)

  const recentSet = new Set(recentPairs)
  const available = pool.filter(
    c => !recentSet.has(`${c.from}|${c.to}`) && !recentSet.has(`${c.to}|${c.from}`),
  )
  const source = available.length > 0 ? available : pool
  if (source.length === 0) return null

  const pick = source[Math.floor(Math.random() * source.length)]
  const route = findRoutes(graph, pick.from, pick.to)

  return {
    date: new Date().toISOString().slice(0, 10),
    from: pick.from,
    to: pick.to,
    solution: route.transfers,
  }
}
