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
