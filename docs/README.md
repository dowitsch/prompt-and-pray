## Homeward — Procedural Narrative Engine

A canvas of paths, choices, and endings. The engine is amnesiac; every match begins fresh.

---

## Purpose
Homeward generates branching stories where **players write the journey that adventures themselves**. The code enforces geography, physics, and rules; the agent brain interprets intent.

---

## Quick Start
```bash
# Clone & install
git clone https://github.com/anomalyco/loop.git
cd loop
npm install        # or: yarn install pnpm add --save ...
npm run dev        # Vite dev server with hot reload
```
Starts at `http://localhost:5173`

---

## Core Architecture (TL;DR)

1. **Engine (`src/lib/engine`)** – Manages physical state: movement cost, fog of war, victory detection.
2. **Store (`src/lib/db`)** – SQLite schema underpins levels (stories), players, runs, memory.
3. **UI (`src/lib/client`)** – Svelte components render terrain, choices, input.
4. **AI Brain (`src/lib/agent`)** – Uses OpenAI via `ApertusBrain` when keys present; falls back to deterministic logic (`MockBrain`).
   - Presents game state as `DecisionContext` to LLM.
   - Results are never accepted if they violate the saved story graph or exceed token limits.

--- 

## How Prompt Engineering Is Handled

- **Data passed to the model**:
  - Current node description (`title`, `body`, `attributes`)
  - Available choice labels (`label`)
  - Limited memory log
  - Visited nodes (`reveal.visitedNodes`)
  - Player's current locale

- **Bailback Safety**:
  - If provider fails or LLM times out → `MockBrain` returns static responses to avoid freezing the game.
  - **Never hand world truth over**; only ask the LLM to **narrate an outcome** given constraints.

---

## Level Design & Schema

Stories are **directed graphs** (`nodes` → `choices` → `nodes`). Key tables include:

- `stories` – Authored content, start node, status
- `nodes` – Terrain with `x, y`, `endingType`
- `choices` – Labels mapping from one node to another
- `runs` – Per-player journey log with `decisions`, `depthReached`, `ending`

**Writing New Levels**:

1. Draft in plain text in `stories/`
2. Publish via admin UI (internal action)
3. The engine automatically runs a **path-cost sanity check** before publishing.

--- 

## Contribution

- **Branch naming**: `feature/<what-things>` / `bugfix/<what-broke>`
- **Database integrity**: Do **not** soft-delete rows manually; use migrations (`src/lib/db/migrate.ts`) for schema changes.
- **Committing**: Never commit API keys or hard secrets.
- **Lint/Tests**:
  ```bash
  npm run lint
  npm run test
  ```
- **AI Keys**: Store in `.env` (not committed). Use mock mode (`AI_PROVIDER=mock`) for local dev safety.

--- 

## Testing Quick Reference

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production bundle |
| `npm run lint` | Static analysis |
| `npm run test` | Jest + React Testing Library |

--- 

## Key Files

- `src/lib/engine/game.ts` – game loop & state machine
- `src/lib/agent/index.ts` – AI brain selector & persistence
- `docs/story-schema.md` – detailed schema mapping (current documentation)

--- 

## Security / Secrecy

Never hardcode API keys in the repo. Always use `.env` or a secrets manager.

--- 

## Next Steps

1. Read `docs/story-schema.md` if you write new levels.
2. Inspect `src/lib/engine/types.ts` for exact number limits (e.g., `MEMORY_GRANT_CHARS = 20`)
3. Look at `src/lib/agent/brain.ts` if extending the LLM prompt structure.

Happy adventuring — and careful with that last decision. 🗺️

