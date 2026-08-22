# Stories, and the database under them

How HOMEWARD went from one hand-written map to authored story graphs in SQLite, what was
questioned along the way, and what a second version could add.

---

## Why this changed

The prototype had two limits that were not going to be argued away.

**The map was one TypeScript file.** `src/lib/engine/map-homeward.ts` held eight levels of three
choices, exactly one correct choice per level, every wrong choice fatal. There was no way to author
anything else, and the _shape_ could not express a detour, a road that rejoins another, or a wrong
turn you survive. A tree cannot say "both of these roads get you to the mill".

**Match state lived in a `Map` and died with the process.** Editing anything under
`src/lib/server/` restarts the dev server, which took every match in progress with it.

So: a real story graph, a database, a designer, and a validator.

---

## The proposed schema, questioned

The starting point separated `node_templates` / `nodes` / `choices`, with `attributes` and two
join tables. That separation is sound and survived. Nine things did not.

### 1. `is_ending` and `ending_type` encoded the same fact twice

A boolean plus a nullable enum permits `is_ending = true, ending_type = NULL` and
`is_ending = false, ending_type = 'SUCCESS'`. Both are nonsense and both were representable.
`ending_type IS NOT NULL` **is** "this is an ending". The boolean is gone.

### 2. A `START` node type competed with `stories.start_node_id`

Two mechanisms for one fact drift apart the moment somebody edits one of them. The story row
designates the start; the node kind says what _kind of place_ it is.

### 3. `stories.start_node_id` ↔ `nodes.story_id` is a circular foreign key

Neither row can be inserted first, and SQLite has no deferrable constraints. So `start_node_id`
is **nullable**, set immediately after the first node exists, and required by the _validator_
rather than by the schema. This is a real limitation being handled, not a design preference.

### 4. `result_type` on a choice duplicated `ending_type` on a node — and could contradict it

This was the most consequential change. `FAILURE` on an edge means "the run ends here", but
whether the run ends is a property of **where you land**. Two sources of truth that can disagree:
an edge marked fatal pointing at a node that says the story continues.

**The node decides terminality; the edge decides flavour.** Arriving somewhere with an
`ending_type` ends the run, and `SUCCESS` wins. `choices.result` shrank to
`ADVANCE | DETOUR | SETBACK` — narrative colour, and nothing the engine cross-checks. The engine
reads `ending_type` and nothing else:

```ts
// src/lib/engine/game.ts
private outcomeOf(node: StoryNode): ChoiceOutcome {
  switch (node.endingType) {
    case 'SUCCESS': return 'win';
    case 'FAILURE': return 'death';
    case 'NEUTRAL': return 'end';
    default:        return 'continue';
  }
}
```

### 5. `attribute_node_types` was a table to hold four rows of static truth

A whole join table to say "_deep_ applies to LOCATION", against a fixed four-value enum. One
`applies_to` JSON column on `attributes` does it. Three tables became two.

And to be straight about it: **the engine ignores attributes entirely.** Titles are hand-written.
Attributes filter the designer's palette so it never offers "a wounded road", and that is all they
do in v1. Pretending otherwise would have been the wrong kind of tidy.

### 6. `order` is a reserved word in SQL

→ `sort_order`.

### 7. Cross-story edges were preventable _structurally_, not just by convention

Nothing in the original stopped a choice in story A pointing at a node in story B. Rather than a
trigger or an application check, `story_id` is denormalised onto `choices` and the foreign keys are
composite, against `UNIQUE (story_id, id)` on nodes:

```ts
foreignKey({ columns: [t.storyId, t.fromNodeId],
             foreignColumns: [nodes.storyId, nodes.id] }).onDelete('cascade'),
foreignKey({ columns: [t.storyId, t.toNodeId],
             foreignColumns: [nodes.storyId, nodes.id] }).onDelete('cascade'),
```

A choice now _cannot_ reference another story's node. Verified directly:

```
$ sqlite3 data/homeward.db "INSERT INTO choices (story_id, from_node_id, to_node_id, ...)"
ALLOWED   same-story edge A1 -> A2
rejected  cross-story edge A1 -> B1     (FOREIGN KEY constraint failed)
rejected  lying about the story id      (FOREIGN KEY constraint failed)
rejected  self-loop A1 -> A1            (CHECK)
rejected  duplicate label at A1         (UNIQUE)
rejected  bad result value              (CHECK)
rejected  21-char memory line           (CHECK)
```

### 8. `kind` belongs on the node, denormalised from the template

Deriving it through the template means a join for every filter, and makes a one-off node with no
template impossible. One copied column buys self-describing nodes.

### 9. The schema modelled only half the problem

It described _authoring_. There was nothing for matches, players, memory, runs or decisions — which
is precisely why state died on restart. That half is below, and it is the half that fixed the bug.

---

## Two problems the schema was fine but the _game_ was not

### Layout could not draw a graph

`layoutTree` walked one spine and hung deaths off it. It could not draw two roads into one place.
Positions are now **authored and persisted** as `x`/`y` on the node, because the drag-and-drop
designer has to store them anyway — so `tree.ts` was deleted rather than rewritten, and
`src/lib/engine/geometry.ts` draws edges for arbitrary graphs: downhill roads as before, sideways
and uphill roads bowed along the left normal (so `A → B` and `B → A` bow to opposite sides and read
as two roads), and a lobe for a road that returns to where it started.

### "Depth" stopped meaning anything

`map.depth` was used in eight places as a progress denominator. In a graph where routes differ in
length, and an agent can walk in a circle, _steps taken_ says nothing about getting anywhere.

Two replacements, both from the same reverse breadth-first search:

- **`parSteps`** — the shortest route from the start to a `SUCCESS` ending. The denominator.
- **`distanceHome[node]`** — steps from that node to the nearest `SUCCESS` ending.

Progress is **ground closed towards home**, `parSteps - distanceHome[here]`, and it only ever moves
up. A four-step detour back to where it started earns nothing, which is the honest reading, and a
cycle cannot inflate a score. Two agents that reach the same place by roads of different length are
level — asserted in `npm run check:graph`.

### Cycles had to terminate without lying

A graph that allows reconvergence allows `A → B → A`, and the agent walks by itself. Forbidding
cycles was the wrong call — "it walked in circles" is a good story. So each run has a
`stepBudget` (`max(20, parSteps * 3)`), and spending it is its own ending:

```ts
export type RunEnding = 'home' | 'died' | 'ended' | 'wandered';
```

`wandered` is deliberately _not_ a `ChoiceOutcome`. The last road the agent took was survivable —
it is standing on the far side of it. Recording that road as lethal would put a false mark in the
fog and teach every later round something untrue. `Game.wander()` ends the run and leaves the road
honest.

---

## The schema

`src/lib/db/schema.ts`. SQLite via Drizzle; enums are `text` with `CHECK` constraints.

### Authoring

```
stories          id · slug(unique) · name · description · locale
                 · start_node_id(null → nodes) · par_steps
                 · status(draft|published) · built_in · created_at · updated_at

node_templates   id · locale · kind(LOCATION|CREATURE|OBJECT|EVENT) · name
                 unique(locale, kind, name)

nodes            id · story_id→stories(cascade) · template_id(null)→node_templates
                 · kind · title · body · ending_type(null|SUCCESS|FAILURE|NEUTRAL)
                 · x · y · created_at · updated_at
                 unique(story_id, id)          ← enables the composite FK below

choices          id · story_id · from_node_id · to_node_id · label · consequence
                 · sort_order · result(ADVANCE|DETOUR|SETBACK)
                 FK (story_id, from_node_id) → nodes(story_id, id) cascade
                 FK (story_id, to_node_id)   → nodes(story_id, id) cascade
                 check(from_node_id <> to_node_id) · unique(from_node_id, label)

attributes       id · locale · name · applies_to(JSON kinds) · unique(locale, name)
node_attributes  node_id→nodes(cascade) · attribute_id→attributes(cascade) · pk(both)
```

`unique(from_node_id, label)` is not cosmetic: **the agent picks by label.** Two roads out of one
place sharing a name would be ambiguous to the model and to the offline brain alike.

`check(from_node_id <> to_node_id)` forbids a node pointing at _itself_, which is an authoring
slip. Longer cycles are allowed on purpose.

### Runtime — the half that fixed state loss

```
matches        id · code(unique) · story_id→stories · locale
               · phase(lobby|teaching|running|over) · round · teaching_ends_at
               · host_player_id · pace_scale · winner_ids(JSON) · last_summary(JSON)
               · previous_deaths(JSON) · started_at · created_at · updated_at

match_players  id · match_id→matches(cascade) · player_id · seat · name
               · is_bot · bot_skill · bot_sabotages · connected · ready
               · sabotage_used · was_sabotaged · sabotaged_this_round
               · current_node_id→nodes · status(idle|running|dead|home)
               · depth · best_depth · pending_grants · run_count
               unique(match_id, seat) · unique(match_id, player_id)

memory_lines   id · match_player_id→match_players(cascade) · position · line_id
               · text · written_on_round · sabotaged_by
               unique(match_player_id, position) · check(length(text) <= 20)

runs           id · match_player_id→match_players(cascade) · round · ended_at_node_id
               · ending(home|died|ended|wandered) · survived · depth_reached
               unique(match_player_id, round)
               check((ending = 'home') = survived)

decisions      id · run_id→runs(cascade) · step · from_node_id · choice_id→choices
               · reasoning · outcome · improvised · at_ms
               unique(run_id, step)

match_visited  match_id · node_id                  pk(both)
match_reveals  match_id · choice_id · outcome      pk(match_id, choice_id)
```

Three details worth naming:

**`check(length(text) <= 20)`** — the twenty-character rule now exists in three places: the input's
`maxlength`, `Game.addMemory`, and here. That is deliberate. It is the one rule the whole game
rests on, and the only one where a bypass would be invisible.

**`check((ending = 'home') = survived)`** — `survived` is derivable, and kept because most of the UI
reads it directly. A constraint stops the two disagreeing.

**`decisions.outcome` is recorded, not recomputed.** This is history. Editing a story afterwards
must not rewrite what already happened — the opposite call from `ending_type`, and for the opposite
reason.

**Fog of war is per match, not per player.** Discovery is public: watching a rival die in the
Volcano is how you learn about the Volcano, and that is the point of playing in rounds.

### In one line each

A **story** owns many **nodes**; a node's `kind` comes from an optional **template** (the palette).
A **choice** is a directed edge between two nodes _of the same story_, enforced by composite
foreign key. **Attributes** tag nodes for the designer only. A **match** plays one story; each
**match_player** owns ordered **memory_lines** and one **run** per round; each run owns ordered
**decisions**.

---

## A worked story

Eight nodes, showing every shape the old tree could not express. `→` is a choice; the label is
what the agent reads.

```
              ┌──────────────────┐
              │  The Three Ways  │  start
              └──┬────────┬───┬──┘
       Ford ──── ┘        │   └──── Ridge
         │           Forest │              │
         ▼                ▼                ▼
   ┌──────────┐    ┌────────────┐    ┌──────────┐
   │ The Ford │    │ The Hollow │    │ The Cairn│
   └────┬─────┘    └─────┬──────┘    └────┬─────┘
        │ Mill           │ Mill           │ Slip (SETBACK)
        └────────┬───────┘                └──────────┐
                 ▼                                   │
          ┌─────────────┐                            ▼
          │  The Mill   │ ◄────────── reconvergence: two roads, one place
          └──┬───────┬──┘
       Gate ─┘       └─ Weir
          │                │
          ▼                ▼
     ┌─────────┐     ┌──────────┐
     │The Gate │     │ The Weir │
     │ SUCCESS │     │ FAILURE  │
     └─────────┘     └──────────┘
```

- **Reconvergence**: `Ford → Mill` and `Hollow → Mill`. Par is 2 either way, so both roads leave
  an agent equally far along — impossible to say in a tree.
- **A setback**: `Cairn → Three Ways`, marked `SETBACK`. The agent survives it, because `Three
Ways` has no `ending_type`. It keeps the ground it had already closed.
- **A cycle**: `Three Ways → Cairn → Three Ways`. Legal. An agent with contradictory notes can
  walk it until its step budget runs out and end the run `wandered`.
- **Two endings**: `SUCCESS` at the Gate, `FAILURE` at the Weir.

Labels chosen so no two roads out of one place share a significant word: `Ford / Forest / Ridge`,
then `Gate / Weir`. `Ford` and `Forest` are fine — they are different words. `Lantern Road` and
`Ash Road` would not be, and the validator refuses them.

---

## The validator

`src/lib/engine/validate.ts`, run on publish and shown live in the designer. The schema stops a
story being _malformed_; this stops it being _unplayable_, which is a much easier mistake.

Errors block publishing:

| code                           | what it catches                                                        |
| ------------------------------ | ---------------------------------------------------------------------- |
| `keyword-collision`            | two roads out of one place share a significant word                    |
| `no-start` / `start-is-ending` | no opening, or the opening is also an ending                           |
| `no-home` / `home-unreachable` | nowhere to get to, or no road that gets there                          |
| `dead-end` / `one-way`         | a place with no way out, or only one (a choice of one is not a choice) |
| `ending-has-exits`             | a road leads out of an ending                                          |
| `unlabelled`                   | a road with no name — the agent picks by name                          |

Warnings do not block: `unreachable`, `no-way-home` (reachable, alive, and only wanderable),
`no-failure` (nothing to warn an agent about), `label-too-long` (its shortest distinctive word
eats the twenty characters), `label-not-distinctive`, `untitled`, `ending-silent`.

**`keyword-collision` is the rule that earns this file.** The offline brain matches a player's
twenty handwritten characters against the names of the roads in front of it. Two roads sharing a
word make one note fire for both; nothing looks broken, agents just quietly stop learning. It bit
the hand-written map during development — `Lantern Road` and `Ash Road` at one node, fixed by
renaming one to `Ashfall`.

The rule has exactly one definition, in `significantWords()`, shared by the validator and
`npm run check:languages`. Both shipped stories pass with zero errors and zero warnings.

---

## Deployment: SQLite on Fly.io

Yes, with one constraint this app already satisfies.

SQLite lives on a **Fly Volume** mounted at `/data`. A volume attaches to exactly **one machine**,
so the app must stay pinned to a single instance — two machines would each get their own diverging
database file.

That single-instance requirement is **not** imposed by SQLite. The WebSocket hub already has to be
the only process driving a match, because it holds the live round loops in memory. SQLite fits the
architecture rather than constraining it.

Volume snapshots are daily with short retention. If the data matters, add
[Litestream](https://litestream.io) for continuous replication to S3-compatible storage. Out of
scope for a prototype; worth knowing before anyone relies on it.

---

## What survives a restart, and what does not

`saveMatch` writes through at every point the clients are told something changed — the hub's
`broadcast` is the single choke point, so a new call site cannot forget to persist. The round's hot
loop stays in memory, where it belongs; only its _results_ are written. Roughly 2 ms per save, and
flat as a match gets longer: runs are immutable, so a watermark skips history that is already
stored.

Restored: the round number, every memory line and who corrupted it, who has spent their sabotage,
best depths, the whole fog, the last round's recap, and each rival's skill and disposition — so the
same opponents come back, not four strangers wearing their names.

**Not** restored: the round that was in flight. The turn loop lives on the runner's stack and is
not persisted, so a match comes back **between rounds** rather than halfway through somebody's
turn. Everyone gets the teaching window they were owed and play carries on. An agent left standing
in the middle of the land goes back to the start; it keeps its best depth.

A database failure is caught and logged, never fatal: the engine is authoritative in memory, so a
failed write costs a restart's worth of history and nothing that is happening now.

---

## What v2 could add

Everything below is deliberately absent. The memory mechanic is the progression system, and each of
these is a way to accidentally replace it.

**Conditional choices.** A `requires` expression on a choice — a `KEY` the agent picked up, or
having survived a particular node. The single biggest gain in expressiveness for the least schema:
one nullable column and an evaluator. It also turns the graph into a state machine and makes
"reachable" a much harder question for the validator, which is why it is not in v1.

**Inventory and player stats.** `run_items`, and objects that stay carried between rounds. The
`OBJECT` node kind is already in the palette waiting for it. The risk is real: the moment an agent
gets stronger by _doing_ rather than by being _taught_, the twenty characters stop being the whole
game.

**Attributes the engine reads.** They are metadata today. A `dark` place could suppress the choice
labels an agent sees; a `friendly` creature could offer a hint. This is the cheapest way to make
attributes load-bearing, and the easiest way to make a story unreadable.

**Weighted or procedural generation.** Templates plus attributes are already most of a generator:
pick a kind, pick a template, tag it, wire it up, run the validator. Worth doing only once hand-
authored stories have shown what a good one looks like.

**Multi-story campaigns.** A `campaigns` table ordering stories, with memory carried across.
Twenty characters that have to serve three stories is an interesting squeeze.

**Translated stories.** One story, one locale, by decision — see the note at the top of
`src/lib/i18n/types.ts`. Translating means duplicating a story, and `homeward-en` / `homeward-de`
are two rows. A `story_translations` table would let one graph carry both, but every label would
need its keyword collisions checked _per language_, and a half-translated story would be a story
where agents silently stop learning in one language.

**Authored par.** `par_steps` is measured, never typed. A designer might want to say "this should
take twelve steps" as a design target and be told when the graph disagrees.
