/**
 * MB-389 + MB-390: Schematic train map
 *
 * Renders Netherlands outline, all network tracks (from spoorkaart geometry),
 * and station dots. Highlights origin, destination, and guessed transfers.
 */

import type { NetworkGraph } from '../data/types.js'
import tracksData from '../data/tracks.json'

interface TrackSegment {
  from: string
  to: string
  coords: [number, number][]
}

const tracks = tracksData as TrackSegment[]

// ── Map bounds (WGS84) ────────────────────────────────────────────────────────

const MIN_LNG = 3.2
const MAX_LNG = 7.35
const MIN_LAT = 50.65
const MAX_LAT = 53.65

const SVG_W = 380
const SVG_H = 460

// ── Projection ────────────────────────────────────────────────────────────────

function project(lng: number, lat: number): [number, number] {
  const x = ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * SVG_W
  const y = (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * SVG_H
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

function coordsToPolyline(coords: [number, number][]): string {
  return coords.map(([lng, lat]) => project(lng, lat).join(',')).join(' ')
}

// ── Simplified Netherlands outline (clockwise from NW coast) ─────────────────
// Approximate border polygon for context; not exact

const NL_OUTLINE: [number, number][] = [
  [4.62, 52.83], [4.67, 52.96], [4.73, 53.07], [4.78, 53.17],
  [5.0, 53.25],  [5.5, 53.33],  [6.05, 53.38], [6.8, 53.32],
  [7.05, 53.28], [7.05, 52.65], [7.0, 52.38],  [6.85, 51.97],
  [6.7, 51.77],  [6.5, 51.45],  [6.15, 51.15], [5.9, 51.07],
  [5.65, 50.82], [5.55, 50.75], [5.1, 50.78],  [4.55, 50.82],
  [4.3, 51.3],   [3.7, 51.1],   [3.52, 51.35], [3.75, 51.5],
  [4.05, 51.5],  [4.25, 51.62], [3.95, 51.73], [3.78, 51.87],
  [3.87, 52.07], [4.08, 52.28], [4.38, 52.38], [4.5, 52.92],
  [4.62, 52.83],
]

const NL_PATH = NL_OUTLINE.map(([lng, lat]) => project(lng, lat).join(',')).join(' ')

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  graph: NetworkGraph
  from: string           // origin station code
  to: string             // destination station code
  guesses: string[]      // transfer codes guessed so far (correct + incorrect)
  correctGuesses: string[] // codes confirmed correct
  revealSolution?: boolean
  solution?: string[]
}

export function TrainMap({
  graph,
  from,
  to,
  guesses,
  correctGuesses,
  revealSolution,
  solution = [],
}: Props) {
  const stationList = Object.values(graph.stations)

  function stationColor(code: string): string {
    if (code === from) return '#FFC917'        // NS yellow — origin
    if (code === to) return '#003082'           // NS blue — destination
    if (revealSolution && solution.includes(code)) return '#00A04A'  // green — solution reveal
    if (correctGuesses.includes(code)) return '#00A04A'  // green — correct guess
    if (guesses.includes(code)) return '#e53e3e'          // red — wrong guess
    if (graph.stations[code]?.isTransfer) return '#6B7280' // gray — transfer station
    return '#D1D5DB'                            // light gray — regular station
  }

  function stationRadius(code: string): number {
    if (code === from || code === to) return 7
    if (correctGuesses.includes(code) || (revealSolution && solution.includes(code))) return 6
    if (guesses.includes(code)) return 5
    if (graph.stations[code]?.isTransfer) return 4
    return 2.5
  }

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        style={{ maxHeight: '320px' }}
        aria-label="Kaart van het Nederlandse treinnetwerk"
      >
        {/* Netherlands outline */}
        <polygon
          points={NL_PATH}
          fill="#F3F4F6"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Track lines */}
        {tracks.map((track, i) => {
          const fromS = graph.stations[track.from]
          const toS = graph.stations[track.to]
          if (!fromS || !toS) return null

          // Highlight tracks that connect guessed/solution stations
          const isHighlighted = correctGuesses.includes(track.from) || correctGuesses.includes(track.to)
            || (revealSolution && (solution.includes(track.from) || solution.includes(track.to)))
            || track.from === from || track.from === to
            || track.to === from || track.to === to

          return (
            <polyline
              key={i}
              points={coordsToPolyline(track.coords)}
              fill="none"
              stroke={isHighlighted ? '#003082' : '#9CA3AF'}
              strokeWidth={isHighlighted ? 2 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isHighlighted ? 0.85 : 0.5}
            />
          )
        })}

        {/* Station dots */}
        {stationList.map(station => {
          const [x, y] = project(station.lng, station.lat)
          const r = stationRadius(station.code)
          const color = stationColor(station.code)
          const isSpecial = station.code === from || station.code === to
            || correctGuesses.includes(station.code)
            || guesses.includes(station.code)
            || (revealSolution && solution.includes(station.code))

          return (
            <g key={station.code}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                stroke={isSpecial ? 'white' : 'none'}
                strokeWidth={isSpecial ? 1.5 : 0}
              />
              {/* Label for highlighted stations */}
              {isSpecial && (
                <text
                  x={x}
                  y={y - r - 3}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="600"
                  fill="#1F2937"
                  className="select-none"
                >
                  {station.nameShort}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 flex-wrap text-xs text-gray-500">
        <LegendDot color="#FFC917" label={graph.stations[from]?.nameShort ?? from} />
        <LegendDot color="#003082" label={graph.stations[to]?.nameShort ?? to} />
        {correctGuesses.length > 0 && <LegendDot color="#00A04A" label="Juist geraden" />}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
