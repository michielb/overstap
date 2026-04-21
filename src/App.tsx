import { useState } from 'react'
import './index.css'
import networkData from './data/network.json'
import type { Mode, NetworkGraph, Slot, Station } from './data/types.js'
import { getDailyPuzzle } from './game/puzzle.js'
import { useGameState, isModeLocked } from './game/useGameState.js'
import { TrainMap } from './components/TrainMap.js'
import { SlotList } from './components/SlotList.js'
import { EasySlotList } from './components/EasySlotList.js'
import { StationPool } from './components/StationPool.js'
import { ScoreScreen } from './components/ScoreScreen.js'
import { StationInput } from './components/StationInput.js'
import { storage } from './storage/index.js'

const graph = networkData as unknown as NetworkGraph
const puzzle = getDailyPuzzle(graph)

const HINT_STORAGE_KEY = 'ui:mode-hint-seen'
const HINT_VERSION = 1

function App() {
  const [selectedPoolCode, setSelectedPoolCode] = useState<string | null>(null)
  const { state, placedCodes, correctCount, orderBroken, score, slotsForScore,
          guess, place, returnToPool, check, reset } = useGameState(puzzle, 'hard')

  const mode = state.mode
  const locked = isModeLocked(state)

  // First-visit hint above the toggle. Persisted so it only appears once.
  const [showHint, setShowHint] = useState(() => {
    if (mode === 'easy') return false
    return storage.get<boolean>(HINT_STORAGE_KEY, HINT_VERSION) !== true
  })

  function dismissHint() {
    if (!showHint) return
    setShowHint(false)
    storage.set(HINT_STORAGE_KEY, true, HINT_VERSION)
  }

  function handleModeToggle(next: Mode) {
    dismissHint()
    if (next === mode) return
    if (next === 'hard') return           // easy → hard is never allowed
    if (locked) return                    // game over: no switching
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
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Treintje</h1>
          <ModeToggle
            mode={mode}
            locked={locked}
            showHint={showHint}
            onDismissHint={dismissHint}
            onChange={handleModeToggle}
          />
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
            {stopsTotal} tussenstation{stopsTotal === 1 ? '' : 's'}
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

// ── Mode toggle (MB-463) ────────────────────────────────────────────────────
// Easy → Hard is never allowed (seeing the pool = permanent easy for today).
// Hard → Easy is a "give up" path, allowed throughout the hard game;
// after the game ends, both sides are locked.

interface ModeToggleProps {
  mode: Mode
  locked: boolean
  showHint: boolean
  onDismissHint: () => void
  onChange: (next: Mode) => void
}

function ModeToggle({ mode, locked, showHint, onDismissHint, onChange }: ModeToggleProps) {
  const easyDisabled = locked && mode !== 'easy'
  const hardDisabled = mode === 'easy' || locked

  return (
    <div className="relative flex items-center">
      {showHint && (
        <button
          type="button"
          onClick={onDismissHint}
          aria-label="Tip sluiten"
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-10
                     bg-gray-900 text-white text-xs rounded-lg pl-2.5 pr-1.5 py-1.5 shadow-lg
                     whitespace-nowrap flex items-center gap-1.5
                     hover:bg-gray-800 active:bg-gray-950 transition-colors cursor-pointer"
        >
          <span>Te moeilijk? Schakel naar Makkelijk voor vandaag!</span>
          <span className="text-gray-400 leading-none text-base">×</span>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2
                           border-4 border-transparent border-b-gray-900 pointer-events-none" />
        </button>
      )}
      <div className="flex rounded-full bg-gray-100 p-0.5 text-xs font-medium">
        <ToggleButton
          label="Makkelijk"
          active={mode === 'easy'}
          disabled={easyDisabled}
          onClick={() => onChange('easy')}
        />
        <ToggleButton
          label="Moeilijk"
          active={mode === 'hard'}
          disabled={hardDisabled}
          onClick={() => onChange('hard')}
        />
      </div>
    </div>
  )
}

function ToggleButton({
  label, active, disabled, onClick,
}: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  const base = 'px-3 py-1 rounded-full transition-colors'
  const tone = active
    ? 'bg-white text-gray-900 shadow-sm'
    : disabled
    ? 'text-gray-400 cursor-not-allowed'
    : 'text-gray-500 hover:text-gray-700'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !active}
      className={`${base} ${tone}`}
    >
      {label}
    </button>
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

      {isPlaying && (
        <div className="w-full flex items-center justify-between px-1 text-xs text-gray-500">
          <span>Slot {slotsUsed + 1} / {state.maxSlots}</span>
          <span>{correctCount} van {stopsTotal} geraden</span>
        </div>
      )}

      <SlotList
        fromStation={fromStation}
        toStation={toStation}
        slots={state.slots}
        maxSlots={state.maxSlots}
        stations={graph.stations}
        activeInput={isPlaying ? (
          <StationInput
            stations={graph.stations}
            excludeCodes={excludeCodes}
            onSelect={onGuess}
            placeholder="Welk station nu?"
          />
        ) : undefined}
      />

      {!isPlaying && (
        <ScoreScreen
          won={state.status === 'won'}
          puzzle={state.puzzle}
          slots={slotsForScore}
          stations={graph.stations}
          score={score}
          orderBroken={orderBroken}
          mode="hard"
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

      {state.checked ? (
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
      ) : (
        <div className="w-full grid grid-cols-2 gap-3 items-start">
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
          <StationPool
            stations={graph.stations}
            codes={poolCodes}
            selectedCode={selectedPoolCode}
            onSelect={handlePoolSelect}
            onDropFromSlot={onReturnToPool}
          />
        </div>
      )}

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
          mode="easy"
        />
      )}
    </>
  )
}

export default App
