/**
 * MB-387: Route solver
 *
 * Finds optimal routes between two NS stations, weighted by number of transfers
 * (line changes), not by number of stops.
 *
 * A "transfer" = boarding a different train line at an intermediate station.
 */

import type { NetworkGraph, Route } from '../data/types.js'

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchState {
  station: string
  line: string | null        // current line being ridden (null = not yet boarded)
  transfers: number          // number of line changes so far
  path: string[]             // stations visited (including current)
  transferStops: string[]    // stations where a transfer happened
}

// ── BFS solver ───────────────────────────────────────────────────────────────

/**
 * Find all optimal routes from `from` to `to`, minimizing transfers.
 * Returns the optimal transfer count and all routes achieving it.
 */
export function findRoutes(
  graph: NetworkGraph,
  from: string,
  to: string,
): Route {
  if (from === to) {
    return { from, to, transfers: [], allRoutes: [[]], transferCount: 0 }
  }
  if (!graph.adjacency[from] || !graph.adjacency[to]) {
    return { from, to, transfers: [], allRoutes: [], transferCount: -1 }
  }

  // BFS states: (station, currentLine, transfersSoFar)
  // State key: station + currentLine (we allow revisiting same station on different lines)
  const initialState: SearchState = {
    station: from,
    line: null,
    transfers: 0,
    path: [from],
    transferStops: [],
  }

  const queue: SearchState[] = [initialState]

  // best[station][line] = minimum transfers to reach (station, line)
  const best = new Map<string, number>()

  let optimalTransfers = Infinity
  const allOptimalRoutes: string[][] = []
  const allOptimalTransferPaths: string[][] = []

  while (queue.length > 0) {
    const state = queue.shift()!
    const { station, line, transfers, path, transferStops } = state

    // Prune: already found a better route to this destination
    if (transfers > optimalTransfers) continue

    if (station === to) {
      if (transfers < optimalTransfers) {
        optimalTransfers = transfers
        allOptimalRoutes.length = 0
        allOptimalTransferPaths.length = 0
      }
      if (transfers === optimalTransfers) {
        allOptimalRoutes.push([...path])
        allOptimalTransferPaths.push([...transferStops])
      }
      continue
    }

    for (const edge of graph.adjacency[station] ?? []) {
      const next = edge.to
      const nextLine = edge.line

      // Count a transfer if we're changing lines (and we're already on a line)
      const isTransfer = line !== null && line !== nextLine
      const nextTransfers = transfers + (isTransfer ? 1 : 0)

      if (nextTransfers > optimalTransfers) continue

      // State key: visiting same station+line with same or more transfers is dominated
      const stateKey = `${next}|${nextLine}`
      const prevBest = best.get(stateKey) ?? Infinity
      if (nextTransfers > prevBest) continue
      best.set(stateKey, nextTransfers)

      // Avoid cycles: don't revisit a station on the same line
      if (path.includes(next)) continue

      const nextTransferStops = isTransfer
        ? [...transferStops, station]
        : [...transferStops]

      queue.push({
        station: next,
        line: nextLine,
        transfers: nextTransfers,
        path: [...path, next],
        transferStops: nextTransferStops,
      })
    }
  }

  if (allOptimalTransferPaths.length === 0) {
    return { from, to, transfers: [], allRoutes: [], transferCount: -1 }
  }

  // De-duplicate transfer paths
  const uniqueTransferPaths = deduplicateArrays(allOptimalTransferPaths)

  return {
    from,
    to,
    transfers: uniqueTransferPaths[0],  // primary solution
    allRoutes: uniqueTransferPaths,      // all equivalent solutions
    transferCount: optimalTransfers,
  }
}

function deduplicateArrays(arrays: string[][]): string[][] {
  const seen = new Set<string>()
  return arrays.filter(arr => {
    const key = arr.join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Check if a player's guess is a valid route for the given puzzle.
 * A guess is valid if it matches one of the optimal transfer paths.
 *
 * Returns per-station correctness (for Wordle-style feedback).
 */
export function validateGuess(
  route: Route,
  guess: string[],
): { correct: boolean[]; isWin: boolean } {
  const correct = guess.map(() => false)
  let isWin = false

  for (const solution of route.allRoutes) {
    if (solution.length !== guess.length) continue
    const match = solution.every((s, i) => s === guess[i])
    if (match) {
      isWin = true
      correct.fill(true)
      return { correct, isWin }
    }
  }

  // Partial credit: mark stations that appear in any solution at the right position
  if (route.allRoutes.length > 0) {
    const maxLen = Math.max(...route.allRoutes.map(r => r.length))
    if (guess.length === maxLen) {
      for (let i = 0; i < guess.length; i++) {
        if (route.allRoutes.some(sol => sol[i] === guess[i])) {
          correct[i] = true
        }
      }
    }
  }

  return { correct, isWin }
}
