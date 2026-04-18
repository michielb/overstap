/**
 * Puzzle selection for v2: "guess all stops on the route".
 *
 * A puzzle is a single-line segment (from, to, intermediate stops in order).
 * Players guess the intermediate stops one at a time.
 */

import type { Difficulty, LinePuzzle, NetworkGraph } from '../data/types.js'

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

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
  return date.split('-').reduce((acc, part) => acc * 1000 + parseInt(part), 0)
}

// ── Difficulty buckets (by intermediate-stop count) ──────────────────────────

export function classifyDifficulty(intermediateCount: number): Difficulty | null {
  if (intermediateCount < 2) return null       // 0–1: too trivial
  if (intermediateCount <= 4) return 'easy'    // 2–4
  if (intermediateCount <= 8) return 'medium'  // 5–8
  return 'hard'                                // 9+
}

// ── Candidate generation ─────────────────────────────────────────────────────

interface Candidate {
  from: string
  to: string
  stops: string[]
  line: string
  difficulty: Difficulty
}

/**
 * Enumerate all line-segment puzzles from the network.
 * Includes sub-segments of each line to broaden puzzle variety.
 * Dedupes by (from, to), keeping the variant with MORE intermediate stops.
 */
export function buildCandidates(graph: NetworkGraph): Candidate[] {
  const best = new Map<string, Candidate>()

  for (const [line, seq] of Object.entries(graph.lines)) {
    // Every (i, j) sub-segment where j > i+2 gives ≥2 intermediate stops
    for (let i = 0; i < seq.length; i++) {
      for (let j = i + 3; j < seq.length; j++) {
        const from = seq[i]
        const to = seq[j]
        const stops = seq.slice(i + 1, j)
        const difficulty = classifyDifficulty(stops.length)
        if (!difficulty) continue
        // Canonical key (unordered) so we don't get A→B and B→A as distinct puzzles
        const key = [from, to].sort().join('|')
        const existing = best.get(key)
        if (!existing || stops.length > existing.stops.length) {
          best.set(key, { from, to, stops, line, difficulty })
        }
      }
    }
  }

  return [...best.values()]
}

// ── Daily puzzle selector ────────────────────────────────────────────────────

/**
 * Returns today's puzzle. Same date → same puzzle for all players.
 *
 * Difficulty rotation: each day picks one of easy/medium/hard with equal chance,
 * then picks a puzzle from that bucket. If the chosen bucket is empty, falls back.
 */
export function getDailyPuzzle(graph: NetworkGraph, dateStr?: string): LinePuzzle {
  const date = dateStr ?? new Date().toISOString().slice(0, 10)
  const rng = mulberry32(dateToSeed(date))

  const candidates = buildCandidates(graph)
  const byDifficulty: Record<Difficulty, Candidate[]> = {
    easy: candidates.filter(c => c.difficulty === 'easy'),
    medium: candidates.filter(c => c.difficulty === 'medium'),
    hard: candidates.filter(c => c.difficulty === 'hard'),
  }

  const order: Difficulty[] = ['easy', 'medium', 'hard']
  const pickDifficulty = order[Math.floor(rng() * order.length)]

  // Pick a non-empty bucket, preferring the rolled one
  const buckets: Candidate[][] = [
    byDifficulty[pickDifficulty],
    ...order.filter(d => d !== pickDifficulty).map(d => byDifficulty[d]),
  ]
  const bucket = buckets.find(b => b.length > 0)

  if (!bucket || bucket.length === 0) {
    throw new Error('No puzzle candidates available in network data')
  }

  const pick = bucket[Math.floor(rng() * bucket.length)]

  return {
    date,
    from: pick.from,
    to: pick.to,
    stops: pick.stops,
    line: pick.line,
    difficulty: pick.difficulty,
  }
}

// ── Slot count ───────────────────────────────────────────────────────────────

/** Number of guess slots = ceil(stops × 1.3), min 3. */
export function slotCount(stopCount: number): number {
  return Math.max(3, Math.ceil(stopCount * 1.3))
}
