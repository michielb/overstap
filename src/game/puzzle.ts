/**
 * Puzzle selection — deterministic, date-seeded.
 * Same puzzle for all players on the same day.
 */

import type { NetworkGraph, Puzzle } from '../data/types.js'
import { findRoutes } from './solver.js'

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dateToSeed(date: string): number {
  // "2026-04-14" → stable integer seed
  return date.split('-').reduce((acc, part) => acc * 1000 + parseInt(part), 0)
}

// ── Puzzle candidate generation ───────────────────────────────────────────────

interface PuzzleCandidate {
  from: string
  to: string
  transferCount: number
}

/**
 * Build a list of interesting puzzle candidates from the network.
 * Only includes routes with 1–3 transfers (too easy or too hard excluded).
 */
export function buildCandidates(graph: NetworkGraph): PuzzleCandidate[] {
  const transferStations = graph.transferStations
  const candidates: PuzzleCandidate[] = []
  const seen = new Set<string>()

  for (let i = 0; i < transferStations.length; i++) {
    for (let j = i + 1; j < transferStations.length; j++) {
      const from = transferStations[i]
      const to = transferStations[j]
      const key = [from, to].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      const route = findRoutes(graph, from, to)
      if (route.transferCount >= 1 && route.transferCount <= 3) {
        candidates.push({ from, to, transferCount: route.transferCount })
      }
    }
  }

  return candidates
}

// ── Daily puzzle selector ─────────────────────────────────────────────────────

/**
 * Returns today's puzzle. Deterministic: same date → same puzzle for all players.
 */
export function getDailyPuzzle(graph: NetworkGraph, dateStr?: string): Puzzle {
  const date = dateStr ?? new Date().toISOString().slice(0, 10)
  const seed = dateToSeed(date)
  const rng = mulberry32(seed)

  const candidates = buildCandidates(graph)
  if (candidates.length === 0) {
    // Fallback to a hardcoded known good puzzle
    return { date, from: 'ASD', to: 'GN', solution: [] }
  }

  const idx = Math.floor(rng() * candidates.length)
  const pick = candidates[idx]
  const route = findRoutes(graph, pick.from, pick.to)

  return {
    date,
    from: pick.from,
    to: pick.to,
    solution: route.transfers,
  }
}
