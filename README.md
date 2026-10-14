# FotoMaß – Smartphone-Aufmaß

Statische HTML/CSS/JavaScript-Web-App für GitHub Pages.  
Foto aufnehmen, Maße einzeichnen, Skizzen ergänzen und als PNG exportieren.

## Funktionen

- Foto aufnehmen oder aus der Mediathek wählen
- **Maßlinien per Ziehen** auf dem Foto anlegen
- Maßwerte manuell eintragen (mm / cm / m)
- Maßlinien auswählen, als Ganzes verschieben **oder Endpunkte einzeln greifen**
- Farbe und Einheit pro Maßlinie
- Freihand, Gerade, Rechteck und Text
- Zuverlässiges Löschen von Maßen und Zeichnungen (Radierer)
- Rückgängig (Undo)
- Technischer Stil und kräftiger Baustellenstil
- Annotiertes Bild als PNG exportieren
- Projekt lokal im Browser speichern und wieder laden

## Bedienung (kurz)

1. Foto aufnehmen oder auswählen.
2. Werkzeug **＋ Maßlinie** wählen und auf dem Foto von A nach B ziehen.
3. In der Maßliste den Wert eintippen.
4. Mit **↖ Auswählen** eine Maßlinie antippen → Endpunkte erscheinen und lassen sich verschieben.
5. Weitere Skizzen mit Freihand, Linie, Rechteck oder Text ergänzen.
6. Fertiges Bild exportieren und/oder Projekt speichern.

## Veröffentlichung mit GitHub Pages

1. Bei https://github.com anmelden.
2. Oben rechts `+` → `New repository`.
3. Name z. B. `fotomass`, Sichtbarkeit **Public**.
4. Repository anlegen.
5. `Add file` → `Upload files`.
6. Die Dateien aus diesem Ordner hochladen:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `service-worker.js`
   - `README.md`
   
   Wichtig: `index.html` muss **direkt im Hauptverzeichnis** des Repositories liegen.
7. `Commit changes`.
8. `Settings` → `Pages`.
9. Quelle: **Deploy from a branch**, Branch `main`, Ordner `/(root)` → `Save`.
10. Nach kurzer Wartezeit erscheint die URL, z. B.  
    `https://DEIN-BENUTZERNAME.github.io/fotomass/`

## Hinweise

- GitHub Pages ist öffentlich. Keine privaten Fotos ins Repository laden.
- Fotos und Projekt-Daten bleiben im Browser (localStorage). Sie werden nicht auf einen Server übertragen.
- Große Fotos können den localStorage-Quota überschreiten → wichtige Ergebnisse immer zusätzlich als PNG exportieren.
- Die App ist ein MVP. Automatische Maßberechnung aus dem Foto ist bewusst **nicht** enthalten (ohne Kalibrierung und Perspektivkorrektur wäre sie unzuverlässig).

## Nächste sinnvolle Schritte

- Mehrere Projekte verwalten
- PDF-Projektblatt (Foto + Maßliste + Notizen)
- Einfaches Zoom/Pan auf dem Canvas
- Maßketten und Hilfslinien
- PWA-Icons und Service Worker für Offline-Nutzung
