/**
 * MB-391: Station autocomplete input
 *
 * Search field that fuzzy-matches station names and lets the player
 * add transfer station guesses one by one.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Station } from '../data/types.js'

interface Props {
  stations: Record<string, Station>
  excludeCodes: string[]           // already guessed or origin/dest
  onSelect: (code: string) => void
  disabled?: boolean
  placeholder?: string
}

export function StationInput({ stations, excludeCodes, onSelect, disabled, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const results = query.length >= 1
    ? Object.values(stations)
        .filter(s => !excludeCodes.includes(s.code))
        .filter(s => matchesQuery(s, query))
        .sort((a, b) => rankMatch(a, query) - rankMatch(b, query))
        .slice(0, 8)
    : []

  function matchesQuery(station: Station, q: string): boolean {
    const needle = q.toLowerCase().replace(/[^a-z0-9]/g, '')
    const haystack = [station.name, station.nameShort, station.code]
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    return haystack.includes(needle)
  }

  function rankMatch(station: Station, q: string): number {
    const needle = q.toLowerCase()
    const name = station.name.toLowerCase()
    if (name.startsWith(needle)) return 0
    if (name.includes(needle)) return 1
    return 2
  }

  const select = useCallback((code: string) => {
    onSelect(code)
    setQuery('')
    setOpen(false)
    setHighlighted(0)
    inputRef.current?.focus()
  }, [onSelect])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      select(results[highlighted].code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { setHighlighted(0) }, [query])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder ?? 'Zoek een station…'}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm
                   placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400
                   focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed"
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => query.length >= 1 && setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {open && results.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200
                     shadow-lg overflow-hidden"
        >
          {results.map((s, i) => (
            <li
              key={s.code}
              className={`px-4 py-2.5 cursor-pointer text-sm flex items-center justify-between
                         ${i === highlighted ? 'bg-yellow-50 text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={e => { e.preventDefault(); select(s.code) }}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-gray-400 font-mono">{s.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
