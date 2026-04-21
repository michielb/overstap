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
}

export interface AdjacencyEntry {
  to: string
  line: string
  durationMin: number
}

// ── Game models (v2: guess-all-stops-on-route) ────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface LinePuzzle {
  date: string              // YYYY-MM-DD
  from: string              // origin station code
  to: string                // destination station code
  stops: string[]           // ordered intermediate station codes (excluding from/to)
  line: string              // line identifier (for debugging / display)
  difficulty: Difficulty
}

export type Mode = 'easy' | 'hard'

export type SlotStatus = 'correct' | 'wrong-order' | 'not-on-route'

export interface Slot {
  station: string           // station code guessed
  status: SlotStatus
}
