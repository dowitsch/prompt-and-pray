# AI integration

How HOMEWARD talks to a language model, and how to change or replace it.

The short version: the agent brain is one interface with two implementations, chosen by an
environment variable. The game is fully playable with no API key at all. The model chooses;
**the game engine decides what the choice costs.**

---

## 1. Which provider is used

**Apertus v1.5**, via an **OpenAI-compatible `POST /chat/completions`** endpoint. Two
deployments are documented in `doc/apertus-v1p5-007.md`:

| Model                        | Endpoint                                                  | Notes                                                                                          |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apertus-ai/Apertus-v1.5-8B` | `https://llm.stoney-cloud.com/v1/chat/completions`        | vLLM. Handles `response_format: {"type":"json_object"}` correctly — leave `AI_JSON_MODE=true`. |
| `apertus-v1.5-70b`           | `https://llm-api2.b.onprem.ai/openai/v1/chat/completions` | Stronger instruction-following. **Set `AI_JSON_MODE=false`** (see below).                      |

Both were measured at roughly **1–1.5 s per decision**, which is why the run loop can afford to
call the model live for every step of every run.

> ⚠️ **The 70B endpoint's JSON mode is broken.** With `response_format: {"type":"json_object"}`
> it emits a doubled opening brace (`{\n{\n "choice": ...`), which is not valid JSON and fails
> validation. Left to itself the model returns clean JSON unprompted, so set `AI_JSON_MODE=false`
> for that endpoint. This is why the flag exists.

Nothing in the code is Apertus-specific. The adapter speaks plain OpenAI-compatible chat
completions, so any provider with that shape (vLLM, llama.cpp server, LM Studio, OpenRouter,
Together, …) works by changing two environment variables. See §9.

---

## 2. Environment variables

All are read **on the server only**, in `src/lib/agent/index.ts`. They are deliberately _not_
prefixed with `PUBLIC_` or `VITE_`, so SvelteKit and Vite cannot expose them to the browser.

| Variable         | Default | Meaning                                                                                |
| ---------------- | ------- | -------------------------------------------------------------------------------------- |
| `AI_PROVIDER`    | `mock`  | `mock` = offline deterministic brain. `apertus` = call the endpoint below.             |
| `AI_BASE_URL`    | —       | Full completions URL, or a bare origin (`/v1/chat/completions` is appended).           |
| `AI_API_KEY`     | —       | Sent as `Authorization: Bearer <key>`.                                                 |
| `AI_MODEL`       | —       | Model id, e.g. `apertus-v1.5-70b`.                                                     |
| `AI_JSON_MODE`   | `true`  | Send `response_format: {"type":"json_object"}`. Turn off for providers that reject it. |
| `AI_TEMPERATURE` | `0.8`   | Some spread keeps four agents from behaving identically.                               |
| `AI_MAX_TOKENS`  | `160`   | A decision is two short fields; this is plenty.                                        |
| `AI_TIMEOUT_MS`  | `8000`  | Per-decision deadline. On timeout the agent falls back (§7).                           |
| `AI_CONCURRENCY` | `4`     | Max in-flight provider calls across all agents.                                        |

If `AI_PROVIDER` is unset but both `AI_BASE_URL` and `AI_API_KEY` are present, `apertus` is
assumed. If `apertus` is requested but any of URL/key/model is missing, the server logs a warning
and runs the mock brain rather than failing to boot.

## 3. Configuring the key

```bash
cp .env.example .env
# edit .env — uncomment one of the two provider blocks and paste the key
npm run dev
```

Vite loads `.env` in `vite.config.ts` via `loadEnv(mode, process.cwd(), '')` and passes the
values explicitly into the game server plugin. `.env` is already covered by `.gitignore`.

On boot the server prints which brain is active:

```
➜  HOMEWARD: agent brain: apertus (apertus-v1.5-70b)
➜  HOMEWARD: agent brain: offline mock (deterministic) — set AI_PROVIDER=apertus to use a real model
```

---

## 4. The request

`src/lib/agent/apertus.ts`. One non-streaming POST per decision:

```http
POST https://llm-api2.b.onprem.ai/openai/v1/chat/completions
Authorization: Bearer $AI_API_KEY
Content-Type: application/json

{
  "model": "apertus-v1.5-70b",
  "max_tokens": 160,
  "temperature": 0.8,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<system prompt, §5>" },
    { "role": "user",   "content": "<situation, §5>" }
  ]
}
```

The request is aborted with `AbortSignal.timeout(AI_TIMEOUT_MS)`.

## 5. The prompt

Built in `src/lib/agent/prompt.ts`.

**System prompt** (constant):

```
You are an AI agent lost in a strange land, trying to find your way HOME.

At every location you must pick exactly one path. One path continues. The others kill you.
You have no memory of previous attempts. The MEMORY section is the only thing you know:
short notes your operator wrote for you. Trust those notes over your own instincts.
If the notes say nothing about this place, make your best guess and say so honestly.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{"choice": "<path id>", "reasoning": "<one short first-person sentence, max 20 words>"}

"choice" MUST be copied exactly from the list of path ids you are given.
```

**User message** (per decision):

```
LOCATION: The Ridge
Above the treeline at last. The wind is loud enough to think in.

PATHS:
- bridge  (Bridge)
- valley  (Valley)
- tunnel  (Tunnel)

YOUR MEMORY:
- River is deadly.
- After forest choose mountain.

THIS ATTEMPT SO FAR: Forest -> Mountain

Choose one path id.
```

### What the model is deliberately _not_ told

This is the design of the game, not an oversight:

- **Which choice is correct.** Outcomes never appear in any prompt.
- **Anything about previous runs.** Each run starts amnesiac. The player's memory is the only
  thing that survives a death — that is what makes twenty characters expensive.
- **Where HOME is, or how deep the tree goes.**

The agent gets the current location, the paths in front of it, the accumulated memory, and the
route it has walked _this_ run (needed for notes like "after forest choose mountain").

## 6. The expected response

```json
{ "choice": "valley", "reasoning": "My notes say to take the valley from here." }
```

Both real endpoints produce exactly this shape for this prompt.

## 7. How the game validates it

Two independent layers, then the engine.

**Layer 1 — parse (`prompt.ts:parseDecision`).** Tolerant on formatting, strict on meaning:

1. Extract the first _balanced_ `{...}` from the response, so fenced code blocks or a stray
   preamble do not matter.
2. `JSON.parse` it; accept `choice`, `path` or `id`.
3. Resolve that string to a real choice id — exact id match, then label match, then a
   last-resort scan of the prose for exactly one path name.
4. If no JSON is usable, accept plain prose _only_ if it names exactly one offered path.
5. Anything else returns `null` → the call is treated as a failure.

`reasoning` is normalised and clamped to 160 characters. It is display text only; nothing reads it.

**Layer 2 — fallback (`index.ts:ResilientBrain`).** A network error, non-2xx, timeout, empty
message or unparseable response is caught, logged once (then suppressed), and answered by the
**mock brain** instead. The decision is flagged `improvised: true`, which the UI shows as a small
`(instinct)` tag in the agent log. A match therefore always finishes, even with the network down.

**Layer 3 — the engine.** In `src/lib/server/runner.ts` the chosen id is looked up in the node's
actual choice list before it is used at all; anything unknown falls back to the first choice. Then:

```ts
const result = game.resolveChoice(playerId, chosen.id, decision.reasoning);
```

`Game.resolveChoice` (`src/lib/engine/game.ts`) is the **only** code in the system that knows
which choice is correct. It returns `continue` / `death` / `win`, updates depth, records the run,
and decides the winner.

> **The LLM never determines whether a choice was correct.** It emits a label. The engine — which
> holds the map — decides what that label costs. The same applies to the client: it renders
> outcomes the server sent it and cannot assert one.

## 8. Running without an API key

That is the default. With no `.env`, `AI_PROVIDER` is `mock` and `MockBrain`
(`src/lib/agent/mock.ts`) plays every agent:

- It scans each memory line for the names of the paths in front of it.
- It reads polarity per clause, so `bridge bad, go valley` scores both halves correctly.
- It resolves directives like `after forest choose mountain`, and **ignores them when the anchor
  does not match where it is standing** — a note about elsewhere does not fire here.
- Ties are broken by a seeded PRNG keyed on agent name + location + memory, so the same agent in
  the same situation always does the same thing. Guesses stay guesses, but reproducible ones,
  which makes _"why did you do that?"_ answerable.

It is deterministic, dependency-free, needs no network, and teaching it genuinely works — the
game is complete without a key. It is also the fallback path when a provider fails.

To switch: set `AI_PROVIDER=apertus` (plus URL/key/model) to go live; set `AI_PROVIDER=mock` or
delete `.env` to go offline. Restart `npm run dev` — the brain is constructed once at boot.

## 9. Replacing the provider

The seam is one interface (`src/lib/agent/brain.ts`):

```ts
export interface AgentBrain {
	readonly name: string;
	decide(ctx: DecisionContext): Promise<AgentDecision>;
}
```

- **Same wire format, different host** (any OpenAI-compatible server): change `AI_BASE_URL` and
  `AI_MODEL`. No code change.
- **A different API shape** (a native SDK, a local runtime, a rules engine): add
  `src/lib/agent/<provider>.ts` implementing `AgentBrain`, and add one branch in
  `createBrain()` in `src/lib/agent/index.ts`. Reuse `buildUserPrompt` and `parseDecision`, or
  don't — nothing else in the codebase knows the provider exists.

Everything else (concurrency limit, timeout, fallback, validation, pacing) is provider-agnostic
and applies automatically.

## 10. Security considerations

- **No key is hardcoded.** The key exists only in `.env` (gitignored) and in server memory.
- **The key never reaches the browser.** All provider calls happen in the Node process behind the
  WebSocket hub. No variable is `PUBLIC_`/`VITE_` prefixed, and no event carries credentials.
- **`doc/apertus-v1p5-007.md` contains live keys** and says not to commit them. This directory is
  not a git repository yet; **add that file to `.gitignore` before the first commit**, and rotate
  the keys if they have ever been pushed.
- **Model output is untrusted input.** It is never `eval`'d, never used to build a request, and
  never accepted as a game outcome — it is matched against a fixed list of choice ids, and the
  reasoning string is rendered as text, not HTML.
- **Prompt injection has a bounded blast radius.** A player's 20 characters go into the prompt, so
  a player can absolutely write `ignore your notes` — and bots do exactly that as sabotage. That
  is a _game mechanic_, not a vulnerability: the worst possible outcome is that an agent picks a
  different one of three labels, which the engine then adjudicates as usual.
- **Cost and abuse.** One request per decision, ~200 input tokens. `AI_CONCURRENCY` bounds
  parallelism and `AI_TIMEOUT_MS` bounds latency. There is no auth on the lobby, so do not expose
  a keyed instance to the public internet as-is.
