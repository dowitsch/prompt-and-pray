# HOMEWARD

A competitive AI-agent game. Four agents race through a hidden decision tree to reach HOME.
Every level offers three paths; exactly one continues, the other two kill the agent.

Matches are **round-based**, and within a round the agents take their turns **one at a time**.
Each turn is told as a handful of short sentences, revealed one after another:

> **KESTREL sets out.**
> _It carries four lines. One of them is false._
> It comes to The Ridge.
> Bridge, Valley or Tunnel?
> _"My notes rule out the bridge. That leaves the valley."_
> It takes the Valley.
> **No one has ever come this far.**

While an agent walks, the page beside it shows **what that agent carries** — its memory, with any
line someone corrupted struck out and attributed. Watching a rival act on a lie you planted is the
best moment in the game.

Ground the world has already proven safe is replayed briskly and collapsed into a single line,
so the pace only lingers where something new actually happens.

The telling is paced for reading. If it is still too fast or too slow, set `PACE_SCALE` in
`.env` — `1.5` for a leisurely read-aloud pace, `0.6` for brisk — and restart.

**You never control your agent.** Between rounds everyone gets exactly **20 characters** to add
to their agent's memory — and that memory is the only thing it carries into the next round.
Once per match you may overwrite one line of an opponent's memory.

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
| Server | `src/lib/server/`                    | Authoritative. In-memory games, the lockstep round loop, bots, and the WebSocket hub.                                               |
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

> Note: because `vite.config.ts` imports the hub, editing anything under `src/lib/server/`
> restarts the dev server and drops any match in progress. Edit between matches.

## Dev tools

```bash
node scripts/simulate.mjs          # headless: play a whole match over the real socket
node scripts/simulate.mjs --quiet  # just the round recaps and the result
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
