# Treintje

A daily Dutch train puzzle. The current game (internal name: Overstap) is about guessing every intermediate stop on a train's line between A and B. Future games under the Treintje umbrella will share the same NS network data and station primitives.

> The GitHub repo, local checkout path, Obsidian folder, and Linear project are still called `overstap` for historical reasons — only the public brand, deploy subdomain, package name, and in-app copy use Treintje. Renaming those is a future cleanup; don't treat mixed references as a bug.

## Concept

Each day a new puzzle is shown: two NS stations (A → B) on a single train line, and the player has to name every intermediate stop. Two modes — hard (free recall) and easy (drag-and-drop ordering of given stops). See Obsidian `Projects/Overstap/Status.md` for the current, load-bearing gameplay description.

## Stack

- React + Vite + TypeScript
- Tailwind CSS v4
- No backend — all data is bundled as static JSON

## Project structure

```
src/
  components/   UI components
  data/         TypeScript models (types.ts) + bundled network.json
  game/         Game logic (puzzle selection, guess validation)
  utils/        Helpers
scripts/
  fetch-ns-data.ts     Fetch raw station/route data from NS API
  build-network.ts     Transform raw data -> network graph
  data/
    raw/               Raw API dumps (gitignored)
    network.json       Processed graph (committed, used by app)
```

## Data pipeline

1. `npm run fetch-data` — hits NS API, dumps raw JSON to `scripts/data/raw/`
2. `npm run build-network` — processes raw dumps into `src/data/network.json`

Requires `NS_API_KEY` in `.env`.

## NS API

Base URL: `https://gateway.apiportal.ns.nl`
Key endpoints:
- `GET /reisinformatie-api/api/v2/stations` — full station list
- `GET /reisinformatie-api/api/v2/disruptions` — disruptions (not used)
- Departure boards & trip planner are available but rate-limited

Transfer stations are identified by stations where 2+ different IC/Sprinter lines stop.
