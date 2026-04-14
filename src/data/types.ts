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
  from: string         // Station code
  to: string           // Station code
  line: string         // Line code, e.g. "IC-direct"
  durationMin: number  // Travel time in minutes
}

export interface NetworkGraph {
  stations: Record<string, Station>
  adjacency: Record<string, AdjacencyEntry[]>
  lines: Record<string, string[]>  // line code -> ordered list of station codes
  transferStations: string[]       // station codes that are transfer points
}

export interface AdjacencyEntry {
  to: string
  line: string
  durationMin: number
}

// Game models

export interface Route {
  from: string          // Station code
  to: string            // Station code
  transfers: string[]   // Ordered list of transfer station codes (the answer)
  allRoutes: string[][] // All valid routes (for validating guesses)
  transferCount: number
}

export interface Puzzle {
  date: string          // YYYY-MM-DD
  from: string          // Station code
  to: string            // Station code
  solution: string[]    // Transfer stations in order
}

export interface GuessResult {
  stations: string[]
  correct: boolean[]    // Per-station correctness
  isWin: boolean
}
