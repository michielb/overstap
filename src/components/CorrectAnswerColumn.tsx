/**
 * CorrectAnswerColumn — post-submit right column for easy mode (MB-467).
 *
 * Mirrors EasySlotList's row rhythm (A-spacer + N station pills + B-spacer)
 * so each row aligns horizontally with the player's placement on the left.
 * Pills use NS blue (#0063D3), the same colour as a pre-submit filled chip.
 * Rows stagger-fade in top-to-bottom; `prefers-reduced-motion` skips it.
 */

import type { Station } from '../data/types.js'

interface Props {
  stations: Record<string, Station>
  stopsInOrder: string[]
}

export function CorrectAnswerColumn({ stations, stopsInOrder }: Props) {
  return (
    <div
      className="min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-4"
      aria-label="Juiste volgorde"
    >
      <ol className="flex flex-col gap-1.5">
        <li className="h-[2.75rem]" aria-hidden />

        {stopsInOrder.map((code, i) => {
          const station = stations[code]
          const name = station?.nameShort ?? station?.name ?? code
          const fullName = station?.name ?? code
          return (
            <li key={`${i}-${code}`} className="py-1">
              <div
                className="correct-answer-reveal w-full h-10 px-3 rounded-xl bg-[#0063D3] text-white
                           text-sm font-medium shadow-sm select-none flex items-center"
                style={{ animationDelay: `${i * 60}ms` }}
                title={fullName}
              >
                <span className="truncate">{name}</span>
              </div>
            </li>
          )
        })}

        <li className="h-[2.75rem]" aria-hidden />
      </ol>
    </div>
  )
}
