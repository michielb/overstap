/**
 * Preview the next N days of daily puzzles. Useful for vetting that the
 * category × size × geography mix feels varied before shipping.
 *
 * Usage:
 *   npm run preview-puzzles                 # next 14 days, one puzzle per day
 *   npm run preview-puzzles -- --days 30    # next 30 days
 *   npm run preview-puzzles -- --start 2026-05-01 --days 7
 *   npm run preview-puzzles -- --pair       # show IC + Sprinter side-by-side per day
 *   npm run preview-puzzles -- --stats      # cell-distribution summary
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LinePuzzle, NetworkGraph } from '../src/data/types.js'
import { getDailyPair, getDailyPuzzle } from '../src/game/puzzle.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CLI args ────────────────────────────────────────────────────────────────

interface Args {
  days: number
  start: string
  pair: boolean
  stats: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { days: 14, start: today(), pair: false, stats: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--days') out.days = parseInt(argv[++i], 10)
    else if (a === '--start') out.start = argv[++i]
    else if (a === '--pair') out.pair = true
    else if (a === '--stats') out.stats = true
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.start)) {
    console.error(`Invalid --start date: "${out.start}" (expected YYYY-MM-DD)`)
    process.exit(1)
  }
  if (out.days < 1 || out.days > 365) {
    console.error(`Invalid --days: ${out.days} (1–365)`)
    process.exit(1)
  }
  return out
}

function printHelp() {
  console.log(`preview-puzzles — show upcoming daily puzzles

  --days N       Number of days to preview (default 14)
  --start DATE   Start date YYYY-MM-DD (default today)
  --pair         Show IC + Sprinter per day instead of one puzzle
  --stats        Print category × size distribution summary
`)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// ── Rendering ───────────────────────────────────────────────────────────────

function loadGraph(): NetworkGraph {
  const path = resolve(__dirname, '../src/data/network.json')
  return JSON.parse(readFileSync(path, 'utf8')) as NetworkGraph
}

function short(graph: NetworkGraph, code: string): string {
  return graph.stations[code]?.nameShort ?? code
}

function tag(p: LinePuzzle): string {
  const cat = p.category === 'sprinter' ? 'SPR' : ' IC'
  const size = p.size.padEnd(6)
  const n = String(p.stops.length).padStart(2)
  return `${cat} ${size} ${n} stops`
}

function renderOne(graph: NetworkGraph, p: LinePuzzle): string {
  const from = short(graph, p.from)
  const to = short(graph, p.to)
  const via = p.stops.map(s => short(graph, s)).join(' · ')
  return `${from.padEnd(11)} → ${to.padEnd(11)}  via ${via}`
}

function renderDay(graph: NetworkGraph, date: string): string {
  const p = getDailyPuzzle(graph, date)
  return `${date}  ${tag(p)}  ${p.line.padEnd(10)}  ${renderOne(graph, p)}`
}

function renderPair(graph: NetworkGraph, date: string): string {
  const { ic, sprinter } = getDailyPair(graph, date)
  const icLine = ic
    ? `${tag(ic)}  ${ic.line.padEnd(10)}  ${renderOne(graph, ic)}`
    : '  (no IC candidates)'
  const sprLine = sprinter
    ? `${tag(sprinter)}  ${sprinter.line.padEnd(10)}  ${renderOne(graph, sprinter)}`
    : '  (no Sprinter candidates)'
  return `${date}\n  IC   ${icLine}\n  SPR  ${sprLine}`
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2))
const graph = loadGraph()

console.log(
  `\n=== Puzzle preview — ${args.days} days from ${args.start}` +
  (args.pair ? ' (pair mode)' : '') + ' ===\n',
)

const cellCount = new Map<string, number>()
const seenStations = new Map<string, number>()

for (let i = 0; i < args.days; i++) {
  const date = addDays(args.start, i)
  if (args.pair) {
    console.log(renderPair(graph, date))
  } else {
    console.log(renderDay(graph, date))
    const p = getDailyPuzzle(graph, date)
    const key = `${p.category}-${p.size}`
    cellCount.set(key, (cellCount.get(key) ?? 0) + 1)
    for (const s of [p.from, p.to, ...p.stops]) {
      seenStations.set(s, (seenStations.get(s) ?? 0) + 1)
    }
  }
}

if (args.stats && !args.pair) {
  console.log('\n── Cell distribution ──')
  const cells = ['ic-short', 'ic-medium', 'ic-long', 'sprinter-short', 'sprinter-medium', 'sprinter-long']
  for (const c of cells) {
    const n = cellCount.get(c) ?? 0
    const bar = '█'.repeat(n)
    console.log(`  ${c.padEnd(16)} ${String(n).padStart(3)}  ${bar}`)
  }
  console.log('\n── Most-reused stations (top 10) ──')
  const top = [...seenStations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [code, n] of top) {
    console.log(`  ${short(graph, code).padEnd(14)} ${n}×`)
  }
}

console.log()
