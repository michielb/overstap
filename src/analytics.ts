/**
 * Event tracking for t.michielb.nl.
 *
 * POSTs flat JSON to /wa/e. The backend (wa-json2influx) requires a top-level
 * `event` key and flattens every other top-level key into Influx — nested
 * objects break the write, so we keep everything flat.
 *
 * The base pageview pixel still fires from index.html to /wa/t.gif with its
 * fixed query-param schema; that's separate from this module.
 *
 * Promoted tags (indexed in Influx): site, datatype, slug, title, screen,
 * content_lang, mb_*, geo_*. Everything else becomes a field — high-cardinality
 * values like `points` or `wrong_guesses` are safe as fields.
 */

const ENDPOINT = 'https://t.michielb.nl/wa/e'
const SITE_ID = 'treintje'
const TITLE = 'Treintje'
const LANG = 'nl'

export type AnalyticsValue = string | number | boolean | null | undefined

/**
 * Fire an event to the analytics backend. The first argument is the required
 * `event` key; extra params are merged flat into the top-level JSON.
 *
 * Beacon strategy: `navigator.sendBeacon` when available (survives unload),
 * fetch with `keepalive: true` as fallback. All errors swallowed silently —
 * analytics must never break the game.
 */
export function track(event: string, params: Record<string, AnalyticsValue> = {}): void {
  if (typeof window === 'undefined') return
  try {
    const utm = new URLSearchParams(location.search)
    const payload: Record<string, AnalyticsValue> = {
      event,
      site: SITE_ID,
      title: TITLE,
      content_lang: LANG,
      screen: `${window.screen.width}x${window.screen.height}`,
      url: location.href,
      referrer: document.referrer || undefined,
      mb_source: utm.get('mb_source') || undefined,
      mb_medium: utm.get('mb_medium') || undefined,
      mb_campaign: utm.get('mb_campaign') || undefined,
      mb_term: utm.get('mb_term') || undefined,
      mb_content: utm.get('mb_content') || undefined,
    }
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === '') continue
      payload[k] = v
    }
    const clean: Record<string, AnalyticsValue> = {}
    for (const [k, v] of Object.entries(payload)) {
      if (v === null || v === undefined || v === '') continue
      clean[k] = v
    }
    const body = JSON.stringify(clean)

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      const queued = navigator.sendBeacon(ENDPOINT, blob)
      if (queued) return
      // sendBeacon returns false if the browser rejected it (rare, e.g.
      // quota); fall through to fetch.
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => { /* swallow */ })
  } catch {
    /* analytics must never break the game */
  }
}
