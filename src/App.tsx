import { useState } from 'react'
import './index.css'
import networkData from './data/network.json'
import type { NetworkGraph, Puzzle } from './data/types.js'
import type { Difficulty } from './game/puzzle.js'
import {
  getDailyPuzzle,
  getRandomPuzzle,
  getPuzzleNumber,
  dayDifficulty,
} from './game/puzzle.js'
import { loadDailyState, useGameState, MAX_GUESSES, type GameMode } from './game/useGameState.js'
import { GuessBoard } from './components/GuessBoard.js'
import { GuessInput } from './components/GuessInput.js'
import { TrainMap } from './components/TrainMap.js'
import { ScoreScreen } from './components/ScoreScreen.js'
import { Confetti } from './components/Confetti.js'

// ── Static data (loaded once at module level) ─────────────────────────────────

const graph = networkData as unknown as NetworkGraph
const dailyPuzzle = getDailyPuzzle(graph)
const puzzleNumber = getPuzzleNumber()

// ── App: manages mode + practice puzzle rotation ──────────────────────────────

export default function App() {
  const [mode, setMode] = useState<GameMode>('daily')
  const [practiceDifficulty, setPracticeDifficulty] = useState<Difficulty>('medium')
  const [practicePuzzle, setPracticePuzzle] = useState<Puzzle>(
    () => getRandomPuzzle(graph, 'medium') ?? dailyPuzzle,
  )
  const [recentPairs, setRecentPairs] = useState<string[]>([])

  const activePuzzle = mode === 'daily' ? dailyPuzzle : practicePuzzle

  // GameView remounts when this key changes — cleanly resets all game state
  const gameKey = `${mode}:${activePuzzle.from}-${activePuzzle.to}`

  function handleNewPracticePuzzle() {
    const pair = `${practicePuzzle.from}|${practicePuzzle.to}`
    const newRecent = [pair, ...recentPairs].slice(0, 20)
    setRecentPairs(newRecent)
    const next = getRandomPuzzle(graph, practiceDifficulty, newRecent)
    if (next) setPracticePuzzle(next)
  }

  function handleDifficultyChange(d: Difficulty) {
    setPracticeDifficulty(d)
    setRecentPairs([])
    const next = getRandomPuzzle(graph, d)
    if (next) setPracticePuzzle(next)
  }

  function handleModeSwitch(m: GameMode) {
    setMode(m)
    if (m === 'practice') {
      const next = getRandomPuzzle(graph, practiceDifficulty)
      if (next) setPracticePuzzle(next)
    }
  }

  return (
    <div className="min-h-svh bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#FFC917] flex items-center justify-center">
              <span className="text-base font-black text-gray-900 leading-none">O</span>
            </div>
            <h1 className="text-lg font-black tracking-tight text-gray-900">Overstap</h1>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            {(['daily', 'practice'] as GameMode[]).map(m => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[32px] ${
                  mode === m
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'daily' ? 'Dagelijks' : 'Oefenen'}
              </button>
            ))}
          </div>

          {/* Puzzle number / daily indicator */}
          {mode === 'daily' ? (
            <span className="text-xs text-gray-400 tabular-nums shrink-0">#{puzzleNumber}</span>
          ) : (
            <span className="text-xs text-gray-400 shrink-0">vrij</span>
          )}
        </div>
      </header>

      {/* Practice difficulty selector */}
      {mode === 'practice' && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Niveau:</span>
            <div className="flex gap-1 flex-1">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => handleDifficultyChange(d)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
                    practiceDifficulty === d
                      ? d === 'easy'
                        ? 'bg-emerald-500 text-white'
                        : d === 'medium'
                          ? 'bg-[#FFC917] text-gray-900'
                          : 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {d === 'easy' ? 'Makkelijk' : d === 'medium' ? 'Gemiddeld' : 'Moeilijk'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game view — key causes full remount on puzzle change */}
      <GameView
        key={gameKey}
        puzzle={activePuzzle}
        mode={mode}
        puzzleNumber={mode === 'daily' ? puzzleNumber : undefined}
        difficulty={mode === 'daily' ? dayDifficulty(dailyPuzzle.date) : practiceDifficulty}
        onNewPuzzle={mode === 'practice' ? handleNewPracticePuzzle : undefined}
      />
    </div>
  )
}

// ── GameView: holds game state for one puzzle ─────────────────────────────────

interface GameViewProps {
  puzzle: Puzzle
  mode: GameMode
  puzzleNumber?: number
  difficulty: Difficulty
  onNewPuzzle?: () => void
}

function GameView({ puzzle, mode, puzzleNumber, difficulty, onNewPuzzle }: GameViewProps) {
  // Load saved state fresh on every mount (so switching back to daily is correct)
  const saved = mode === 'daily' ? (loadDailyState(puzzle.date) ?? undefined) : undefined

  const { state, addStation, removeLastStation, clearInput, submitGuess, clearShake } =
    useGameState(puzzle, graph, mode, saved)

  const fromStation = graph.stations[state.puzzle.from]
  const toStation   = graph.stations[state.puzzle.to]
  const isPlaying   = state.status === 'playing'

  const excludeCodes   = [state.puzzle.from, state.puzzle.to, ...state.currentInput]
  const allGuessedCodes = [...new Set(state.guesses.flatMap(r => r.stations))]
  const correctCodes    = [...new Set(
    state.guesses.flatMap(r => r.stations.filter((_, i) => r.result.correct[i])),
  )]

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-4 max-w-lg mx-auto w-full gap-4">

      {/* Confetti on win */}
      {state.status === 'won' && <Confetti />}

      {/* Date + difficulty badge */}
      <div className="w-full flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(puzzle.date).toLocaleDateString('nl-NL', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </span>
        <DifficultyBadge difficulty={difficulty} />
      </div>

      {/* Route card */}
      <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-center flex-1 min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Van</p>
            <p className="text-base font-semibold text-gray-900 truncate">
              {fromStation?.name ?? state.puzzle.from}
            </p>
          </div>
          <div className="text-2xl shrink-0 select-none text-[#FFC917]">→</div>
          <div className="text-center flex-1 min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Naar</p>
            <p className="text-base font-semibold text-gray-900 truncate">
              {toStation?.name ?? state.puzzle.to}
            </p>
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
        shakingRowIdx={state.shakingRowIdx}
        onShakeEnd={clearShake}
      />

      {/* Score screen */}
      {state.status !== 'playing' && (
        <ScoreScreen
          won={state.status === 'won'}
          guesses={state.guesses}
          solution={state.solution}
          transferCount={state.transferCount}
          stations={graph.stations}
          puzzleDate={state.puzzle.date}
          puzzleNumber={puzzleNumber}
          mode={mode}
          onNewPuzzle={onNewPuzzle}
        />
      )}

      {/* Input area */}
      {isPlaying && (
        <>
          <p className="text-sm text-gray-500 text-center">
            Poging {state.guesses.length + 1} van {MAX_GUESSES}
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

      {/* Practice: new route button */}
      {mode === 'practice' && onNewPuzzle && (
        <button
          onClick={onNewPuzzle}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400
                     hover:border-[#FFC917] hover:text-gray-600 transition-colors min-h-[48px]"
        >
          Nieuw traject →
        </button>
      )}
    </main>
  )
}

// ── DifficultyBadge ───────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const cfg = {
    easy:   { label: 'Makkelijk', cls: 'bg-emerald-100 text-emerald-700' },
    medium: { label: 'Gemiddeld', cls: 'bg-yellow-100 text-yellow-700' },
    hard:   { label: 'Moeilijk',  cls: 'bg-red-100 text-red-700' },
  }[difficulty]

  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
