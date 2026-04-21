/**
 * TrainMap — progressive route reveal on the real Dutch rail network.
 *
 * Renders three layers stacked in SVG space:
 *   1. Background tracks   — every NL rail segment from the spoorkaart, thin gray
 *   2. Active route        — the puzzle's route, traced through real track
 *                            geometry in NS blue. Grows as the player reveals stops.
 *   3. Station dots + labels for endpoints and revealed stops.
 *
 * The viewport is fitted to the active route's bbox (with padding + minimum
 * span) so a short Sprinter puzzle fills the frame instead of floating in one
 * corner of NL.
 */

import { useMemo } from 'react'
import type { NetworkGraph, Slot } from '../data/types.js'

// ── Geometry helpers ─────────────────────────────────────────────────────────

const SVG_W = 380
const SVG_H = 460
const BBOX_PAD = 0.2                // fractional padding on each side
const MIN_SPAN_DEG = 0.15            // ~15 km minimum — clamp for tiny routes

// At 52°N (middle of NL), one degree of longitude covers ~0.615× the distance
// of one degree of latitude. To keep the map isotropic (round stations look
// round, tracks don't squash), the displayed lng:lat ratio must equal
// (SVG_W / SVG_H) / 0.615 ≈ 1.343.
const LNG_PER_LAT_KM = 0.615
const DESIRED_LNG_OVER_LAT = (SVG_W / SVG_H) / LNG_PER_LAT_KM

interface Bbox {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

function makeProjector(bbox: Bbox) {
  const spanLng = bbox.maxLng - bbox.minLng
  const spanLat = bbox.maxLat - bbox.minLat
  return (lng: number, lat: number): [number, number] => {
    const x = ((lng - bbox.minLng) / spanLng) * SVG_W
    const y = (1 - (lat - bbox.minLat) / spanLat) * SVG_H
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  }
}

function routeBbox(
  graph: NetworkGraph,
  codes: string[],
): Bbox {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const code of codes) {
    const s = graph.stations[code]
    if (!s) continue
    if (s.lng < minLng) minLng = s.lng
    if (s.lng > maxLng) maxLng = s.lng
    if (s.lat < minLat) minLat = s.lat
    if (s.lat > maxLat) maxLat = s.lat
  }
  // Clamp to a minimum span so two nearby stations don't render on top of
  // each other on very short puzzles.
  let lngSpan = Math.max(maxLng - minLng, MIN_SPAN_DEG)
  let latSpan = Math.max(maxLat - minLat, MIN_SPAN_DEG / DESIRED_LNG_OVER_LAT)

  // Equalise aspect to the SVG canvas so circles render round, not squashed.
  // Expand whichever dimension is relatively too small.
  if (lngSpan / latSpan > DESIRED_LNG_OVER_LAT) {
    latSpan = lngSpan / DESIRED_LNG_OVER_LAT    // route is too wide → grow lat
  } else {
    lngSpan = latSpan * DESIRED_LNG_OVER_LAT    // route is too tall → grow lng
  }

  // Centre on the original route centre and pad.
  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  const halfLng = (lngSpan / 2) * (1 + BBOX_PAD)
  const halfLat = (latSpan / 2) * (1 + BBOX_PAD)
  return {
    minLng: centerLng - halfLng,
    maxLng: centerLng + halfLng,
    minLat: centerLat - halfLat,
    maxLat: centerLat + halfLat,
  }
}

/**
 * Concat the per-pair polylines for a chain of consecutive stations into one
 * continuous polyline. Reverses each segment as needed so the polyline flows
 * from chain[0] to chain[N].
 */
function chainPolyline(
  graph: NetworkGraph,
  chain: string[],
): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1]
    const [lo, hi] = a < b ? [a, b] : [b, a]
    const segment = graph.trackGeometry[`${lo}|${hi}`]
    if (!segment || segment.length < 2) continue
    const oriented = a === lo ? segment : [...segment].reverse()
    const start = out.length === 0 ? 0 : 1
    for (let k = start; k < oriented.length; k++) out.push(oriented[k])
  }
  return out
}

function polylinePoints(
  coords: [number, number][],
  project: (lng: number, lat: number) => [number, number],
): string {
  return coords.map(([lng, lat]) => project(lng, lat).join(',')).join(' ')
}

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

  // bbox is stable for the whole puzzle — it covers the full route, not just
  // the revealed portion, so the camera doesn't zoom as the player guesses.
  const fullChain = useMemo(() => [from, ...stops, to], [from, stops, to])
  const bbox = useMemo(() => routeBbox(graph, fullChain), [graph, fullChain])
  const project = useMemo(() => makeProjector(bbox), [bbox])

  // Pre-compute background polylines in SVG space once per bbox.
  const backgroundPoints = useMemo(
    () => graph.backgroundTracks.map(coords => polylinePoints(coords, project)),
    [graph.backgroundTracks, project],
  )

  // Active-route polyline: only include stops up to the currently-revealed
  // prefix (contiguous from the start). A stop is "revealed" when it's been
  // placed correctly or when the game has ended. Non-contiguous placements
  // don't extend the line — otherwise we'd draw impossible shortcuts.
  const revealedChain = useMemo(() => {
    if (revealAll) return fullChain
    const chain: string[] = [from]
    for (const stop of stops) {
      if (!placed.has(stop)) break
      chain.push(stop)
    }
    // Include 'to' only if the whole route is placed (otherwise the line
    // would teleport over unguessed stops).
    if (chain.length === stops.length + 1) chain.push(to)
    return chain
  }, [from, to, stops, placed, revealAll, fullChain])

  const routePoints = useMemo(() => {
    if (revealedChain.length < 2) return ''
    return polylinePoints(chainPolyline(graph, revealedChain), project)
  }, [graph, revealedChain, project])

  function dotFill(code: string): string {
    if (code === from) return '#FFC917'
    if (code === to) return '#003082'
    if (revealAll && !placed.has(code)) return '#9CA3AF'  // unguessed on reveal
    if (wrongOrder.has(code)) return '#F59E0B'             // amber
    return '#10B981'                                       // emerald
  }

  const visibleStops = revealAll ? stops : stops.filter(c => placed.has(c))
  const dotCodes = [from, ...visibleStops, to]

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        style={{ maxHeight: '320px' }}
        aria-label="Kaart van de route"
      >
        {/* Background: all NL rail segments as thin gray lines */}
        <g fill="none" stroke="#E5E7EB" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          {backgroundPoints.map((pts, i) => (
            <polyline key={`bg-${i}`} points={pts} />
          ))}
        </g>

        {/* Active route polyline, tracing real track geometry */}
        {routePoints && (
          <polyline
            points={routePoints}
            fill="none"
            stroke="#003082"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Station dots: origin, destination, revealed stops */}
        {dotCodes.map(code => {
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
                y={y - r - 6}
                textAnchor="middle"
                fontSize="20"
                fontWeight="700"
                fill="#1F2937"
                className="select-none"
                style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 5, strokeLinejoin: 'round' } as React.CSSProperties}
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
