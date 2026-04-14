/**
 * Quick smoke test for the route solver.
 * Loads network.json and tests a few known routes.
 *
 * Usage: tsx scripts/test-solver.ts
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NetworkGraph } from '../src/data/types.js'
import { findRoutes } from '../src/game/solver.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const graph: NetworkGraph = JSON.parse(
  readFileSync(resolve(__dirname, '../src/data/network.json'), 'utf8'),
)

console.log('\n=== Route Solver Smoke Test ===\n')
console.log(`Network: ${Object.keys(graph.stations).length} stations, ${graph.transferStations.length} transfer stations`)

const tests: [string, string, string][] = [
  ['ASD', 'GN',  'Amsterdam → Groningen'],
  ['ASD', 'LW',  'Amsterdam → Leeuwarden'],
  ['ASD', 'MT',  'Amsterdam → Maastricht'],
  ['ASD', 'VS',  'Amsterdam → Vlissingen'],
  ['GVC', 'GN',  'Den Haag → Groningen'],
  ['ASD', 'ES',  'Amsterdam → Enschede'],
  ['RTD', 'MT',  'Rotterdam → Maastricht'],
  ['BD',  'GN',  'Breda → Groningen'],
  ['ASD', 'ASD', 'Same station (0 transfers)'],
]

let pass = 0
let fail = 0

for (const [from, to, label] of tests) {
  const route = findRoutes(graph, from, to)
  const transfers = route.transferCount
  const path = route.transfers.map(c => graph.stations[c]?.name ?? c).join(' → ')
  const status = transfers === -1 ? '❌ UNREACHABLE' : `✅ ${transfers} transfer(s)`
  const pathStr = transfers === 0 ? '(direct)' : path || '(empty)'
  console.log(`${status}  ${label}: ${pathStr}`)
  if (transfers === -1) fail++
  else pass++
}

console.log(`\n${pass} reachable, ${fail} unreachable`)
if (fail > 0) {
  console.log('⚠️  Some routes unreachable — may need more route pairs in fetch script')
}
