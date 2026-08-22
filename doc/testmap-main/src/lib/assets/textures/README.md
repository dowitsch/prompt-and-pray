# Untergrundtexturen

Dateien hier ablegen — sie werden von Vite gebündelt und beim Start automatisch geladen. Fehlende Dateien sind in Ordnung:
für jede nicht vorhandene Textur fällt der Renderer auf den bisherigen Farbwert des Bioms zurück.
Es braucht also keine vollständige Lieferung und keine Codeänderung, wenn eine dazukommt.

Erkannt werden `.png`, `.jpg`, `.jpeg`, `.webp`. Die Zuordnung läuft über den Dateinamen
(Gross-/Kleinschreibung egal), mit Synonymen: `grass`/`gras`/`wiese` → Gras, `berge`/`fels`/`gebirge`
→ Fels, `wueste`/`sand` → Sand.

## Aktuell geliefert

`grass`, `wald`, `wueste`, `Berge`, `schnee`, `wasser` — je 1254×1254 RGB. Alle sechs wurden auf
Kachelbarkeit geprüft: Randabstand 4–10 von 255, also echt nahtlos. Keine Spiegelung nötig.

## Pflicht

| Datei | ersetzt | wo man sie sieht |
|---|---|---|
| `gras` | Wiese, Seenland | die beiden häufigsten Biome |
| `wald` | Wald | dichtes Kronendach von oben |
| `sand` | Wüste (Tiefland und Hochland) | Wüste |
| `fels` | Berge **und das Hochland aller anderen Biome** | Gebirge, hohe Lagen |
| `schnee` | Schneebiom, Gipfel der Berge | Schnee |
| `wasser` | Seen, Flüsse, Meer | alles Wasser |

## Optional

| Datei | wofür |
|---|---|
| `pergament` | Grundfläche für Biome, deren Textur noch fehlt |
| `meer` | offenes Meer eigenständig statt getönter Wassertextur |
| `papierkorn` | grau; wird über das Land multipliziert und ersetzt das gerechnete Korn |

## Anforderungen

**1024 × 1024.** Ein Texturpixel wird auf genau ein Kartentexel abgebildet — das ist die schärfste
Variante, ohne Skalierungsunschärfe. Bei 1024² deckt eine Kachel damit 819 Weltunits ab, rund 1,9
Kartenabschnitte; die Wiederholung liegt also außerhalb dessen, was man auf einmal sieht. Bei 512²
wäre sie im Bild.

**Kachelbar.** Links passt an rechts, oben an unten. Wird beim Laden automatisch geprüft: passen die
Ränder nicht zusammen, schaltet die Textur auf gespiegeltes Kacheln um. Das ist immer nahtlos, hat
aber eine Spiegelachse — besser also echt kachelbar liefern.

**Flaches Licht.** Kein eingebackener Schattenwurf, keine Vignette, kein einzelnes großes Motiv.
Sonst liest man die Wiederholung als Muster, egal wie gut die Naht ist.

**Ein Stil über alle.** Gleiche Sättigung und Körnung, sonst fallen die Biomübergänge auseinander.

Beim Wasser gilt eine Ausnahme: dort liefert die Textur nur die *Struktur*, die Farbe kommt weiter
vom Biom. Andernfalls gingen das Oasen-Türkis der Wüste und das Eisblau des Schneebioms verloren.
