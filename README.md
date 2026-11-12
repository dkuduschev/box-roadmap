# Box-Roadmap: Vom Anfänger zum Boxer

Trainingskarte, Drillpläne mit Rundentimer und Redaktionsplan in einem. Eine statische Seite ohne Build-Schritt und ohne laufende Kosten.

| Datei | Was |
|---|---|
| `index.html` | Roadmap, Problem-Finder, Content-Plan |
| `drill.html#<themen-id>` | Drillplan mit Rundentimer, druckbar |
| `data/roadmap.json` | **Alle Inhalte.** Hier ergänzt du Themen, Drills, Videos, Symptome. Anleitung: [`data/README.md`](data/README.md) |
| `data/progress.json` | Dein Stand (Status, Notizen, Einschätzung). Schreibt die Seite selbst |
| `assets/` | Code und Styles |
| `box-roadmap.html` | Alte Version, kann weg, sobald die neue läuft |

## Online stellen mit GitHub Pages (einmalig, ca. 10 Minuten)

1. Auf [github.com](https://github.com) ein neues Repository anlegen, z. B. `box-roadmap`.
   Bei einem kostenlosen Konto muss es **öffentlich** sein, damit Pages funktioniert (siehe Hinweis unten).
2. **Add file → Upload files**, den ganzen Ordnerinhalt reinziehen (inklusive `data/` und `assets/`), **Commit changes**.
3. **Settings → Pages → Build and deployment**: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`, **Save**.
4. Nach 1–2 Minuten läuft die Seite unter `https://DEIN-NAME.github.io/box-roadmap/`. Auf dem Handy: Teilen → „Zum Home-Bildschirm“.

## Speichern einrichten (pro Gerät einmal)

Ohne diesen Schritt bleibt dein Stand nur im jeweiligen Browser.

1. GitHub → Profilbild → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name z. B. „Box-Roadmap“, Ablauf nach Wunsch (max. 1 Jahr).
   **Repository access:** „Only select repositories“ → dein `box-roadmap`.
   **Permissions → Repository permissions → Contents: Read and write.** Sonst nichts.
3. Token kopieren, auf der Seite oben rechts auf **„Nur auf diesem Gerät“** tippen, Token einfügen, **Verbinden & speichern**.
   Name und Repo sind auf GitHub Pages schon vorausgefüllt.

Danach geht jede Änderung ein paar Sekunden später als Commit in `data/progress.json`. Ändern Handy und Laptop gleichzeitig etwas, wird zusammengeführt: Pro Video und Thema gewinnt die neuere Änderung.

**Hinweis Sichtbarkeit:** Bei einem öffentlichen Repo kann jeder `progress.json` lesen, also auch deine Notizen und Einschätzungen. Wenn das nicht okay ist: Repo privat machen und die Seite über Netlify hosten (kostenlos, verbindet sich mit dem privaten Repo). Das Speichern über den Token funktioniert dort genauso, du trägst Name und Repo dann von Hand ein.

**Backup:** Im selben Dialog kannst du `progress.json` herunterladen und wieder einspielen, auch ganz ohne GitHub.

## Lokal ansehen

Die Seite lädt `data/roadmap.json` per `fetch`. Doppelklick auf `index.html` reicht deshalb nicht. Im Ordner:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen.
