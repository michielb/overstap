/**
 * MB-386: Build network graph from raw NS API data
 *
 * Reads scripts/data/raw/stations.json and scripts/data/raw/trips.json,
 * builds an adjacency graph of IC connections, flags transfer stations,
 * and writes src/data/network.json.
 *
 * Usage: npm run build-network
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NetworkGraph, Station, AdjacencyEntry } from '../src/data/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = resolve(__dirname, 'data/raw')
const OUT_PATH = resolve(__dirname, '../src/data/network.json')

// ── Load raw data ────────────────────────────────────────────────────────────

console.log('\n=== Build Network Graph ===\n')

const rawStations: RawStation[] = JSON.parse(
  readFileSync(resolve(RAW_DIR, 'stations.json'), 'utf8'),
)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawTrips: any[] = JSON.parse(
  readFileSync(resolve(RAW_DIR, 'trips.json'), 'utf8'),
)

console.log(`Loaded ${rawStations.length} stations, ${rawTrips.length} route pairs`)

// ── Types for raw API data ───────────────────────────────────────────────────

interface RawStation {
  code: string
  land: string
  stationType: string
  lat: number
  lng: number
  namen: { lang: string; middel: string; kort: string }
  UICCode: string
}

interface RawStop {
  uicCode: string
  name: string
  routeIdx: number
  cancelled?: boolean
  passing?: boolean
}

// ── Build UIC → NS code map ──────────────────────────────────────────────────

const uicToCode = new Map<string, string>()
const stationByCode = new Map<string, RawStation>()

for (const s of rawStations) {
  if (s.code && s.UICCode) {
    uicToCode.set(s.UICCode, s.code)
    stationByCode.set(s.code, s)
  }
}
console.log(`UIC map: ${uicToCode.size} entries`)

// ── Extract stop sequences from trip legs ────────────────────────────────────

interface RoutePattern {
  trainNumber: string
  line: string           // categoryCode+number
  stops: string[]        // ordered NS station codes
  operatorCode: string
}

const patterns: RoutePattern[] = []

for (const entry of rawTrips) {
  const legs = entry.trip?.legs ?? []
  for (const leg of legs) {
    const rawStops: RawStop[] = leg.stops ?? []
    const product = leg.product ?? {}
    // Include NS + NL regional operators (Arriva, Keolis, Connexxion)
    // that operate rail services in the Netherlands
    const NL_RAIL_OPERATORS = ['NS', 'ARR', 'KEO', 'CXX', 'R-NET', 'EBS', 'QBUZZ']
    const isNLRail = NL_RAIL_OPERATORS.includes(product.operatorCode) ||
      (product.type === 'TRAIN' && rawStations.some(
        (s: RawStation) => s.land === 'NL' && s.code === leg.origin?.stationCode
      ))
    if (!isNLRail && product.type !== 'TRAIN') continue
    if (!['IC', 'ICD', 'SPR', 'ST', 'THA', 'INT'].includes(product.categoryCode ?? '')) continue

    // Sort by routeIdx, filter out passing/cancelled stops
    const sorted = rawStops
      .filter((s: RawStop) => !s.passing && !s.cancelled)
      .sort((a: RawStop, b: RawStop) => a.routeIdx - b.routeIdx)

    const codes: string[] = []
    for (const stop of sorted) {
      const code = uicToCode.get(stop.uicCode)
      if (code) codes.push(code)
    }

    if (codes.length >= 2) {
      patterns.push({
        trainNumber: product.number,
        line: `${product.categoryCode}-${product.number}`,
        stops: codes,
        operatorCode: product.operatorCode,
      })
    }
  }
}

console.log(`Extracted ${patterns.length} route patterns`)

// Deduplicate patterns with identical stop sequences
const seenPatterns = new Map<string, RoutePattern>()
for (const p of patterns) {
  const key = p.stops.join('-')
  if (!seenPatterns.has(key)) seenPatterns.set(key, p)
}
const uniquePatterns = Array.from(seenPatterns.values())
console.log(`Unique route patterns: ${uniquePatterns.length}`)

// ── Build adjacency list ─────────────────────────────────────────────────────

// edge key: "FROM-TO-LINE"
const edges = new Map<string, { from: string; to: string; line: string; durationMin: number }>()
const stationLines = new Map<string, Set<string>>()  // code → set of line patterns

for (const pattern of uniquePatterns) {
  for (let i = 0; i < pattern.stops.length; i++) {
    const code = pattern.stops[i]
    if (!stationLines.has(code)) stationLines.set(code, new Set())
    stationLines.get(code)!.add(pattern.line)

    if (i + 1 < pattern.stops.length) {
      const next = pattern.stops[i + 1]
      const fwdKey = `${code}-${next}-${pattern.line}`
      const bwdKey = `${next}-${code}-${pattern.line}`
      if (!edges.has(fwdKey)) {
        edges.set(fwdKey, { from: code, to: next, line: pattern.line, durationMin: 0 })
      }
      if (!edges.has(bwdKey)) {
        edges.set(bwdKey, { from: next, to: code, line: pattern.line, durationMin: 0 })
      }
    }
  }
}

console.log(`Edges: ${edges.size} (bidirectional)`)

// ── Identify transfer stations ───────────────────────────────────────────────

// A transfer station: appears in 2+ distinct route patterns that have
// different directions or endpoints (i.e., changing here makes sense).
// Simple heuristic: station appears in 3+ distinct patterns.
const transferStations = new Set<string>()
for (const [code, lines] of stationLines) {
  if (lines.size >= 2) transferStations.add(code)
}
console.log(`Transfer stations (2+ lines): ${transferStations.size}`)

// ── Build final graph ────────────────────────────────────────────────────────

// Only include NL stations that appear in at least one route pattern
const activeStations = new Set<string>()
for (const p of uniquePatterns) p.stops.forEach(s => activeStations.add(s))

const stations: Record<string, Station> = {}
for (const code of activeStations) {
  const raw = stationByCode.get(code)
  if (!raw) continue
  if (raw.land !== 'NL') continue  // Dutch stations only
  const lines = Array.from(stationLines.get(code) ?? [])
  stations[code] = {
    code,
    name: raw.namen.lang,
    nameShort: raw.namen.kort,
    lat: raw.lat,
    lng: raw.lng,
    isTransfer: transferStations.has(code),
    lines,
  }
}

const adjacency: Record<string, AdjacencyEntry[]> = {}
for (const edge of edges.values()) {
  // Only include edges where both stations are in our final set
  if (!stations[edge.from] || !stations[edge.to]) continue
  if (!adjacency[edge.from]) adjacency[edge.from] = []
  // Deduplicate: skip if same from→to on same line already exists
  const exists = adjacency[edge.from].some(e => e.to === edge.to && e.line === edge.line)
  if (!exists) {
    adjacency[edge.from].push({
      to: edge.to,
      line: edge.line,
      durationMin: edge.durationMin,
    })
  }
}

const lineMap: Record<string, string[]> = {}
for (const p of uniquePatterns) {
  lineMap[p.line] = p.stops.filter(s => stations[s])
}

// ── Synthesize Sprinter variants from IC lines using spoorkaart topology ─────
// A Sprinter on the same corridor stops at every physical station between the
// IC stops. We reconstruct that stopping pattern by BFS through the raw
// spoorkaart (physical track graph) for each consecutive IC-stop pair.

console.log('\n📡 Synthesizing Sprinter variants from physical topology...')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spoorkaart: any[] = JSON.parse(
  readFileSync(resolve(RAW_DIR, 'spoorkaart.json'), 'utf8'),
)
const physAdj = new Map<string, Set<string>>()
for (const f of spoorkaart) {
  const a = String(f.properties?.from ?? '').toUpperCase()
  const b = String(f.properties?.to ?? '').toUpperCase()
  if (!a || !b) continue
  if (!physAdj.has(a)) physAdj.set(a, new Set())
  if (!physAdj.has(b)) physAdj.set(b, new Set())
  physAdj.get(a)!.add(b)
  physAdj.get(b)!.add(a)
}

function physPath(start: string, goal: string): string[] | null {
  if (start === goal) return [start]
  const q: string[][] = [[start]]
  const seen = new Set([start])
  while (q.length) {
    const path = q.shift()!
    const head = path[path.length - 1]
    for (const next of physAdj.get(head) ?? []) {
      if (seen.has(next)) continue
      if (next === goal) return [...path, next]
      seen.add(next)
      q.push([...path, next])
    }
  }
  return null
}

const IC_PREFIXES = new Set(['IC', 'ICD', 'INT', 'THA'])
const synthLines: Record<string, string[]> = {}
const discoveredStations = new Set<string>()   // Sprinter stops introduced by synthesis

let synthesized = 0
let skippedNoGain = 0
let skippedNoPath = 0

for (const [icLine, icStops] of Object.entries(lineMap)) {
  const prefix = icLine.split('-')[0]
  if (!IC_PREFIXES.has(prefix)) continue
  if (icStops.length < 2) continue

  const fullStops: string[] = [icStops[0]]
  let broken = false
  for (let i = 0; i < icStops.length - 1; i++) {
    const seg = physPath(icStops[i], icStops[i + 1])
    if (!seg || seg.length < 2) { broken = true; break }
    // Drop first node (already appended as last of previous segment)
    for (let k = 1; k < seg.length; k++) fullStops.push(seg[k])
  }
  if (broken) { skippedNoPath++; continue }

  // Skip if the Sprinter adds nothing (e.g. Alkmaar-Den Helder: IC stops everywhere anyway)
  if (fullStops.length === icStops.length) { skippedNoGain++; continue }

  const sprLine = `SPR-SYN-${icLine.split('-').slice(1).join('-')}`
  synthLines[sprLine] = fullStops
  synthesized++
  for (const s of fullStops) {
    if (!stations[s]) discoveredStations.add(s)
  }
}

console.log(`  ✅ Synthesized ${synthesized} Sprinter lines`)
console.log(`  ℹ️  Skipped ${skippedNoGain} (no extra stops vs IC) · ${skippedNoPath} (incomplete physical path)`)
console.log(`  ℹ️  Discovered ${discoveredStations.size} new Sprinter-only stations from spoorkaart expansion`)

// Add the newly-discovered Sprinter-only stations to `stations` so the UI/map
// can resolve them. Mark them with their synth line memberships.
const synthStationLines = new Map<string, Set<string>>()
for (const [sprLine, stops] of Object.entries(synthLines)) {
  for (const code of stops) {
    if (!synthStationLines.has(code)) synthStationLines.set(code, new Set())
    synthStationLines.get(code)!.add(sprLine)
  }
}

for (const code of discoveredStations) {
  const raw = stationByCode.get(code)
  if (!raw || raw.land !== 'NL') continue
  const lines = Array.from(synthStationLines.get(code) ?? [])
  stations[code] = {
    code,
    name: raw.namen.lang,
    nameShort: raw.namen.kort,
    lat: raw.lat,
    lng: raw.lng,
    isTransfer: false,  // we don't re-evaluate transfer status for synth-only stops
    lines,
  }
}

// Also append synth lines to the `lines` membership of existing stations
for (const [code, sprLineSet] of synthStationLines) {
  if (!stations[code]) continue
  const merged = new Set([...stations[code].lines, ...sprLineSet])
  stations[code] = { ...stations[code], lines: Array.from(merged) }
}

// Merge synth lines into lineMap. Drop any stops that still aren't in `stations`
// (raw-data gaps) so the final graph stays internally consistent.
for (const [sprLine, stops] of Object.entries(synthLines)) {
  const filtered = stops.filter(s => stations[s])
  if (filtered.length >= 4) lineMap[sprLine] = filtered  // need ≥3 intermediates for any puzzle
}

// Add synth edges to adjacency so the map renderer has the physical links
for (const [sprLine, stops] of Object.entries(synthLines)) {
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i], to = stops[i + 1]
    if (!stations[from] || !stations[to]) continue
    if (!adjacency[from]) adjacency[from] = []
    if (!adjacency[to]) adjacency[to] = []
    if (!adjacency[from].some(e => e.to === to && e.line === sprLine)) {
      adjacency[from].push({ to, line: sprLine, durationMin: 0 })
    }
    if (!adjacency[to].some(e => e.to === from && e.line === sprLine)) {
      adjacency[to].push({ to: from, line: sprLine, durationMin: 0 })
    }
  }
}

const transferList = Array.from(transferStations).filter(s => stations[s])

const graph: NetworkGraph = {
  stations,
  adjacency,
  lines: lineMap,
  transferStations: transferList,
}

writeFileSync(OUT_PATH, JSON.stringify(graph, null, 2))

console.log(`\n📊 Network summary:`)
console.log(`  Stations: ${Object.keys(stations).length}`)
console.log(`  Adjacency entries: ${Object.values(adjacency).flat().length}`)
console.log(`  Route patterns: ${Object.keys(lineMap).length}`)
console.log(`  Transfer stations: ${transferList.length}`)
console.log(`\n💾 Written to src/data/network.json\n`)
