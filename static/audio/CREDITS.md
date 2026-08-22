# Sound effects

Every file in this directory is **CC0 1.0 Universal (public domain)**, created and
distributed by **Kenney** — <https://kenney.nl>. Credit is not required by the
licence; it is given here anyway.

Nothing is fetched at runtime. The files are served from `static/`, which is the
same bargain `music.mp3` already makes: no third-party host gets to know who is
playing, and a match in a room with bad wifi still makes noise.

## Licence

Creative Commons Zero v1.0 Universal
<https://creativecommons.org/publicdomain/zero/1.0/>

> This content is free to use in personal, educational and commercial projects.

Verbatim licence text ships inside each pack as `License.txt`.

## Packs

| Pack | Version | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| Interface Sounds | 1.0 (11-02-2020) | <https://kenney.nl/assets/interface-sounds> | Kenney Vleugels (kenney.nl) | CC0 1.0 |
| RPG Audio | — | <https://kenney.nl/assets/rpg-audio> | Kenney Vleugels (kenney.nl) | CC0 1.0 |

## What is what

The cue name is the filename, and it is also the key in `FOR_EVENT` in
`src/lib/client/sound.ts`. To swap a sound, drop a replacement in under the same
name; nothing else needs to change.

| Cue | Played on | Original file | Pack |
| --- | --- | --- | --- |
| `player-joined` | `PLAYER_JOINED` | `Audio/confirmation_001.ogg` | Interface Sounds |
| `round-start` | `ROUND_STARTED` | `Audio/maximize_006.ogg` | Interface Sounds |
| `agent-survive` | `AGENT_SURVIVED` | `Audio/pluck_002.ogg` | Interface Sounds |
| `agent-died` | `AGENT_DIED` | `Audio/error_006.ogg` | Interface Sounds |
| `agent-home` | `AGENT_REACHED_HOME` | `Audio/glass_001.ogg` | Interface Sounds |
| `sabotage` | `SABOTAGE_USED` | `Audio/knifeSlice2.ogg` | RPG Audio |

## Two formats

Each cue ships twice, and both are the same sound:

- **`.ogg`** — Kenney's original file, copied and renamed, not re-encoded.
- **`.m4a`** — AAC, transcoded here with `ffmpeg -c:a aac -b:a 96k`.

The `.m4a` exists because this game is joined by pointing a phone at a QR code,
and Safari did not play Ogg Vorbis until iOS 17. `sound.ts` asks the browser
which one it can play, once, and uses that; a browser that claims neither simply
stays quiet. Every file is under 15 KB, so carrying both costs about 112 KB total
and saves the feature on every older iPhone at the table.

Transcode command, for whoever adds the next cue:

```sh
ffmpeg -v error -y -i cue.ogg -c:a aac -b:a 96k -movflags +faststart cue.m4a
```
