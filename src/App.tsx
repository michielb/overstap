import { useEffect, useMemo, useState } from 'react'
import './index.css'
import networkData from './data/network.json'
import type { Category, Mode, NetworkGraph, Slot, Station } from './data/types.js'
import { getDailyPair, getDailyPuzzle, getRandomPuzzle } from './game/puzzle.js'
import { useGameState, isModeLocked } from './game/useGameState.js'
import { TrainMap } from './components/TrainMap.js'
import { SlotList } from './components/SlotList.js'
import { EasySlotList } from './components/EasySlotList.js'
import { StationPool } from './components/StationPool.js'
import { CorrectAnswerColumn } from './components/CorrectAnswerColumn.js'
import { ScoreScreen } from './components/ScoreScreen.js'
import { StationInput } from './components/StationInput.js'
import { storage } from './storage/index.js'
import { track } from './analytics.js'

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

type View = 'daily' | 'practice'

function App() {
  const [selectedPoolCode, setSelectedPoolCode] = useState<string | null>(null)
  const ic = useGameState(icPuzzle, 'hard')
  const spr = useGameState(sprPuzzle, 'hard')

  // Practice mode (MB-480): ephemeral throwaway puzzles. Initial puzzle is
  // picked once on mount. Entering practice from the footer re-rolls via
  // practice.reset; reload = remount = fresh puzzle.
  const initialPractice = useMemo(() => getRandomPuzzle(graph), [])
  const practice = useGameState(initialPractice, 'hard', { ephemeral: true })

  const [view, setView] = useState<View>('daily')

  const [activeTab, setActiveTab] = useState<Category>(() => {
    const saved = storage.get<Category>(ACTIVE_TAB_KEY, ACTIVE_TAB_VERSION)
    return saved === 'ic' || saved === 'sprinter' ? saved : 'ic'
  })
  useEffect(() => {
    storage.set(ACTIVE_TAB_KEY, activeTab, ACTIVE_TAB_VERSION)
  }, [activeTab])

  // Global mode lock (MB-479): either DAILY puzzle having committed to a mode
  // locks both tabs. Practice is always unlocked regardless.
  const dailyLocked = isModeLocked(ic.state) || isModeLocked(spr.state)
  const locked = view === 'daily' ? dailyLocked : false
  // In daily both hooks share mode (cascade); in practice, practice has its
  // own mode decoupled from daily.
  const mode = view === 'practice' ? practice.state.mode : ic.state.mode

  const active = view === 'practice'
    ? practice
    : (activeTab === 'ic' ? ic : spr)

  // First-visit hint above the toggle. Persisted so it only appears once.
  // Never shown in practice — there's no "too hard, give up" concept there.
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
    if (view === 'practice') {
      // Practice is unlocked in both directions — flip freely. Same puzzle,
      // just re-initialised in the new mode.
      setSelectedPoolCode(null)
      practice.reset(practice.state.puzzle, next)
      track('mode_switch', { to: next, view: 'practice' })
      return
    }
    // Daily flow: easy is one-way, lock after commit, cascade both tabs.
    if (next === 'hard') return
    if (locked) return
    setSelectedPoolCode(null)
    ic.reset(icPuzzle, next)
    spr.reset(sprPuzzle, next)
    track('mode_switch', { to: next, view: 'daily' })
  }

  function handleTabChange(next: Category) {
    if (next === activeTab) return
    setSelectedPoolCode(null)   // pool selection is per-puzzle
    setActiveTab(next)
    track('tab_switch', { to: next })
  }

  function enterPractice() {
    dismissHint()
    setSelectedPoolCode(null)
    // Roll a fresh practice puzzle; default to the daily mode for continuity.
    const fresh = getRandomPuzzle(graph)
    practice.reset(fresh, ic.state.mode)
    setView('practice')
    track('practice_enter', { mode: ic.state.mode, category: fresh.category })
  }

  function exitPractice() {
    setSelectedPoolCode(null)
    setView('daily')
    track('practice_exit')
  }

  function newPracticePuzzle() {
    setSelectedPoolCode(null)
    const fresh = getRandomPuzzle(graph)
    practice.reset(fresh, practice.state.mode)
    track('practice_new', { category: fresh.category })
  }

  function giveUpActive() {
    active.giveUp()
    track(view === 'practice' ? 'practice_giveup' : 'daily_giveup', {
      category: active.state.puzzle.category,
      mode: active.state.mode,
    })
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
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Spoor</h1>
          <ModeToggle
            mode={mode}
            locked={locked}
            freeFlip={view === 'practice'}
            showHint={showHint && view === 'daily'}
            onDismissHint={dismissHint}
            onChange={handleModeToggle}
          />
          {view === 'daily' ? (
            <span className="text-sm text-gray-400 tabular-nums">
              {new Date(puzzleDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
            </span>
          ) : (
            <button
              type="button"
              onClick={exitPractice}
              className="text-sm font-medium text-[#003082] hover:underline"
            >
              ← Vandaag
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full gap-4">
        {/* Daily: tabs + route header. Practice: just route header + oefenmodus label. */}
        <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {view === 'daily' ? (
            <CategoryTabs
              active={activeTab}
              onChange={handleTabChange}
              icDone={icDone}
              sprDone={sprDone}
            />
          ) : (
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-gray-200 bg-amber-50">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Oefenmodus</span>
              <span className="text-xs text-amber-700/70">
                {active.state.puzzle.category === 'ic' ? 'Intercity' : 'Sprinter'} · {stopsTotal} stop{stopsTotal === 1 ? '' : 's'}
              </span>
            </div>
          )}
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
            onGiveUp={giveUpActive}
            hideShare={view === 'practice'}
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
            hideShare={view === 'practice'}
          />
        )}

        {/* Practice controls — at the bottom of the page. Hard mode's give-up
            now lives inside the slot box, so only "Nog een puzzel" is here.
            Easy mode has no slot-box give-up, so keep the two-button row. */}
        {view === 'practice' && active.state.mode === 'hard' && (
          <button
            type="button"
            onClick={newPracticePuzzle}
            className="w-full py-2.5 rounded-xl bg-[#003082] text-white text-sm font-semibold
                       hover:bg-blue-900 active:bg-blue-950 transition-colors mt-2"
          >
            Nog een puzzel
          </button>
        )}
        {view === 'practice' && active.state.mode === 'easy' && (
          <div className="w-full grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={giveUpActive}
              disabled={!isPlaying}
              className="py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700
                         hover:bg-gray-50 active:bg-gray-100 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              Ik geef het op
            </button>
            <button
              type="button"
              onClick={newPracticePuzzle}
              className="py-2.5 rounded-xl bg-[#003082] text-white text-sm font-semibold
                         hover:bg-blue-900 active:bg-blue-950 transition-colors"
            >
              Nog een puzzel
            </button>
          </div>
        )}

        {/* Footer: entry point to practice from the daily view */}
        {view === 'daily' && (
          <div className="mt-2 text-center text-xs text-gray-400">
            <button
              type="button"
              onClick={enterPractice}
              className="hover:text-gray-600 hover:underline"
            >
              Oefenen met een willekeurige puzzel
            </button>
          </div>
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
  /** When true, both directions flip freely — used in practice mode (MB-480). */
  freeFlip?: boolean
  showHint: boolean
  onDismissHint: () => void
  onChange: (next: Mode) => void
}

function ModeToggle({ mode, locked, freeFlip, showHint, onDismissHint, onChange }: ModeToggleProps) {
  const easyDisabled = freeFlip ? false : (locked && mode !== 'easy')
  const hardDisabled = freeFlip ? false : (mode === 'easy' || locked)

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
  onGiveUp: () => void
  hideShare?: boolean
}

function HardModeBody({
  state, fromStation, toStation, isPlaying, correctCount, stopsTotal,
  excludeCodes, orderBroken, score, slotsForScore, onGuess, onGiveUp, hideShare,
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
        stops={state.puzzle.stops}
        stations={graph.stations}
        revealUnfilled={!isPlaying}
        activeInput={isPlaying ? (
          <StationInput
            stations={graph.stations}
            excludeCodes={excludeCodes}
            onSelect={onGuess}
            placeholder="Welk station nu?"
          />
        ) : undefined}
        footer={isPlaying ? (
          <button
            type="button"
            onClick={onGiveUp}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Ik geef het op
          </button>
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
          hideShare={hideShare}
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
  hideShare?: boolean
}

function EasyModeBody({
  state, fromStation, toStation, selectedPoolCode, setSelectedPoolCode,
  orderBroken, score, slotsForScore, onPlace, onReturnToPool, onCheck, hideShare,
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
          hideShare={hideShare}
        />
      )}
    </>
  )
}

export default App
