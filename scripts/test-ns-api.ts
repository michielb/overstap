/**
 * Quick NS API test script.
 * Tries the stations endpoint and prints the first few results.
 *
 * Usage: npm run test-api
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dependency)
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
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      env[key] = value
    }
  } catch {
    console.error('⚠️  Could not read .env file — make sure it exists at project root')
    process.exit(1)
  }
  return env
}

const env = loadEnv()
const API_KEY = env.NS_PRIMARY_KEY

if (!API_KEY || API_KEY === 'your_primary_key_here') {
  console.error('❌ NS_PRIMARY_KEY not set in .env')
  process.exit(1)
}

const BASE_URL = 'https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nsGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(BASE_URL + path)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`)
  }
  return res.json()
}

async function testStations() {
  console.log('📡 Testing GET /stations ...')
  const data = await nsGet('/stations')
  const stations = data.payload ?? data
  const sample = Array.isArray(stations) ? stations.slice(0, 3) : stations

  console.log(`\n✅ Got ${Array.isArray(stations) ? stations.length : '?'} stations`)
  console.log('\nFirst 3 stations:')
  console.log(JSON.stringify(sample, null, 2))

  return stations
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nsGetV3(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL('https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3' + path)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`)
  }
  return res.json()
}

async function testTrips(from = 'ASD', to = 'GN') {
  console.log(`\n📡 Testing GET /v3/trips?fromStation=${from}&toStation=${to} ...`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await nsGetV3('/trips', { fromStation: from, toStation: to })
  const trips: any[] = data.trips ?? []

  console.log(`✅ Got ${trips.length} trip options`)
  if (trips.length > 0) {
    const trip = trips[0]
    console.log(`\nBest trip (${trip.legs?.length} legs, ${trip.transfers} transfers):`)
    for (const leg of trip.legs ?? []) {
      const stops = leg.stops ?? []
      const stopNames = stops.map((s: { stop?: { name?: string } }) => s.stop?.name ?? '?')
      console.log(`  [${leg.product?.displayName ?? leg.product?.number ?? '?'}] ${leg.origin?.name} → ${leg.destination?.name}`)
      if (stopNames.length > 0) {
        console.log(`    Stops: ${stopNames.join(' → ')}`)
      }
    }

    // Print raw first leg structure for schema discovery
    console.log('\nFirst leg raw (abbreviated):')
    const leg0 = trip.legs[0]
    console.log(JSON.stringify({
      origin: leg0.origin,
      destination: leg0.destination,
      product: leg0.product,
      stops: leg0.stops?.slice(0, 3),
    }, null, 2))
  }
}

// Main
try {
  const stations = await testStations()

  // Find Amsterdam Centraal
  const asd = Array.isArray(stations)
    ? stations.find((s: { code: string }) => s.code === 'ASD')
    : null
  if (asd) {
    console.log('\nAmsterdam Centraal details:')
    console.log(JSON.stringify({
      code: asd.code,
      name: asd.namen?.lang,
      stationType: asd.stationType,
      land: asd.land,
    }, null, 2))
  }

  // Test trips (Amsterdam → Groningen — a long trip that should show multiple transfers)
  await testTrips('ASD', 'GN')
  await testTrips('ASD', 'MT')  // Amsterdam → Maastricht

  console.log('\n🎉 NS API is working!')
} catch (err) {
  console.error('\n❌ API error:', err)
  process.exit(1)
}
