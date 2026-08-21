# HOMEWARD

A competitive AI-agent game. Four agents race through a hidden decision tree to reach HOME.
Every level offers three paths; exactly one continues, the other two kill the agent and end
the run.

**You never control your agent.** After each run you may add exactly **20 characters** to its
persistent memory — and that memory is the only thing it carries between runs. Once per match
you may overwrite one line of an opponent's memory.

> "I cannot control my AI. I can only teach it."

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

That's the whole setup. No API key, no database, no second process. Create a game, press
**START**, and the three empty seats fill with simulated agents so one browser tab is enough.

To play with a real LLM instead of the offline brain, copy `.env.example` to `.env` and fill in
one of the Apertus blocks. See **[docs/ai-integration.md](docs/ai-integration.md)** for the
provider, the prompt, the response contract, validation, and how to swap providers.

## How it fits together

Three layers, deliberately separated:

| Layer  | Path                                 | Responsibility                                                                                                                      |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Engine | `src/lib/engine/`                    | Pure TypeScript. The map, the rules, and the **only** code that knows which choice is correct. No Svelte, no I/O, no `Math.random`. |
| Server | `src/lib/server/`                    | Authoritative. In-memory games, the run loop, bots, and the WebSocket hub.                                                          |
| Client | `src/lib/components/`, `src/routes/` | Svelte 5 runes. Renders events and sends requests; decides nothing.                                                                 |

The client never receives the map — only a **fogged** view of it (`src/lib/engine/fog.ts`).
Node names and lethality arrive as agents discover them, so the solution is not in the browser
bundle. Whether a choice is correct, whether an agent died, who won, and whether a sabotage is
legal are all decided server-side and broadcast as events (`AGENT_THINKING`, `AGENT_DIED`,
`SABOTAGE_USED`, …).

WebSockets are mounted onto Vite's own HTTP server by a plugin (`src/lib/server/ws-plugin.ts`),
which is why one command and one port are enough — and why match state survives client HMR.
A deployed build would run the same `Hub` from an `adapter-node` server; the prototype targets
`npm run dev`.

## Dev tools

```bash
node scripts/simulate.mjs          # headless: play a whole match over the real socket
node scripts/simulate.mjs --quiet  # just the run summaries and the result
```

Useful for checking the loop end to end and tuning bot difficulty without clicking.
`scripts/shot.mjs` drives a real browser for screenshots (needs `npm i --no-save playwright-core`).

## Checks

```bash
npm run check     # svelte-check
npm run lint      # prettier + eslint
npm run format
```

## Adding a map

`src/lib/engine/map-homeward.ts` is data: a list of levels, each with three labelled choices and
one marked `correct`. Death nodes and their epitaphs are generated from it, and
`src/lib/engine/tree.ts` lays any such map out automatically. Keep choice labels free of shared
words within a level — memory notes are matched by keyword.

## Scope

A prototype of the core loop. No auth, no database, no matchmaking, no chat, no progression
systems — the memory mechanic _is_ the progression system. Game state lives in memory and dies
with the dev server.
