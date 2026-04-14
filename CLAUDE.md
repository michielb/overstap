# Overstap

A daily Dutch train route guessing game. Players guess the transfer stations (overstappen) needed to travel between two NS stations.

## Concept

Each day a new puzzle is shown: two NS stations (A → B). The player must guess the minimum set of transfer stations needed. Like Wordle but for train routes.

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

## Game rules

- 6 guesses maximum
- A guess is a list of transfer stations in order
- Correct if the sequence is a valid route with minimum transfers
- Direct routes (0 transfers) are valid puzzles — answer is empty
