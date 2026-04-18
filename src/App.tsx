import './index.css'
import networkData from './data/network.json'
import type { NetworkGraph } from './data/types.js'
import { getDailyPuzzle } from './game/puzzle.js'
import { useGameState } from './game/useGameState.js'
import { TrainMap } from './components/TrainMap.js'
import { SlotList } from './components/SlotList.js'
import { ScoreScreen } from './components/ScoreScreen.js'
import { StationInput } from './components/StationInput.js'

const graph = networkData as unknown as NetworkGraph
const puzzle = getDailyPuzzle(graph)

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Makkelijk',
  medium: 'Gemiddeld',
  hard: 'Moeilijk',
}

function App() {
  const { state, placedCodes, correctCount, orderBroken, score, guess } = useGameState(puzzle)

  const fromStation = graph.stations[state.puzzle.from]
  const toStation = graph.stations[state.puzzle.to]

  const isPlaying = state.status === 'playing'
  const slotsUsed = state.slots.length
  const stopsTotal = state.puzzle.stops.length

  const excludeCodes = [state.puzzle.from, state.puzzle.to, ...placedCodes]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Overstap</h1>
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

        {/* Map (progressive reveal) */}
        <TrainMap
          graph={graph}
          from={state.puzzle.from}
          to={state.puzzle.to}
          stops={state.puzzle.stops}
          slots={state.slots}
          revealAll={!isPlaying}
        />

        {/* Slot list — shows the guess timeline */}
        <SlotList
          fromStation={fromStation}
          toStation={toStation}
          slots={state.slots}
          maxSlots={state.maxSlots}
          stations={graph.stations}
        />

        {/* End-game summary */}
        {!isPlaying && (
          <ScoreScreen
            won={state.status === 'won'}
            puzzle={state.puzzle}
            slots={state.slots}
            stations={graph.stations}
            score={score}
            orderBroken={orderBroken}
          />
        )}

        {/* Input */}
        {isPlaying && (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between px-1 text-xs text-gray-500">
              <span>
                Slot {slotsUsed + 1} / {state.maxSlots}
              </span>
              <span>
                {correctCount} van {stopsTotal} geraden
              </span>
            </div>
            <StationInput
              stations={graph.stations}
              excludeCodes={excludeCodes}
              onSelect={guess}
              placeholder="Welk station komt tussen A en B?"
            />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
