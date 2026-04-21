import { useEffect, useState } from 'react'
import './index.css'
import networkData from './data/network.json'
import type { Category, Mode, NetworkGraph, Slot, Station } from './data/types.js'
import { getDailyPair, getDailyPuzzle } from './game/puzzle.js'
import { useGameState, isModeLocked } from './game/useGameState.js'
import { TrainMap } from './components/TrainMap.js'
import { SlotList } from './components/SlotList.js'
import { EasySlotList } from './components/EasySlotList.js'
import { StationPool } from './components/StationPool.js'
import { CorrectAnswerColumn } from './components/CorrectAnswerColumn.js'
import { ScoreScreen } from './components/ScoreScreen.js'
import { StationInput } from './components/StationInput.js'
import { storage } from './storage/index.js'

const graph = networkData as unknown as NetworkGraph

// Each day gives us both an IC and a Sprinter puzzle (MB-479). `getDailyPair`
// is deterministic per date, so the pair is stable across reloads. Fallback to
// a fresh seeded pick if a category comes back empty — essentially impossible
// with today's candidate pool but keeps types honest.
const pair = getDailyPair(graph)
const icPuzzle = pair.ic ?? getDailyPuzzle(graph)
const sprPuzzle = pair.sprinter ?? getDailyPuzzle(graph)
const puzzleDate = icPuzzle.date
const ACTIVE_TAB_KEY = `ui:active-tab:${puzzleDate}`
const ACTIVE_TAB_VERSION = 1

const HINT_STORAGE_KEY = 'ui:mode-hint-seen'
const HINT_VERSION = 1

function App() {
  const [selectedPoolCode, setSelectedPoolCode] = useState<string | null>(null)
  const ic = useGameState(icPuzzle, 'hard')
  const spr = useGameState(sprPuzzle, 'hard')

  const [activeTab, setActiveTab] = useState<Category>(() => {
    const saved = storage.get<Category>(ACTIVE_TAB_KEY, ACTIVE_TAB_VERSION)
    return saved === 'ic' || saved === 'sprinter' ? saved : 'ic'
  })
  useEffect(() => {
    storage.set(ACTIVE_TAB_KEY, activeTab, ACTIVE_TAB_VERSION)
  }, [activeTab])

  // Global mode lock (MB-479): either puzzle having committed to a mode locks
  // both tabs. If either side has moved past the mode-choice gate — easy has
  // been picked anywhere, OR hard has ended on either side — the toggle is
  // disabled.
  const locked = isModeLocked(ic.state) || isModeLocked(spr.state)
  // With the cascade below, both hooks always share a mode. Read either.
  const mode = ic.state.mode

  const active = activeTab === 'ic' ? ic : spr

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
    // Cascade: switching to easy resets BOTH puzzles, so the two tabs stay
    // in lockstep on mode.
    ic.reset(icPuzzle, next)
    spr.reset(sprPuzzle, next)
  }

  function handleTabChange(next: Category) {
    if (next === activeTab) return
    setSelectedPoolCode(null)   // pool selection is per-puzzle
    setActiveTab(next)
  }

  const fromStation = graph.stations[active.state.puzzle.from]
  const toStation = graph.stations[active.state.puzzle.to]
  const isPlaying = active.state.status === 'playing'
  const stopsTotal = active.state.puzzle.stops.length
  const excludeCodes = [active.state.puzzle.from, active.state.puzzle.to, ...active.placedCodes]

  const icDone = ic.state.status !== 'playing'
  const sprDone = spr.state.status !== 'playing'

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
            {new Date(puzzleDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full gap-4">
        {/* Tabs + route header — MB-479 */}
        <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <CategoryTabs
            active={activeTab}
            onChange={handleTabChange}
            icDone={icDone}
            sprDone={sprDone}
          />
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-center flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Van</p>
                <p className="text-base font-semibold text-gray-900 truncate">{fromStation?.name ?? active.state.puzzle.from}</p>
              </div>
              <div className="text-gray-300 text-xl shrink-0">→</div>
              <div className="text-center flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Naar</p>
                <p className="text-base font-semibold text-gray-900 truncate">{toStation?.name ?? active.state.puzzle.to}</p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              {stopsTotal} tussenstation{stopsTotal === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {active.state.mode === 'hard' ? (
          <HardModeBody
            state={active.state}
            fromStation={fromStation}
            toStation={toStation}
            isPlaying={isPlaying}
            correctCount={active.correctCount}
            stopsTotal={stopsTotal}
            excludeCodes={excludeCodes}
            orderBroken={active.orderBroken}
            score={active.score}
            slotsForScore={active.slotsForScore}
            onGuess={active.guess}
          />
        ) : (
          <EasyModeBody
            state={active.state}
            fromStation={fromStation}
            toStation={toStation}
            selectedPoolCode={selectedPoolCode}
            setSelectedPoolCode={setSelectedPoolCode}
            orderBroken={active.orderBroken}
            score={active.score}
            slotsForScore={active.slotsForScore}
            onPlace={active.place}
            onReturnToPool={active.returnToPool}
            onCheck={active.check}
          />
        )}
      </main>
    </div>
  )
}

// ── Category tabs (MB-479) ──────────────────────────────────────────────────
// Two tabs: Intercity / Sprinter. Completion marker (✓) appears next to a tab
// once its puzzle is finished, so the player can see at a glance which one's
// left to do.

interface CategoryTabsProps {
  active: Category
  onChange: (next: Category) => void
  icDone: boolean
  sprDone: boolean
}

function CategoryTabs({ active, onChange, icDone, sprDone }: CategoryTabsProps) {
  return (
    <div role="tablist" aria-label="Puzzeltype" className="flex border-b border-gray-200">
      <TabButton
        label="Intercity"
        done={icDone}
        active={active === 'ic'}
        onClick={() => onChange('ic')}
      />
      <TabButton
        label="Sprinter"
        done={sprDone}
        active={active === 'sprinter'}
        onClick={() => onChange('sprinter')}
      />
    </div>
  )
}

function TabButton({
  label, done, active, onClick,
}: { label: string; done: boolean; active: boolean; onClick: () => void }) {
  const base = 'flex-1 py-3 text-sm font-semibold text-center transition-colors relative'
  const tone = active
    ? 'text-[#003082] bg-white'
    : 'text-gray-500 bg-gray-50 hover:text-gray-700'
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onClick}
      className={`${base} ${tone}`}
    >
      {label}
      {done && <span aria-label="voltooid" className="ml-2 text-green-600">✓</span>}
      {active && (
        <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#003082]" />
      )}
    </button>
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
        maxSlots={isPlaying ? state.maxSlots : state.slots.length}
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
  const [isDragActive, setIsDragActive] = useState(false)
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
    // MB-470: a pool chip consumed by the drop unmounts before its own
    // `dragend` can fire, so clear the drag highlight here too.
    setIsDragActive(false)
  }

  function handleReturnToPool(slot: number) {
    onReturnToPool(slot)
    setIsDragActive(false)
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

      <div className="w-full grid grid-cols-2 gap-3 items-start">
        <EasySlotList
          fromStation={fromStation}
          toStation={toStation}
          placements={state.placements}
          stopsInOrder={state.puzzle.stops}
          checked={state.checked}
          selectedCode={selectedPoolCode}
          isDragActive={isDragActive}
          stations={graph.stations}
          onPlace={handlePlace}
          onReturnToPool={handleReturnToPool}
          onSlotTap={handleSlotTap}
          onDragActiveChange={setIsDragActive}
        />
        {state.checked ? (
          <CorrectAnswerColumn
            stations={graph.stations}
            stopsInOrder={state.puzzle.stops}
          />
        ) : (
          <StationPool
            stations={graph.stations}
            codes={poolCodes}
            selectedCode={selectedPoolCode}
            onSelect={handlePoolSelect}
            onDropFromSlot={handleReturnToPool}
            onDragActiveChange={setIsDragActive}
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
          mode="easy"
        />
      )}
    </>
  )
}

export default App
