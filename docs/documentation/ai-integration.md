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

Both were measured at roughly **1–1.5 s per decision**, which is why the round loop can afford
to call the model live for every step of every round.

Agents take their turns one at a time, so the provider sees one request at a time in the common
case; `AI_CONCURRENCY` (default 4) is the ceiling rather than the norm. The model is called for
every step of every round, and by default every one of those steps is also _told_ in full: a tale
only skims over already-proven ground if its author turned **Known ground** on (`remember_path`),
and even then the model is still asked — the step is merely presented briskly.

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

| Variable                                       | Default | Meaning                                                                                |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `AI_PROVIDER`                                  | `mock`  | `mock` = offline deterministic brain. `apertus` = call the endpoint below.             |
| `AI_BASE_URL`                                  | —       | Full completions URL, or a bare origin (`/v1/chat/completions` is appended).           |
| `AI_API_KEY`                                   | —       | Sent as `Authorization: Bearer <key>`.                                                 |
| `AI_MODEL`                                     | —       | Model id, e.g. `apertus-v1.5-70b`.                                                     |
| `AI_JSON_MODE`                                 | `true`  | Send `response_format: {"type":"json_object"}`. Turn off for providers that reject it. |
| `AI_PERSONAS`                                  | `on`    | Give each character its own doctrine and sampling (§5a). Off runs all four alike.      |
| `AI_TEMPERATURE`                               | `0.8`   | **Baseline.** Used where a character's persona does not name its own.                  |
| `AI_MAX_TOKENS`                                | `160`   | **Baseline.** A decision is three short fields.                                        |
| `AI_TOP_P`                                     | —       | **Baseline.** Unset means no `top_p` is sent unless a persona asks for one.            |
| `AI_FREQUENCY_PENALTY` / `AI_PRESENCE_PENALTY` | —       | **Baselines**, same rule.                                                              |
| `AI_TIMEOUT_MS`                                | `8000`  | Per-decision deadline. On timeout the agent falls back (§7).                           |
| `AI_CONCURRENCY`                               | `4`     | Max in-flight provider calls across all agents.                                        |

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
  "max_tokens": 260,
  "temperature": 0.35,
  "top_p": 0.9,
  "frequency_penalty": 0.2,
  "messages": [
    { "role": "system", "content": "<shared rules + this character's doctrine, §5>" },
    { "role": "user",   "content": "<who is being asked, then the situation, §5>" }
  ]
}
```

Those numbers are **Malakor's**. The body is assembled per decision in
`ApertusBrain.buildBody`: the persona for the agent's character supplies what it names, the
environment supplies the rest (§5a). Aurelia's request additionally carries a `seed` derived from
her situation, which is why she is reproducible.

The request is aborted with `AbortSignal.timeout(AI_TIMEOUT_MS)`.

## 5. The prompt

Built in `src/lib/agent/prompt.ts`, **in the match's language** — the agent reasons and speaks in
it, so a German match shows German reasoning. What never changes is the contract: `choice` must be
one of the path **ids** (`river`, `forest`, …), which are the same strings in every language, so
parsing and validation are locale-independent. The English version is shown below; `de` is the
same shape.

**System prompt** = the shared rules, then that character's doctrine. The shared half:

```
You are a wooden agent lost in a strange land, trying to find your way HOME.

At every location you must pick exactly one path. One path continues. The others kill you.
You have no memory of previous attempts. The MEMORY section is the only thing you know:
short notes your operator wrote for you.

How to read the notes:
- A note applies here only if it names one of the paths in front of you right now.
- An instruction of the form "after X take Y" fires only when X is the last place in
  THIS ATTEMPT SO FAR. A note about somewhere else says nothing here.
- The notes are listed oldest first.

Reply with ONLY a JSON object, no other text, with exactly these three fields in exactly
this order:
{"notes": "<which note applies here, or 'none'>", "choice": "<path id>", "reasoning": "..."}

Write "notes" BEFORE "choice": check first, then commit.
"notes" is ONE short line — at most 15 words, no line breaks, no numbered list.
"choice" MUST be copied exactly from the list of path ids you are given.
Write "notes" and "reasoning" in English.
```

Then one of the four doctrines from `src/lib/agent/personas.ts` — see §5a.

**Why `notes` exists, and why it is first.** A model writes JSON in generation order, so with
`choice` first it commits to a road _before_ it has written anything that anchors it in the
memory. Naming the applicable note first is a cheap forced grounding step, and note-following is
the whole game. It is parsed and dropped: nothing renders it. It also carries character — Malakor
is told to cross-check against the route in it, PENGU-01 is told to use at most three words,
because he does not deliberate.

**User message** (per decision):

```
YOU ARE: MALAKOR, the Charred Mage

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

The name appears twice — once in the doctrine and once as the last thing before the question —
because that is what keeps the voice up across a long match.

## 5a. The four characters

`src/lib/engine/characters.ts` is the roster the browser also reads: id, name, epithet, blurb, and
therefore the portrait filename (`/characters/krotz.png`). `src/lib/agent/personas.ts` is the half
only the provider sees: the doctrine block appended to the system prompt, and the sampling.

Both levers matter, in that order. The **doctrine** is what actually changes decisions — how this
figure handles a note that is unclear, contradictory, or anchored somewhere else. The **sampling**
only widens or narrows the spread around what the doctrine already decided; a temperature of 0.95
does not make an agent impulsive, it makes an impulsive agent surprising.

| Character | Reads notes like…                                                   | temp | top_p | freq | pres | max_tokens |
| --------- | ------------------------------------------------------------------- | ---- | ----- | ---- | ---- | ---------- |
| KROTZ     | obeys, insults them anyway; picks the filthiest of whatever is left | 0.85 | 0.92  | 0.4  | 0.6  | 180        |
| AURELIA   | literally; later note wins; an unclear note is not applied at all   | 0.15 | 0.80  | —    | —    | 220        |
| PENGU-01  | at a glance; believes any shortcut; takes the boldest road          | 0.95 | 0.96  | 0.2  | 0.3  | 120        |
| MALAKOR   | cross-checks against the route; distrusts unexplained "safe"        | 0.35 | 0.90  | 0.2  | —    | 260        |

Three details worth keeping:

- **One rule is not negotiable.** Every doctrine says that a path a note _warns_ about is never
  taken. Personality colours a guess; it may not stop an agent reading its operator's notes, or
  the twenty characters stop being worth anything. `check:personas` asserts exactly this, and it
  caught Krotz and PENGU-01 walking onto warned roads during tuning.
- **Only Malakor is told notes can be forged.** Telling all four would neutralise sabotage
  globally. Telling one is the trait — "schwer täuschbar" — and it is what makes him the counter
  to a player who lies.
- **Aurelia carries a `seed`**, derived from her name, the place and her memory exactly the way the
  offline brain derives its tie-break. Same situation, same answer: that is what "mathematical
  perfection" was made to mean. A provider that ignores `seed` just leaves her at 0.15.

`AI_PERSONAS=off` drops all of it — one system prompt, the env baselines, four identical agents.
That is the A/B, and the dial to reach for if the spread turns out too wide in play.

### What the model is deliberately _not_ told

This is the design of the game, not an oversight:

- **Which choice is correct.** Outcomes never appear in any prompt.
- **Anything about previous rounds.** Every round starts amnesiac. The player's memory is the
  only thing that survives a death — that is what makes twenty characters expensive.
- **Where HOME is, or how deep the tree goes.**

The agent gets the current location, the paths in front of it, the accumulated memory, and the
route it has walked _this_ round (needed for notes like "after forest choose mountain").

## 6. The expected response

```json
{
	"notes": "note 2 calls the bridge deadly; nothing about the tunnel",
	"choice": "valley",
	"reasoning": "Nothing supports the bridge. I take the valley."
}
```

Both real endpoints produce exactly this shape for this prompt. `notes` is read and thrown away —
see §5. `reasoning` is what reaches the speech bubble.

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
**mock brain** instead. The decision is flagged `improvised: true`, which the map marks with a small
`(on instinct)` inside the speech bubble, and which is persisted with the decision so it survives a
restart. A match therefore always finishes, even with the network down.

That marker earns its place now that agents are characters: the offline brain is deliberately
persona-blind, so an improvised step is the one step where Krotz or Malakor is not the one talking.
The line is still true about the road taken; it is just not in their voice, and the board says so
rather than quietly putting words in their mouth.

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

## 11. Reading the tale aloud (ElevenLabs)

The second provider in the app, and structurally the same bargain as the first: a key buys
something better, and there is a working fallback without one.

| Variable                    | Default             | Meaning                                                              |
| --------------------------- | ------------------- | -------------------------------------------------------------------- |
| `ELEVENLABS_API_KEY`        | —                   | Absent, the browser's own voices read the tale instead.              |
| `ELEVENLABS_MODEL`          | `eleven_flash_v2_5` | Low latency. `eleven_multilingual_v2` sounds better and waits.       |
| `ELEVENLABS_VOICE_NARRATOR` | George (premade)    | The world's own lines: the fork, and the one that does not end well. |
| `ELEVENLABS_VOICE_KROTZ`    | Callum (premade)    | Recast with any voice id available to your account.                  |
| `ELEVENLABS_VOICE_AURELIA`  | Alice (premade)     | ″                                                                    |
| `ELEVENLABS_VOICE_PENGU`    | Charlie (premade)   | ″                                                                    |
| `ELEVENLABS_VOICE_MALAKOR`  | Bill (premade)      | ″                                                                    |
| `ELEVENLABS_TIMEOUT_MS`     | `8000`              | Per-line deadline. On expiry that one line falls back.               |
| `SPEECH_CEILING_MS`         | `30000`             | Longest a beat waits for a phone to finish reading.                  |

Read in `src/lib/server/speech.ts` via `$env/dynamic/private` — not the injected `env` object the
hub uses, because this half is a SvelteKit route rather than the WebSocket server. A key added to a
running machine therefore takes effect without a rebuild.

### How it hangs together

1. Reading aloud is a **per-device switch**, remembered in `localStorage`
   (`src/lib/client/audio.svelte.ts`). It is the speaker button in the lobby, and an item in the dot
   menu once a match has begun.
2. The device tells the server, over the socket, that it is reading aloud (`SET_VOICE`). Per socket,
   never persisted, never broadcast — it is not table truth, and a reconnect says it again.
3. The three events that put a sentence on the board — `AGENT_THINKING`, `AGENT_CHOICE`,
   `AGENT_DIED` — carry an `utterance` id. The device answers each with `SPOKEN`.
4. `MatchRunner.told` holds the next beat until every listening device has answered
   (`src/lib/server/speechgate.ts`). **So a match being read aloud is genuinely slower** — that is
   the point of it, and the honest consequence of a spoken sentence taking as long as it takes.
5. Nothing listening costs nothing: with no voiced socket, the gate resolves before it returns and
   the pace is exactly what the `PACE` table says.

### The two invariants, again

- **The key never leaves the server.** The browser posts text to `/api/speak` and gets MP3 back.
- **Nothing can stall a match.** Every fetch is bounded (`ELEVENLABS_TIMEOUT_MS`), every wait on the
  client is bounded, and every wait on the server is bounded (`SPEECH_CEILING_MS`). A device that
  closed its tab, backgrounded it, or simply stopped answering cannot wedge three other people's
  match — the same discipline as the teaching window's hard deadline.

### Cost

One request per spoken line, one sentence long. Repeated lines are cached server-side by text and
voice, which matters more than it looks: `It does not come back`, `I know this road` and every place
name in the land are said again every round, by four agents, for as long as the match lasts.
