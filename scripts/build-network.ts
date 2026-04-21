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
/** Per physical edge: key `${min}|${max}` → coords in min→max direction. */
const physEdgeCoords = new Map<string, [number, number][]>()

for (const f of spoorkaart) {
  const a = String(f.properties?.from ?? '').toUpperCase()
  const b = String(f.properties?.to ?? '').toUpperCase()
  if (!a || !b) continue
  if (!physAdj.has(a)) physAdj.set(a, new Set())
  if (!physAdj.has(b)) physAdj.set(b, new Set())
  physAdj.get(a)!.add(b)
  physAdj.get(b)!.add(a)

  const rawCoords: unknown = f.geometry?.coordinates
  if (!Array.isArray(rawCoords)) continue
  // 4-decimal precision = ~10 m at Dutch latitudes. Plenty for a country-scale
  // map and roughly halves the serialized size vs 5 decimals.
  const coords = (rawCoords as unknown[]).filter(
    (c): c is [number, number] => Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number',
  ).map(c => [Number((c[0] as number).toFixed(4)), Number((c[1] as number).toFixed(4))] as [number, number])
  if (coords.length < 2) continue

  const [lo, hi] = a < b ? [a, b] : [b, a]
  const key = `${lo}|${hi}`
  if (physEdgeCoords.has(key)) continue  // dedupe if spoorkaart has parallel features
  // Normalise to lo→hi direction: if the raw feature went hi→lo, reverse.
  physEdgeCoords.set(key, a === lo ? coords : [...coords].reverse())
}

/**
 * BFS physical path between two stations. Returns both the node chain and the
 * concatenated coord polyline, or null if no path exists.
 */
function physPathWithCoords(
  start: string,
  goal: string,
): { nodes: string[]; coords: [number, number][] } | null {
  if (start === goal) return { nodes: [start], coords: [] }
  const q: string[][] = [[start]]
  const seen = new Set([start])
  while (q.length) {
    const path = q.shift()!
    const head = path[path.length - 1]
    for (const next of physAdj.get(head) ?? []) {
      if (seen.has(next)) continue
      if (next === goal) {
        const nodes = [...path, next]
        return { nodes, coords: nodesToCoords(nodes) }
      }
      seen.add(next)
      q.push([...path, next])
    }
  }
  return null
}

function physPath(start: string, goal: string): string[] | null {
  const out = physPathWithCoords(start, goal)
  return out ? out.nodes : null
}

/**
 * Given a sequence of station codes, concat the physEdgeCoords for each
 * consecutive pair, reversing per-edge as needed. Returns an empty array if
 * any edge is missing.
 */
function nodesToCoords(nodes: string[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1]
    const [lo, hi] = a < b ? [a, b] : [b, a]
    const segment = physEdgeCoords.get(`${lo}|${hi}`)
    if (!segment) return []
    const oriented = a === lo ? segment : [...segment].reverse()
    // Skip the first point of every segment after the first to avoid dupes.
    const start = out.length === 0 ? 0 : 1
    for (let k = start; k < oriented.length; k++) out.push(oriented[k])
  }
  return out
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

// ── Per-line consecutive-pair polylines (MB-482) ─────────────────────────────
// For every consecutive station pair used by any line, store the physical-
// track polyline tracing them through the spoorkaart. The renderer looks these
// up at render time to draw curvy routes instead of straight station-to-
// station lines.

const trackGeometry: Record<string, [number, number][]> = {}
let pairsMissing = 0
for (const stops of Object.values(lineMap)) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    if (!stations[a] || !stations[b]) continue
    const [lo, hi] = a < b ? [a, b] : [b, a]
    const key = `${lo}|${hi}`
    if (trackGeometry[key]) continue
    const walk = physPathWithCoords(lo, hi)
    if (walk && walk.coords.length >= 2) {
      trackGeometry[key] = walk.coords
    } else {
      // Fallback: straight line between the two station coords, so the route
      // never breaks visually. Shouldn't trigger for NL stations on lines we
      // know about, but is cheap insurance.
      trackGeometry[key] = [
        [stations[lo].lng, stations[lo].lat],
        [stations[hi].lng, stations[hi].lat],
      ]
      pairsMissing++
    }
  }
}
console.log(`  📐 trackGeometry: ${Object.keys(trackGeometry).length} pairs (${pairsMissing} missing, falling back to straight lines)`)

// ── Background track layer (MB-482) ──────────────────────────────────────────
// Every physical edge whose geometry lies (at least partially) inside NL, so
// the player gets the full mainline + branch-line network as visual context.
// We don't key on station-endpoint membership: the spoorkaart has plenty of
// station→junction→station chains where the junction isn't a station we
// know, and filtering by endpoint throws those out. Coord-bbox filtering
// keeps them.
//
// Points are decimated to roughly every-4th (plus endpoints preserved) so
// the background JSON stays small without visual loss at the zoom levels the
// game uses. The coastline silhouette survives this cleanly.

const NL_BOUNDS = { minLng: 3.0, maxLng: 7.5, minLat: 50.5, maxLat: 53.8 }
const isInNL = ([lng, lat]: [number, number]): boolean =>
  lng >= NL_BOUNDS.minLng && lng <= NL_BOUNDS.maxLng &&
  lat >= NL_BOUNDS.minLat && lat <= NL_BOUNDS.maxLat

function decimate(coords: [number, number][], stride: number): [number, number][] {
  if (coords.length <= 3 || stride <= 1) return coords
  const out: [number, number][] = [coords[0]]
  for (let i = stride; i < coords.length - 1; i += stride) out.push(coords[i])
  out.push(coords[coords.length - 1])
  return out
}

const backgroundTracks: [number, number][][] = []
for (const coords of physEdgeCoords.values()) {
  if (!coords.some(isInNL)) continue
  backgroundTracks.push(decimate(coords, 8))
}
const bgPointCount = backgroundTracks.reduce((n, arr) => n + arr.length, 0)
console.log(`  🗺️  backgroundTracks: ${backgroundTracks.length} segments, ${bgPointCount} points`)

const graph: NetworkGraph = {
  stations,
  adjacency,
  lines: lineMap,
  transferStations: transferList,
  trackGeometry,
  backgroundTracks,
}

writeFileSync(OUT_PATH, JSON.stringify(graph, null, 2))

console.log(`\n📊 Network summary:`)
console.log(`  Stations: ${Object.keys(stations).length}`)
console.log(`  Adjacency entries: ${Object.values(adjacency).flat().length}`)
console.log(`  Route patterns: ${Object.keys(lineMap).length}`)
console.log(`  Transfer stations: ${transferList.length}`)
console.log(`\n💾 Written to src/data/network.json\n`)
