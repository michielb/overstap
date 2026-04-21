/**
 * Puzzle selection for v2: "guess all stops on the route".
 *
 * A puzzle is a single-line segment (from, to, intermediate stops in order).
 * Each day picks one cell of the 2×3 grid {IC, Sprinter} × {short, medium, long},
 * with an anti-repeat window so consecutive days don't land on overlapping routes.
 */

import type { Category, LinePuzzle, NetworkGraph, Size } from '../data/types.js'
import pinnedData from '../data/pinned-puzzles.json'

// ── Pinned overrides ─────────────────────────────────────────────────────────
// Author-curated puzzles keyed by YYYY-MM-DD. When present, they short-circuit
// the seeded random pick so a specific trip ships on a specific date.

interface Pin {
  line: string       // must match a key in NetworkGraph.lines
  from: string       // endpoint station code (order within the line doesn't matter)
  to: string
}
const pins = pinnedData as Record<string, Pin>

function resolvePin(graph: NetworkGraph, date: string): LinePuzzle | null {
  const pin = pins[date]
  if (!pin) return null
  const seq = graph.lines[pin.line]
  if (!seq) return null
  const i = seq.indexOf(pin.from)
  const j = seq.indexOf(pin.to)
  if (i < 0 || j < 0 || i === j) return null
  const [lo, hi] = i < j ? [i, j] : [j, i]
  const slice = seq.slice(lo + 1, hi)
  const stops = i < j ? slice : [...slice].reverse()
  const size = classifySize(stops.length)
  if (!size) return null
  return {
    date, from: pin.from, to: pin.to, stops,
    line: pin.line,
    category: classifyCategory(pin.line),
    size,
  }
}

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

function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// ── Classification ───────────────────────────────────────────────────────────

/** IC / ICD / Thalys / International → 'ic'; SPR / Stoptrein → 'sprinter'. */
export function classifyCategory(line: string): Category {
  const prefix = line.split('-')[0]
  return prefix === 'SPR' || prefix === 'ST' ? 'sprinter' : 'ic'
}

/** Map intermediate-stop count to a size bucket. Targets: ~4, ~7, ~12. */
export function classifySize(intermediateCount: number): Size | null {
  if (intermediateCount < 3) return null        // too trivial
  if (intermediateCount <= 5) return 'short'    // 3–5  (centred ~4)
  if (intermediateCount <= 8) return 'medium'   // 6–8  (centred ~7)
  return 'long'                                 // 9+   (centred ~12)
}

// ── Candidate generation ─────────────────────────────────────────────────────

interface Candidate {
  from: string
  to: string
  stops: string[]
  line: string
  category: Category
  size: Size
}

/**
 * Enumerate all line-segment puzzles from the network. Each sub-segment of
 * a line with ≥3 intermediate stops becomes a candidate. Dedupes by
 * {from, to, category} — IC and Sprinter variants on the same corridor are
 * kept as distinct puzzles. Within a (from, to, category) group, keeps the
 * variant with MORE intermediate stops (i.e. the fullest stopping pattern).
 */
export function buildCandidates(graph: NetworkGraph): Candidate[] {
  const best = new Map<string, Candidate>()

  for (const [line, seq] of Object.entries(graph.lines)) {
    const category = classifyCategory(line)
    for (let i = 0; i < seq.length; i++) {
      for (let j = i + 4; j < seq.length; j++) {  // j ≥ i+4 → ≥3 intermediate stops
        const from = seq[i]
        const to = seq[j]
        const stops = seq.slice(i + 1, j)
        const size = classifySize(stops.length)
        if (!size) continue
        const key = [from, to].sort().join('|') + '|' + category
        const existing = best.get(key)
        if (!existing || stops.length > existing.stops.length) {
          best.set(key, { from, to, stops, line, category, size })
        }
      }
    }
  }

  return [...best.values()]
}

// ── Daily puzzle selector ────────────────────────────────────────────────────

const CELLS: ReadonlyArray<[Category, Size]> = [
  ['ic', 'short'], ['ic', 'medium'], ['ic', 'long'],
  ['sprinter', 'short'], ['sprinter', 'medium'], ['sprinter', 'long'],
]

/** Days of history to avoid station overlap with. */
const LOOKBACK_DAYS = 5

interface DailyOptions {
  /** If false, skip the anti-repeat lookback. Used internally to bound recursion. */
  avoidRecent?: boolean
  /** Restrict to a specific category (for the "two puzzles per day" preview). */
  onlyCategory?: Category
}

/**
 * Returns the daily puzzle. Same date → same puzzle for all players.
 *
 * Selection:
 *   1. Honour pinned overrides.
 *   2. Roll a cell (category × size) seeded by the date.
 *   3. Fall through empty cells (same category first, then across).
 *   4. Within the cell, pick the first candidate that doesn't share any
 *      station with the previous {LOOKBACK_DAYS} days. If none qualify,
 *      take the first (fully seeded).
 */
export function getDailyPuzzle(
  graph: NetworkGraph,
  dateStr?: string,
  options: DailyOptions = {},
): LinePuzzle {
  const date = dateStr ?? new Date().toISOString().slice(0, 10)

  const pinned = resolvePin(graph, date)
  if (pinned && (!options.onlyCategory || options.onlyCategory === pinned.category)) {
    return pinned
  }

  const rng = mulberry32(dateToSeed(date) ^ (options.onlyCategory === 'sprinter' ? 0xa5a5 : 0))
  const candidates = buildCandidates(graph)

  // Build cell preference order
  const rolledIdx = Math.floor(rng() * CELLS.length)
  let order = [CELLS[rolledIdx], ...CELLS.filter((_, i) => i !== rolledIdx)]
  if (options.onlyCategory) {
    const [same, other] = [
      order.filter(c => c[0] === options.onlyCategory),
      order.filter(c => c[0] !== options.onlyCategory),
    ]
    order = [...same, ...other]   // prefer requested category, fall back across
  }

  // Collect stations used in the recent window so we can avoid overlap
  const recentStations = new Set<string>()
  if (options.avoidRecent !== false) {
    for (let i = 1; i <= LOOKBACK_DAYS; i++) {
      try {
        const prev = getDailyPuzzle(graph, addDays(date, -i), {
          avoidRecent: false,
          onlyCategory: options.onlyCategory,
        })
        recentStations.add(prev.from)
        recentStations.add(prev.to)
        prev.stops.forEach(s => recentStations.add(s))
      } catch {
        /* no candidates that far back — ignore */
      }
    }
  }

  for (const [cat, size] of order) {
    const bucket = candidates.filter(c => c.category === cat && c.size === size)
    if (bucket.length === 0) continue

    // Deterministic Fisher-Yates shuffle
    const shuffled = [...bucket]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const pick = shuffled.find(c =>
      !recentStations.has(c.from) &&
      !recentStations.has(c.to) &&
      !c.stops.some(s => recentStations.has(s)),
    ) ?? shuffled[0]

    return {
      date,
      from: pick.from,
      to: pick.to,
      stops: pick.stops,
      line: pick.line,
      category: pick.category,
      size: pick.size,
    }
  }

  throw new Error('No puzzle candidates available in network data')
}

/**
 * Pair-per-day preview helper: returns one IC puzzle and one Sprinter puzzle
 * for the same date. The two use different seeds so they're independent picks.
 * Returns `null` for either side if no candidates exist in that category.
 */
export function getDailyPair(
  graph: NetworkGraph,
  dateStr?: string,
): { ic: LinePuzzle | null; sprinter: LinePuzzle | null } {
  const tryCat = (cat: Category): LinePuzzle | null => {
    try {
      const p = getDailyPuzzle(graph, dateStr, { onlyCategory: cat })
      return p.category === cat ? p : null  // don't leak fallbacks across categories
    } catch {
      return null
    }
  }
  return { ic: tryCat('ic'), sprinter: tryCat('sprinter') }
}

// ── Slot count ───────────────────────────────────────────────────────────────

/** Number of guess slots = ceil(stops × 1.3), min 3. */
export function slotCount(stopCount: number): number {
  return Math.max(3, Math.ceil(stopCount * 1.3))
}

// ── Deterministic shuffle for easy-mode pool ─────────────────────────────────

/**
 * Deterministic Fisher-Yates shuffle seeded by date. Same date → same order for
 * all players, so reloads show the same pool arrangement.
 * The seed is xored with a constant so it doesn't collide with the daily-puzzle
 * RNG stream.
 */
export function shuffleStops(stops: string[], dateStr: string): string[] {
  const rng = mulberry32(dateToSeed(dateStr) ^ 0x5e51cafe)
  const arr = [...stops]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
