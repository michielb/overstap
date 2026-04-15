/**
 * MB-391: Station autocomplete input
 * MB-398: Mobile fix — dropdown opens above input when near bottom of screen
 *         (prevents keyboard from hiding the results list).
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Station } from '../data/types.js'

interface Props {
  stations: Record<string, Station>
  excludeCodes: string[]
  onSelect: (code: string) => void
  disabled?: boolean
  placeholder?: string
}

export function StationInput({ stations, excludeCodes, onSelect, disabled, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [dropAbove, setDropAbove] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)

  const results = query.length >= 1
    ? Object.values(stations)
        .filter(s => !excludeCodes.includes(s.code))
        .filter(s => matchesQuery(s, query))
        .sort((a, b) => rankMatch(a, query) - rankMatch(b, query))
        .slice(0, 8)
    : []

  function matchesQuery(station: Station, q: string): boolean {
    const needle   = q.toLowerCase().replace(/[^a-z0-9]/g, '')
    const haystack = [station.name, station.nameShort, station.code]
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    return haystack.includes(needle)
  }

  function rankMatch(station: Station, q: string): number {
    const needle = q.toLowerCase()
    const name   = station.name.toLowerCase()
    if (name.startsWith(needle)) return 0
    if (name.includes(needle))   return 1
    return 2
  }

  const select = useCallback((code: string) => {
    onSelect(code)
    setQuery('')
    setOpen(false)
    setHighlighted(0)
    inputRef.current?.focus()
  }, [onSelect])

  /** Detect if the input is in the lower 55% of the visible viewport — open dropdown above. */
  function updateDropDirection() {
    if (!inputRef.current) return
    const rect      = inputRef.current.getBoundingClientRect()
    const vhHeight  = window.visualViewport?.height ?? window.innerHeight
    setDropAbove(rect.bottom > vhHeight * 0.55)
  }

  function handleFocus() {
    updateDropDirection()
    if (query.length >= 1) setOpen(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
    updateDropDirection()
  }

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
      if (
        listRef.current  && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Re-check drop direction when virtual keyboard appears/disappears
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handler = () => updateDropDirection()
    vv.addEventListener('resize', handler)
    return () => vv.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { setHighlighted(0) }, [query])

  const showDropdown = open && results.length > 0

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder ?? 'Zoek een station…'}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm
                   placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC917]
                   focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed
                   min-h-[48px]"
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="search"
      />

      {showDropdown && (
        <ul
          ref={listRef}
          className={`absolute z-50 w-full bg-white rounded-xl border border-gray-200
                      shadow-lg overflow-hidden max-h-60 overflow-y-auto
                      ${dropAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {results.map((s, i) => (
            <li
              key={s.code}
              className={`px-4 py-3 cursor-pointer text-sm flex items-center justify-between
                         min-h-[48px] select-none
                         ${i === highlighted
                           ? 'bg-yellow-50 text-gray-900'
                           : 'text-gray-700 hover:bg-gray-50'}`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={e => { e.preventDefault(); select(s.code) }}
              onTouchEnd={e => { e.preventDefault(); select(s.code) }}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-gray-400 font-mono ml-2 shrink-0">{s.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
