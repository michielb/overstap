/**
 * MB-385: NS API data extraction
 *
 * Fetches stations and IC route data from the NS API and saves raw dumps.
 * Requires NS_PRIMARY_KEY in .env
 *
 * Usage: npm run fetch-data
 * Output: scripts/data/raw/stations.json, scripts/data/raw/trips.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = resolve(__dirname, 'data/raw')

// ── Config ───────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const envPath = resolve(__dirname, '../.env')
  try {
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
    }
  } catch {
    console.error('❌ Could not read .env')
    process.exit(1)
  }
  return env
}

const env = loadEnv()
const API_KEY = env.NS_PRIMARY_KEY

if (!API_KEY || API_KEY.includes('your_')) {
  console.error('❌ NS_PRIMARY_KEY not set in .env')
  process.exit(1)
}

const BASE_V2 = 'https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2'
const BASE_V3 = 'https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3'
const BASE_SPOORKAART = 'https://gateway.apiportal.ns.nl/Spoorkaart-API'
const HEADERS = { 'Ocp-Apim-Subscription-Key': API_KEY }

/** Next weekday at 08:30 — gives us standard daytime IC service patterns */
function nextWeekdayMorning(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(8, 30, 0, 0)
  return d.toISOString().replace(/\.\d{3}Z$/, '+02:00').replace('T', 'T')
}

const DAYTIME = nextWeekdayMorning()

// ── API helpers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(base: string, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(base + path)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: HEADERS })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWithRetry(base: string, path: string, params?: Record<string, string>, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await get(base, path, params)
    } catch (err: unknown) {
      const msg = String(err)
      if (msg.includes('429')) {
        const backoff = attempt * 2000  // 2s, 4s, 6s
        console.log(`  ⚠️  Rate limited (429), waiting ${backoff / 1000}s...`)
        await sleep(backoff)
        continue
      }
      throw err
    }
  }
  throw new Error(`Failed after ${retries} retries`)
}

// ── Station fetch ────────────────────────────────────────────────────────────

async function fetchSpoorkaart() {
  console.log('📡 Fetching spoorkaart (physical track topology)...')
  const data = await getWithRetry(BASE_SPOORKAART, '/api/v1/spoorkaart')
  const features = data.payload?.features ?? data.features ?? []
  console.log(`  ✅ ${features.length} track segments`)
  return features
}

async function fetchStations() {
  console.log('📡 Fetching stations...')
  const data = await getWithRetry(BASE_V2, '/stations')
  const stations = data.payload ?? data
  console.log(`  ✅ ${stations.length} stations`)
  return stations
}

// ── Trip fetch ───────────────────────────────────────────────────────────────

/**
 * These pairs are chosen to cover every major NS IC line:
 * - Each pair traverses at least one IC line end-to-end
 * - Together they cover the entire IC network topology
 */
const ROUTE_PAIRS: [string, string][] = [
  // Amsterdam as hub — outbound spokes
  ['ASD', 'GN'],    // via Flevoland or Hilversum → Zwolle → Groningen
  ['ASD', 'LW'],    // Leeuwarden
  ['ASD', 'ES'],    // Enschede via Amersfoort/Deventer
  ['ASD', 'NM'],    // Nijmegen via Utrecht/Arnhem
  ['ASD', 'VL'],    // Venlo via Utrecht/Den Bosch/Helmond
  ['ASD', 'MT'],    // Maastricht via Utrecht/Eindhoven
  ['ASD', 'VS'],    // Vlissingen via Den Haag/Roosendaal
  ['ASD', 'GVC'],   // Den Haag via Schiphol
  ['ASD', 'AMR'],   // Alkmaar
  ['ASD', 'HN'],    // Hoorn
  // Cross-country routes (not all via ASD)
  ['GVC', 'GN'],    // Den Haag → Groningen (via Utrecht/Amersfoort/Zwolle)
  ['GVC', 'NM'],    // Den Haag → Nijmegen
  ['RTD', 'ES'],    // Rotterdam → Enschede
  ['EHV', 'GN'],    // Eindhoven → Groningen (south-north spine)
  ['BD', 'LW'],     // Breda → Leeuwarden
  ['GVC', 'VL'],    // Den Haag → Venlo
  ['RTD', 'MT'],    // Rotterdam → Maastricht
  ['ASD', 'APD'],   // Amsterdam → Apeldoorn (reveals Veluwe corridor)
  // Fill gaps: connections not covered above
  ['RTD', 'GVC'],   // Rotterdam → Den Haag direct (reveals RTD-DT-GV-GVC corridor)
  ['GN', 'LW'],     // Groningen → Leeuwarden (direct connection)
  ['VL', 'MT'],     // Venlo → Maastricht (Limburg corridor: VL-RM-STD-MT)
  ['ASD', 'BD'],    // Amsterdam → Breda (reveals ASD-GVC-RTD-DDR-BD or ASD-UT-BD)
  ['EHV', 'MT'],    // Eindhoven → Maastricht (direct Limburg IC)
]

async function fetchTrips(pairs: [string, string][]) {
  const allTrips: Record<string, unknown>[] = []
  let i = 0
  for (const [from, to] of pairs) {
    i++
    process.stdout.write(`  [${i}/${pairs.length}] ${from} → ${to} ... `)
    try {
      // Use next weekday 08:30 for consistent daytime IC service
      const data = await getWithRetry(BASE_V3, '/trips', {
        fromStation: from,
        toStation: to,
        dateTime: DAYTIME,
      })
      const trips = data.trips ?? []
      // Keep only the first trip per pair (best route)
      if (trips.length > 0) {
        allTrips.push({ from, to, trip: trips[0] })
        const leg0 = trips[0].legs?.[0]
        const transfers = trips[0].transfers ?? trips[0].legs?.length - 1
        console.log(`${trips[0].legs?.length} leg(s), ${transfers} transfer(s), train ${leg0?.product?.number}`)
      } else {
        console.log('no trips found')
      }
    } catch (err) {
      console.log(`ERROR: ${err}`)
    }
    // Respect rate limits — NS API allows ~10 req/s but we stay conservative
    await sleep(700)
  }
  return allTrips
}

// ── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(RAW_DIR, { recursive: true })

console.log('\n=== NS Data Extraction ===\n')

// 1. Stations
const stations = await fetchStations()
writeFileSync(resolve(RAW_DIR, 'stations.json'), JSON.stringify(stations, null, 2))
console.log(`  💾 Saved to scripts/data/raw/stations.json`)

// 2. Spoorkaart (physical track topology — no rate limit needed, single call)
const tracks = await fetchSpoorkaart()
writeFileSync(resolve(RAW_DIR, 'spoorkaart.json'), JSON.stringify(tracks, null, 2))
console.log(`  💾 Saved to scripts/data/raw/spoorkaart.json`)

// 3. Trips (IC routes with line info, using daytime datetime)
console.log(`\n📡 Fetching trip routes (daytime: ${DAYTIME})...`)
const trips = await fetchTrips(ROUTE_PAIRS)
writeFileSync(resolve(RAW_DIR, 'trips.json'), JSON.stringify(trips, null, 2))
console.log(`\n  💾 Saved ${trips.length} trips to scripts/data/raw/trips.json`)

console.log('\n✅ Done! Run npm run build-network to generate network.json\n')
