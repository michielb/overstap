/**
 * TrainMap — progressive route reveal.
 *
 * Shows origin + destination always. Each correctly-placed stop appears at its
 * true lat/lng as the player guesses it. A polyline is drawn through the
 * origin → revealed stops → destination, growing as more stops are revealed.
 * Stops not yet guessed are invisible. On game end, any remaining stops are
 * revealed for the solution display.
 */

import type { NetworkGraph, Slot } from '../data/types.js'

// ── Projection ───────────────────────────────────────────────────────────────

const MIN_LNG = 3.2
const MAX_LNG = 7.35
const MIN_LAT = 50.65
const MAX_LAT = 53.65

const SVG_W = 380
const SVG_H = 460

function project(lng: number, lat: number): [number, number] {
  const x = ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * SVG_W
  const y = (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * SVG_H
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

// ── Simplified Netherlands outline for geographic context ────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  graph: NetworkGraph
  from: string
  to: string
  stops: string[]               // full route in order (excluding from/to)
  slots: Slot[]                 // player's guesses in input order
  revealAll?: boolean           // on game end, show the whole route
}

export function TrainMap({ graph, from, to, stops, slots, revealAll }: Props) {
  const placed = new Set(
    slots.filter(s => s.status !== 'not-on-route').map(s => s.station),
  )
  const wrongOrder = new Set(
    slots.filter(s => s.status === 'wrong-order').map(s => s.station),
  )

  // Stops to render, in route order: any placed (or all if revealed)
  const visibleStops = stops.filter(c => revealAll || placed.has(c))

  // Polyline path: origin → visible stops (in true route order) → destination
  const pathCodes = [from, ...visibleStops, to]
  const pathPoints = pathCodes
    .map(code => graph.stations[code])
    .filter(Boolean)
    .map(s => project(s.lng, s.lat).join(','))
    .join(' ')

  function dotFill(code: string): string {
    if (code === from) return '#FFC917'
    if (code === to) return '#003082'
    if (revealAll && !placed.has(code)) return '#9CA3AF'  // unguessed on reveal
    if (wrongOrder.has(code)) return '#F59E0B'             // amber
    return '#10B981'                                       // emerald
  }

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        style={{ maxHeight: '320px' }}
        aria-label="Kaart van de route"
      >
        {/* Netherlands outline */}
        <polygon
          points={NL_PATH}
          fill="#F9FAFB"
          stroke="#E5E7EB"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Route polyline (grows as more stops are revealed) */}
        {pathCodes.length >= 2 && (
          <polyline
            points={pathPoints}
            fill="none"
            stroke="#003082"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        )}

        {/* Station dots: origin, destination, and revealed stops */}
        {pathCodes.map(code => {
          const s = graph.stations[code]
          if (!s) return null
          const [x, y] = project(s.lng, s.lat)
          const isEndpoint = code === from || code === to
          const r = isEndpoint ? 7 : 5.5
          const label = s.nameShort

          return (
            <g key={code}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={dotFill(code)}
                stroke="white"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y - r - 3}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill="#1F2937"
                className="select-none"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 flex-wrap text-xs text-gray-500">
        <LegendDot color="#FFC917" label={graph.stations[from]?.nameShort ?? from} />
        <LegendDot color="#003082" label={graph.stations[to]?.nameShort ?? to} />
        {slots.some(s => s.status === 'correct') && <LegendDot color="#10B981" label="Goed" />}
        {slots.some(s => s.status === 'wrong-order') && <LegendDot color="#F59E0B" label="Verkeerde volgorde" />}
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
