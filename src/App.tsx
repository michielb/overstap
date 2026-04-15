import { useState } from 'react'
import './index.css'
import networkData from './data/network.json'
import type { NetworkGraph } from './data/types.js'
import { getDailyPuzzle, getPracticePuzzle, type Difficulty } from './game/puzzle.js'
import { useGameState, MAX_GUESSES } from './game/useGameState.js'
import { GuessBoard } from './components/GuessBoard.js'
import { GuessInput } from './components/GuessInput.js'
import { TrainMap } from './components/TrainMap.js'
import { ScoreScreen } from './components/ScoreScreen.js'

const graph = networkData as unknown as NetworkGraph
const dailyPuzzle = getDailyPuzzle(graph)

const DIFFICULTIES: Difficulty[] = ['makkelijk', 'gemiddeld', 'moeilijk']
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  makkelijk: 'Makkelijk',
  gemiddeld: 'Gemiddeld',
  moeilijk: 'Moeilijk',
}

function App() {
  const [mode, setMode] = useState<'daily' | 'practice'>('daily')
  const [difficulty, setDifficulty] = useState<Difficulty>('gemiddeld')

  const { state, addStation, removeLastStation, clearInput, submitGuess, reset } = useGameState(dailyPuzzle, graph)

  function handleModeToggle(newMode: 'daily' | 'practice') {
    if (newMode === mode) return
    setMode(newMode)
    if (newMode === 'daily') {
      reset(dailyPuzzle)
    } else {
      reset(getPracticePuzzle(graph, difficulty))
    }
  }

  function handleDifficultyChange(d: Difficulty) {
    setDifficulty(d)
    reset(getPracticePuzzle(graph, d))
  }

  function handleNewPuzzle() {
    reset(getPracticePuzzle(graph, difficulty))
  }

  const fromStation = graph.stations[state.puzzle.from]
  const toStation = graph.stations[state.puzzle.to]

  const excludeCodes = [
    state.puzzle.from,
    state.puzzle.to,
    ...state.currentInput,
  ]

  const isPlaying = state.status === 'playing'

  const allGuessedCodes = [...new Set(state.guesses.flatMap(r => r.stations))]

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
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Overstap</h1>
            {mode === 'daily' && (
              <p className="text-xs text-gray-400">
                {new Date(state.puzzle.date + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
              </p>
            )}
          </div>
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['daily', 'practice'] as const).map(m => (
              <button
                key={m}
                onClick={() => handleModeToggle(m)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors
                  ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {m === 'daily' ? 'Dagelijks' : 'Oefenen'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Practice controls */}
      {mode === 'practice' && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div className="flex gap-1">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  onClick={() => handleDifficultyChange(d)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                    ${difficulty === d
                      ? 'bg-[#003082] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
            <button
              onClick={handleNewPuzzle}
              className="text-xs text-[#003082] font-medium hover:underline shrink-0"
            >
              Nieuw traject →
            </button>
          </div>
        </div>
      )}

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

        {/* In practice mode, show Nieuw traject after game ends */}
        {mode === 'practice' && state.status !== 'playing' && (
          <button
            onClick={handleNewPuzzle}
            className="w-full py-2.5 rounded-xl border-2 border-[#003082] text-[#003082] font-semibold text-sm
                       hover:bg-blue-50 active:bg-blue-100 transition-colors"
          >
            Nieuw traject
          </button>
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
