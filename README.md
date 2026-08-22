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

Every step is a decision the agent argues out loud, however many times the same crossroads comes
round. A tale may instead let familiar ground be hurried over — replayed briskly and collapsed
into a single "walks the road it knows" line — but that is off in every tale until its author
turns **Known ground** on in the workshop.

The telling is paced for reading. If it is still too fast or too slow, set `PACE_SCALE` in
`.env` — `1.5` for a leisurely read-aloud pace, `0.6` for brisk — and restart.

**You never control your agent.** Between rounds everyone gets exactly **20 characters** to add
to their agent's memory — and that memory is the only thing it carries into the next round.
Once per match you may overwrite one line of an opponent's memory.

> "I cannot control my AI. I can only teach it."

## Languages

English and German. The host picks the language when creating a tale, and it applies to the whole
match — the map's place names, the agents' reasoning, the round headlines and every label.

That is deliberate rather than a shortcut: players write their agent's memory by hand, and the
agent decides by matching those notes against the names of the paths in front of it. If one player
saw "Forest" and another "Wald", they could not read each other's notes and the matching would
break. One match, one language.

Adding a third means four things: a dictionary in `src/lib/i18n/`, the map's text in
`src/lib/engine/map-homeward.ts`, a vocabulary in `src/lib/agent/vocabulary.ts` (the words the
offline brain reads notes with), and a prompt in `src/lib/agent/prompt.ts`. Then:

```bash
npm run check:languages
```

which is the check that matters — it verifies notes actually steer agents in each language, and
that no two paths at the same level share a word.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

That's the whole setup. No API key, no second process, and no database step — the schema is
migrated and the built-in stories seeded on boot. Create a game, press **START**, and the three
empty seats fill with simulated agents so one browser tab is enough.

To play with a real LLM instead of the offline brain, copy `.env.example` to `.env` and fill in
one of the Apertus blocks. See **[docs/ai-integration.md](docs/ai-integration.md)** for the
provider, the prompt, the response contract, validation, and how to swap providers.

## How it fits together

Three layers, deliberately separated:

| Layer  | Path                                 | Responsibility                                                                                                                            |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Engine | `src/lib/engine/`                    | Pure TypeScript. The story graph, the rules, and the **only** code that knows where each road leads. No Svelte, no I/O, no `Math.random`. |
| Data   | `src/lib/db/`                        | Drizzle + SQLite. Authored stories, and match state written through so a restart costs nothing.                                           |
| Server | `src/lib/server/`                    | Authoritative. Live matches, the round loop, bots, and the WebSocket hub.                                                                 |
| Client | `src/lib/components/`, `src/routes/` | Svelte 5 runes. Renders events and sends requests; decides nothing.                                                                       |

The client never receives the map — only a **fogged** view of it (`src/lib/engine/fog.ts`).
Node names and lethality arrive as agents discover them, so the solution is not in the browser
bundle. Whether a choice is correct, whether an agent died, who won, and whether a sabotage is
legal are all decided server-side and broadcast as events (`AGENT_THINKING`, `AGENT_DIED`,
`SABOTAGE_USED`, …).

WebSockets are mounted onto Vite's own HTTP server by a plugin (`src/lib/server/ws-plugin.ts`),
which is why one command and one port are enough. `server.ts` mounts the same `Hub` on an
`adapter-node` build for production, so dev and deploy cannot drift apart.

A round's hot loop runs in memory, where it belongs, but its results are written through to
SQLite at every event, so **a restart no longer costs anyone their match**. Editing anything
under `src/lib/server/` still restarts the dev server; the match comes back between rounds
rather than mid-turn. See _What survives a restart_ in
[docs/story-schema.md](docs/story-schema.md).

## Dev tools

```bash
node scripts/simulate.mjs          # headless: play a whole match over the real socket
node scripts/simulate.mjs --quiet  # just the round recaps and the result
```

Useful for checking the loop end to end and tuning bot difficulty without clicking.
`scripts/shot.mjs` and `scripts/shot-design.mjs` drive a real browser through the game and the
designer respectively (both need `npm i --no-save playwright-core`).

## Checks

```bash
npm run check            # svelte-check
npm run lint             # prettier + eslint
npm run check:languages  # the offline brain still learns, in every language
npm run check:graph      # the graph engine and the publish validator
npm run format
```

`check:languages` and `check:graph` are the two that catch a broken _game_ rather than broken
code: the first that a player's handwritten notes still reach the agent in both languages, the
second that reconvergence, setbacks, cycles and the validator's rules all behave.

## Writing a story

```bash
npm run dev
# then http://localhost:5173/design
```

Drag places onto the map, drag from a place's rim to another to lay a road, and mark where a run
ends. The validator runs as you build and blocks publishing until the story is playable — the
rule it earns its place with is the **keyword collision**: two roads out of one place may not
share a word, or one twenty-character note names both and agents quietly stop learning.

The schema, the reasoning behind it, and a worked example are in
**[docs/story-schema.md](docs/story-schema.md)**.

> The designer shows every answer and there is no login, so it is on in development and **off in
> production** unless you set `DESIGNER=on`. Turn it on for an instance you author on; leave it
> off for one people play on.

## Deploying

`fly.toml`, a two-stage `Dockerfile`, and `server.ts` are set up for Fly.io:

```bash
fly volumes create homeward_data --region fra --size 1
fly deploy --ha=false          # ONE machine: see the note in fly.toml
```

Two constraints, both already true of the architecture: **one machine only** (the hub holds live
matches in memory, and a Fly volume attaches to a single machine anyway), and the database lives
on that volume at `/data`. Volume snapshots are daily with short retention — add Litestream if
the data starts to matter.

## Scope

A prototype of the core loop. No auth, no matchmaking, no chat, no inventory, no stats, no
progression systems — the memory mechanic _is_ the progression system. Extensions worth
considering, and why each was left out, are listed at the end of
[docs/story-schema.md](docs/story-schema.md).
