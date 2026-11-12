# Inhalte bearbeiten

Alle Inhalte der Seite stehen in **`roadmap.json`**: Säulen, Stufen, Themen, Drillpläne, Videos, Symptome.
Du brauchst keinen Code anzufassen. Datei öffnen, Text ändern, speichern, hochladen. Fertig.

Am einfachsten geht das direkt auf GitHub: Datei anklicken, oben rechts auf den Stift, ändern, unten **Commit changes**. Nach ca. einer Minute ist die Seite aktuell.

> **Drei Regeln, damit nichts kaputtgeht**
> 1. Texte stehen immer in `"Anführungszeichen"`. Brauchst du im Text selbst welche, nimm „deutsche“ Anführungszeichen.
> 2. Zwischen zwei Einträgen steht ein Komma, nach dem letzten Eintrag einer Liste **keins**.
> 3. Eine `id` nie ändern, wenn schon Status oder Notizen daran hängen. Sonst sind die weg.
>
> Unsicher? Kopier den Inhalt in [jsonlint.com](https://jsonlint.com), das zeigt dir Fehler mit Zeilennummer.

`progress.json` fasst du nicht an. Da schreibt die Seite selbst rein (Status, Notizen, Hook-Änderungen, Selbsteinschätzung).

---

## Aufbau von `roadmap.json`

```text
{
  "pillars":  [ … ],   die 5 Säulen (Spalten der Ringkarte)
  "stages":   [ … ],   die 3 Stufen (Zeilen)
  "formats":  { … },   Video-Formate mit Erklärung
  "levels":   [ … ],   Texte für die Selbsteinschätzung 1–5
  "topics":   [ … ],   die Themen, jedes mit Drillplan und Videos
  "symptoms": [ … ]    die Chips im Problem-Finder
}
```

### Thema (`topics`)

| Feld | Pflicht | Was |
|---|---|---|
| `id` | ja | Kurzer Name ohne Leerzeichen und Umlaute, z. B. `"headmovement"`. Wird auch in Links benutzt: `drill.html#headmovement` |
| `pillar` | ja | Säule: `technik`, `kraft`, `ausdauer`, `mental` oder `regen` |
| `stage` | ja | Stufe als Zahl: `1`, `2` oder `3` |
| `title` | ja | Name auf der Karte |
| `desc` | ja | Ein, zwei Sätze Beschreibung |
| `keys` | ja | Liste: „Worauf es ankommt“ |
| `signs` | ja | Liste: „Daran merkst du, dass es fehlt“ (durchsucht die Suche mit) |
| `videos` | ja | Liste von Videos, siehe unten (darf `[]` sein) |
| `drill` | nein | Drillplan, siehe unten |

### Video (in `topics[].videos`)

```json
{ "id": "headmovement-3", "title": "Slip-Konter in Zeitlupe", "format": "Short", "hook": "So sieht ein Slip aus, wenn er richtig sitzt." }
```

- `id`: einmalig. Am besten `themen-id` + Bindestrich + nächste freie Nummer.
- `format`: `Short`, `Video` oder `Serie` (neue Formate oben unter `formats` ergänzen).
- `hook`: der erste Satz. Kannst du auch später in der Seite ändern.

Datum, Link, Status und Notizen trägst du **in der Seite** ein, nicht hier.

### Drillplan (in `topics[].drill`)

```json
"drill": {
  "status": "entwurf",
  "goal": "Den Kopf automatisch aus der Linie nehmen und direkt kontern",
  "freq": "3× pro Woche",
  "perWeek": 3,
  "dur": "ca. 45 Min.",
  "exercises": [ … ],
  "check": "Sparring filmen: Bewegst du nach jeder eigenen Kombination den Kopf?"
}
```

| Feld | Was |
|---|---|
| `status` | `"entwurf"` zeigt „Entwurf · von Daniel prüfen“. Wenn du den Plan abgenickt hast: `"geprueft"` |
| `goal` | Ziel in einem Satz |
| `freq` | Wie oft, als Text |
| `perWeek` | Wie oft pro Woche als Zahl. Der Wochenplan im Problem-Finder nutzt das als Obergrenze. `5` oder mehr heißt „täglich“, `null` heißt „nach Bedarf“ (z. B. Kampfwoche) |
| `dur` | Dauer als Text. Die Drillplan-Seite rechnet die Timer-Zeit zusätzlich selbst aus |
| `exercises` | 3–5 Übungen, siehe unten |
| `check` | Woran du merkst, dass es besser wird |

### Übung (in `drill.exercises`)

Es gibt drei Arten. Der Timer erkennt sie automatisch.

**1. Auf Zeit** (Runden, Intervalle): `work` und `rest` in **Sekunden**.

```json
{ "name": "Schnurdrill", "rounds": 3, "work": 180, "rest": 60, "note": "Knie beugen, nicht den Rücken." }
```
Wird angezeigt als „3 × 3 min · 1 min Pause“. Der Timer zählt runter, Glocke am Ende jeder Runde.

**2. Nach Wiederholungen** (Kraft): `reps` statt `work`.

```json
{ "name": "Kniebeuge", "rounds": 4, "reps": "5 Wdh.", "rest": 120, "note": "Zwei Wiederholungen im Tank lassen." }
```
Wird „4 × 5 Wdh. · 2 min Pause“. Du tippst „Satz fertig“, dann läuft die Pause automatisch.

**3. Aufgabe ohne Uhr**: nur `label`.

```json
{ "name": "Wiegen planen", "label": "Einmalig", "note": "Uhrzeit, Zielgewicht, Essen vorher aufschreiben." }
```

Optional bei allen: `label` überschreibt den automatischen Text, z. B. `"label": "4 Durchgänge · 4-4-4-4 s"`.

Gut zu wissen: Zwischen zwei Übungen auf Zeit ohne eigene Pause legt der Timer 15 s Wechselzeit ein. Vor der ersten Runde gibt es 10 s zum Fertigmachen.

### Symptom (`symptoms`)

```json
{ "id": "kopf", "text": "Ich werde oft am Kopf getroffen", "topics": ["headmovement", "defense", "stand"] }
```

- `topics`: Themen-IDs, **das wichtigste zuerst**. Das erste zählt im Wochenplan dreifach, das zweite doppelt, alle weiteren einfach.
- Die ersten 10 Symptome sind sofort sichtbar, der Rest hinter „Alle … Probleme zeigen“. Die häufigsten also nach oben.

---

## Wie der Wochenplan entsteht

1. Jedes angetippte Problem gibt seinen Themen Punkte (3 / 2 / 1).
2. Hast du dich bei einem dieser Themen schwach eingeschätzt, gibt's Extrapunkte.
3. Ohne angetippte Probleme nimmt er einfach deine schwächsten Themen (Stufe 1–3).
4. Die Top 3 mit Drillplan landen in der Woche: 3×, 2×, 1×, aber nie öfter als `perWeek`. Verteilt auf Mo–Sa, Sonntag ist frei.
