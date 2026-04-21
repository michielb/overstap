/**
 * Lightweight event tracking via 1×1 gif beacon to t.michielb.nl.
 * Mirrors the base pageview fired from index.html; events add an `evt` param
 * and any number of typed context fields.
 *
 * Designed to never crash the app: all failures swallowed silently. No queue,
 * no retries — fire and forget.
 */

const ENDPOINT = 'https://t.michielb.nl/wa/e.gif'
const SITE_ID = 'treintje'

export type AnalyticsValue = string | number | boolean | null | undefined

/**
 * Fire an event beacon. `event` names use snake_case (e.g. "puzzle_complete").
 * `params` can be any flat key/value pairs — values are stringified, nullish
 * values are dropped.
 */
export function track(event: string, params: Record<string, AnalyticsValue> = {}): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return
  try {
    const qs = new URLSearchParams()
    qs.set('sid', SITE_ID)
    qs.set('evt', event)
    qs.set('u', location.href)
    qs.set('t', 'Treintje')
    qs.set('_', String(Date.now()))
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === '') continue
      qs.set(k, String(v))
    }
    new Image().src = `${ENDPOINT}?${qs.toString()}`
  } catch {
    /* analytics must never break the game */
  }
}
