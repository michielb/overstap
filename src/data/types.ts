// Station and network data models

export interface Station {
  code: string         // NS station code, e.g. "ASD"
  name: string         // Display name, e.g. "Amsterdam Centraal"
  nameShort: string    // Short name for UI
  lat: number
  lng: number
  isTransfer: boolean  // Serves multiple lines
  lines: string[]      // Line codes that stop here
}

export interface Connection {
  from: string
  to: string
  line: string
  durationMin: number
}

export interface NetworkGraph {
  stations: Record<string, Station>
  adjacency: Record<string, AdjacencyEntry[]>
  lines: Record<string, string[]>  // line code -> ordered list of station codes
  transferStations: string[]
  /**
   * For each directly-adjacent station pair on any line, the polyline of
   * [lng, lat] coords traced through the physical spoorkaart between them.
   * Keys are canonical `${min(codeA, codeB)}|${max(codeA, codeB)}`. Value is
   * the geometry in A→B order (sorted by key, not by any route direction);
   * callers reverse as needed.
   */
  trackGeometry: Record<string, [number, number][]>
  /**
   * All NL rail segments from the spoorkaart, each as an independent LineString
   * of [lng, lat] coords. Used as a thin gray background layer under the route.
   */
  backgroundTracks: [number, number][][]
}

export interface AdjacencyEntry {
  to: string
  line: string
  durationMin: number
}

// ── Game models (v2: guess-all-stops-on-route) ────────────────────────────────

/** IC = Intercity / Intercity Direct / international; Sprinter = SPR / stoptrein */
export type Category = 'ic' | 'sprinter'

/** Bucket by intermediate-stop count. Targets ~4, ~7, ~12 stops respectively. */
export type Size = 'short' | 'medium' | 'long'

export interface LinePuzzle {
  date: string              // YYYY-MM-DD
  from: string              // origin station code
  to: string                // destination station code
  stops: string[]           // ordered intermediate station codes (excluding from/to)
  line: string              // line identifier (for debugging / display)
  category: Category
  size: Size
}

export type Mode = 'easy' | 'hard'

export type SlotStatus = 'correct' | 'wrong-order' | 'not-on-route'

export interface Slot {
  station: string           // station code guessed
  status: SlotStatus
}
