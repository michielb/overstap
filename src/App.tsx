import './index.css'
import networkData from './data/network.json'
import type { NetworkGraph } from './data/types.js'
import { getDailyPuzzle } from './game/puzzle.js'
import { useGameState, MAX_GUESSES } from './game/useGameState.js'
import { GuessBoard } from './components/GuessBoard.js'
import { GuessInput } from './components/GuessInput.js'
import { TrainMap } from './components/TrainMap.js'
import { ScoreScreen } from './components/ScoreScreen.js'

const graph = networkData as unknown as NetworkGraph
const puzzle = getDailyPuzzle(graph)

function App() {
  const { state, addStation, removeLastStation, clearInput, submitGuess } = useGameState(puzzle, graph)

  const fromStation = graph.stations[state.puzzle.from]
  const toStation = graph.stations[state.puzzle.to]

  // Codes the player cannot add: origin, destination, already in current input
  const excludeCodes = [
    state.puzzle.from,
    state.puzzle.to,
    ...state.currentInput,
  ]

  const isPlaying = state.status === 'playing'

  // Collect all station codes guessed (any guess, any row)
  const allGuessedCodes = [...new Set(state.guesses.flatMap(r => r.stations))]

  // Codes confirmed correct: appear correct in at least one guess row
  const correctCodes = [...new Set(
    state.guesses.flatMap(r =>
      r.stations.filter((_, i) => r.result.correct[i])
    )
  )]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Overstap</h1>
          <span className="text-sm text-gray-400 tabular-nums">
            {new Date(puzzle.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full gap-4">

        {/* Route card */}
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
            {state.transferCount === 0
              ? 'Directe trein — geen overstap nodig'
              : `${state.transferCount} overstap${state.transferCount === 1 ? '' : 'pen'} nodig`}
          </p>
        </div>

        {/* Train map */}
        <TrainMap
          graph={graph}
          from={state.puzzle.from}
          to={state.puzzle.to}
          guesses={allGuessedCodes}
          correctGuesses={correctCodes}
          revealSolution={state.status !== 'playing'}
          solution={state.solution}
        />

        {/* Guess board */}
        <GuessBoard
          guesses={state.guesses}
          stations={graph.stations}
          transferCount={state.transferCount}
        />

        {/* Score screen after game ends */}
        {state.status !== 'playing' && (
          <ScoreScreen
            won={state.status === 'won'}
            guesses={state.guesses}
            solution={state.solution}
            transferCount={state.transferCount}
            stations={graph.stations}
            puzzleDate={state.puzzle.date}
          />
        )}

        {/* Input area */}
        {isPlaying && (
          <>
            <p className="text-sm text-gray-500 text-center">
              Poging {state.guesses.length + 1} van {MAX_GUESSES} — welke overstappen heb je nodig?
            </p>
            <GuessInput
              currentInput={state.currentInput}
              stations={graph.stations}
              excludeCodes={excludeCodes}
              onAdd={addStation}
              onRemoveLast={removeLastStation}
              onClear={clearInput}
              onSubmit={submitGuess}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App
