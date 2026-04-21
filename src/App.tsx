import { useState, useEffect } from 'react'
import './index.css'
import networkData from './data/network.json'
import type { Mode, NetworkGraph, Slot, Station } from './data/types.js'
import { getDailyPuzzle } from './game/puzzle.js'
import { useGameState } from './game/useGameState.js'
import { TrainMap } from './components/TrainMap.js'
import { SlotList } from './components/SlotList.js'
import { EasySlotList } from './components/EasySlotList.js'
import { StationPool } from './components/StationPool.js'
import { ScoreScreen } from './components/ScoreScreen.js'
import { StationInput } from './components/StationInput.js'

const graph = networkData as unknown as NetworkGraph
const puzzle = getDailyPuzzle(graph)

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Makkelijk',
  medium: 'Gemiddeld',
  hard: 'Moeilijk',
}

function initialModeFromUrl(): Mode {
  if (typeof window === 'undefined') return 'hard'
  const param = new URLSearchParams(window.location.search).get('mode')
  return param === 'easy' ? 'easy' : 'hard'
}

function App() {
  const [mode, setMode] = useState<Mode>(initialModeFromUrl)
  const [selectedPoolCode, setSelectedPoolCode] = useState<string | null>(null)
  const { state, placedCodes, correctCount, orderBroken, score, slotsForScore,
          guess, place, returnToPool, check, reset } = useGameState(puzzle, mode)

  // Keep the URL in sync with the current mode so reload preserves it. Uses
  // replaceState to avoid polluting history on every toggle.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const current = new URLSearchParams(window.location.search).get('mode')
    const desired = mode === 'easy' ? 'easy' : null
    if (current === desired) return
    const url = new URL(window.location.href)
    if (desired) url.searchParams.set('mode', desired)
    else url.searchParams.delete('mode')
    window.history.replaceState(null, '', url.toString())
  }, [mode])

  function handleModeToggle(next: Mode) {
    if (next === mode) return
    setMode(next)
    setSelectedPoolCode(null)
    reset(puzzle, next)
  }

  const fromStation = graph.stations[state.puzzle.from]
  const toStation = graph.stations[state.puzzle.to]
  const isPlaying = state.status === 'playing'
  const stopsTotal = state.puzzle.stops.length
  const excludeCodes = [state.puzzle.from, state.puzzle.to, ...placedCodes]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Overstap</h1>
          <ModeToggle mode={mode} onChange={handleModeToggle} />
          <span className="text-sm text-gray-400 tabular-nums">
            {new Date(puzzle.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full gap-4">
        {/* Route header */}
        <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-center flex-1 min-w-0">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Van</p>
              <p className="text-base font-semibold text-gray-900 truncate">{fromStation?.name ?? state.puzzle.from}</p>
            </div>
            <div className="text-gray-300 text-xl shrink-0">→</div>
            <div className="text-center flex-1 min-w-0">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Naar</p>
              <p className="text-base font-semibold text-gray-900 truncate">{toStation?.name ?? state.puzzle.to}</p>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">
            {DIFFICULTY_LABEL[state.puzzle.difficulty]} — {stopsTotal} tussenstation{stopsTotal === 1 ? '' : 's'}
          </p>
        </div>

        {state.mode === 'hard' ? (
          <HardModeBody
            state={state}
            fromStation={fromStation}
            toStation={toStation}
            isPlaying={isPlaying}
            correctCount={correctCount}
            stopsTotal={stopsTotal}
            excludeCodes={excludeCodes}
            orderBroken={orderBroken}
            score={score}
            slotsForScore={slotsForScore}
            onGuess={guess}
          />
        ) : (
          <EasyModeBody
            state={state}
            fromStation={fromStation}
            toStation={toStation}
            selectedPoolCode={selectedPoolCode}
            setSelectedPoolCode={setSelectedPoolCode}
            orderBroken={orderBroken}
            score={score}
            slotsForScore={slotsForScore}
            onPlace={place}
            onReturnToPool={returnToPool}
            onCheck={check}
          />
        )}
      </main>
    </div>
  )
}

// ── Mode toggle (temporary pre-MB-463) ─────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-full bg-gray-100 p-0.5 text-xs font-medium">
      <button
        type="button"
        onClick={() => onChange('easy')}
        className={`px-3 py-1 rounded-full transition-colors ${
          mode === 'easy' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
        }`}
      >
        Makkelijk
      </button>
      <button
        type="button"
        onClick={() => onChange('hard')}
        className={`px-3 py-1 rounded-full transition-colors ${
          mode === 'hard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
        }`}
      >
        Moeilijk
      </button>
    </div>
  )
}

// ── Hard mode ──────────────────────────────────────────────────────────────

interface HardBodyProps {
  state: Extract<ReturnType<typeof useGameState>['state'], { mode: 'hard' }>
  fromStation: Station
  toStation: Station
  isPlaying: boolean
  correctCount: number
  stopsTotal: number
  excludeCodes: string[]
  orderBroken: boolean
  score: number
  slotsForScore: Slot[]
  onGuess: (code: string) => void
}

function HardModeBody({
  state, fromStation, toStation, isPlaying, correctCount, stopsTotal,
  excludeCodes, orderBroken, score, slotsForScore, onGuess,
}: HardBodyProps) {
  const slotsUsed = state.slots.length

  return (
    <>
      <TrainMap
        graph={graph}
        from={state.puzzle.from}
        to={state.puzzle.to}
        stops={state.puzzle.stops}
        slots={state.slots}
        revealAll={!isPlaying}
      />

      {/* Input above slots — closer to thumb on mobile */}
      {isPlaying && (
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-gray-500">
            <span>Slot {slotsUsed + 1} / {state.maxSlots}</span>
            <span>{correctCount} van {stopsTotal} geraden</span>
          </div>
          <StationInput
            stations={graph.stations}
            excludeCodes={excludeCodes}
            onSelect={onGuess}
            placeholder="Welk station komt tussen A en B?"
          />
        </div>
      )}

      <SlotList
        fromStation={fromStation}
        toStation={toStation}
        slots={state.slots}
        maxSlots={state.maxSlots}
        stations={graph.stations}
      />

      {!isPlaying && (
        <ScoreScreen
          won={state.status === 'won'}
          puzzle={state.puzzle}
          slots={slotsForScore}
          stations={graph.stations}
          score={score}
          orderBroken={orderBroken}
        />
      )}
    </>
  )
}

// ── Easy mode ──────────────────────────────────────────────────────────────

interface EasyBodyProps {
  state: Extract<ReturnType<typeof useGameState>['state'], { mode: 'easy' }>
  fromStation: Station
  toStation: Station
  selectedPoolCode: string | null
  setSelectedPoolCode: (c: string | null) => void
  orderBroken: boolean
  score: number
  slotsForScore: Slot[]
  onPlace: (code: string, slot: number, fromSlot?: number) => void
  onReturnToPool: (slot: number) => void
  onCheck: () => void
}

function EasyModeBody({
  state, fromStation, toStation, selectedPoolCode, setSelectedPoolCode,
  orderBroken, score, slotsForScore, onPlace, onReturnToPool, onCheck,
}: EasyBodyProps) {
  const poolCodes = state.shuffledStops.filter(c => !state.placements.includes(c))
  const allFilled = state.placements.every(p => p !== null)
  const revealAll = state.checked

  // Synthesize map slots: before check, nothing revealed; after check, all
  // correctly-placed stops show as 'correct' on the map (misplaced stops are
  // shown via the solution reveal in revealAll).
  const mapSlots: Slot[] = revealAll
    ? state.placements
        .map((code, i) => ({ code, correct: code === state.puzzle.stops[i] }))
        .filter((x): x is { code: string; correct: boolean } => x.code !== null && x.correct)
        .map(x => ({ station: x.code, status: 'correct' as const }))
    : []

  function handlePoolSelect(code: string) {
    setSelectedPoolCode(selectedPoolCode === code ? null : code)
  }

  function handleSlotTap(slot: number) {
    if (selectedPoolCode === null) return
    onPlace(selectedPoolCode, slot)
    setSelectedPoolCode(null)
  }

  function handlePlace(code: string, slot: number, fromSlot?: number) {
    onPlace(code, slot, fromSlot)
    setSelectedPoolCode(null)
  }

  return (
    <>
      <TrainMap
        graph={graph}
        from={state.puzzle.from}
        to={state.puzzle.to}
        stops={state.puzzle.stops}
        slots={mapSlots}
        revealAll={revealAll}
      />

      <div className="w-full flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <EasySlotList
            fromStation={fromStation}
            toStation={toStation}
            placements={state.placements}
            stopsInOrder={state.puzzle.stops}
            checked={state.checked}
            selectedCode={selectedPoolCode}
            stations={graph.stations}
            onPlace={handlePlace}
            onReturnToPool={onReturnToPool}
            onSlotTap={handleSlotTap}
          />
        </div>
        {!state.checked && (
          <StationPool
            stations={graph.stations}
            codes={poolCodes}
            selectedCode={selectedPoolCode}
            onSelect={handlePoolSelect}
            onDropFromSlot={onReturnToPool}
          />
        )}
      </div>

      {!state.checked && (
        <>
          <button
            type="button"
            disabled={!allFilled}
            onClick={onCheck}
            className="w-full py-3 rounded-xl bg-[#003082] text-white font-semibold
                       disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
                       hover:bg-blue-900 active:bg-blue-950 transition-colors"
          >
            {allFilled ? 'Controleer' : `Vul alle ${state.placements.length} slots`}
          </button>
        </>
      )}

      {state.checked && (
        <ScoreScreen
          won={state.status === 'won'}
          puzzle={state.puzzle}
          slots={slotsForScore}
          stations={graph.stations}
          score={score}
          orderBroken={orderBroken}
        />
      )}
    </>
  )
}

export default App
