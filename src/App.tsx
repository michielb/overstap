import './index.css'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Overstap</h1>
          <span className="text-sm text-gray-500">Dagelijks treinraadsel</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full">
        {/* Route display */}
        <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Van</p>
              <p className="text-lg font-semibold text-gray-900">Amsterdam Centraal</p>
            </div>
            <div className="text-gray-300 text-2xl">→</div>
            <div className="text-center flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Naar</p>
              <p className="text-lg font-semibold text-gray-900">Eindhoven</p>
            </div>
          </div>
        </div>

        {/* Guess input area */}
        <div className="w-full mb-4">
          <p className="text-sm text-gray-600 text-center mb-3">
            Welke tussenhaltes heb je nodig?
          </p>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-gray-400 text-sm text-center">Raad component komt hier</p>
          </div>
        </div>

        {/* Attempts */}
        <div className="w-full space-y-2">
          <p className="text-xs text-gray-500 text-center">0 / 6 pogingen</p>
        </div>
      </main>
    </div>
  )
}

export default App
