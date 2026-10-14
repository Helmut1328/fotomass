# FotoMaß – Smartphone-MVP

Ein kleines, statisches HTML/CSS/JavaScript-Projekt für GitHub Pages.

## Funktionen im MVP
- Foto aufnehmen oder aus der Mediathek auswählen
- Manuelle Maßlinien anlegen und Werte eintragen
- Maßlinien auswählen und verschieben
- Farbe wählen
- Freihand, Linie, Rechteck und Text ergänzen
- Zeichenobjekte per Radierer entfernen
- Technischer Standardstil und optionaler Baustellenstil
- Annotiertes Bild als PNG exportieren
- Einfaches lokales Speichern im Browser

## Veröffentlichung mit GitHub Pages
1. Melde dich bei https://github.com an.
2. Klicke oben rechts auf `+` und dann `New repository`.
3. Repository name: `fotomass`
4. Sichtbarkeit: `Public` (für die einfachste GitHub-Pages-Veröffentlichung).
5. `Add a README file` kannst du abwählen, weil diese ZIP bereits eine README enthält.
6. Klicke auf `Create repository`.
7. Im neuen Repository `Add file` → `Upload files` wählen.
8. Entpacke die ZIP auf deinem Computer und lade **die sechs Dateien aus dem Ordner** hoch. Wichtig: `index.html` muss direkt im Hauptordner des Repositorys liegen, nicht in einem Unterordner und nicht als ZIP.
9. Klicke auf `Commit changes`.
10. Öffne `Settings` → `Pages`.
11. Bei `Build and deployment` als Quelle `Deploy from a branch` wählen.
12. Branch `main` und Ordner `/(root)` wählen, dann `Save`.
13. Warte kurz und öffne die angezeigte URL. Sie sieht ungefähr so aus: `https://DEIN-BENUTZERNAME.github.io/fotomass/`.

## Hinweise
- GitHub Pages veröffentlicht die Dateien öffentlich. Lade keine privaten Fotos oder persönlichen Daten ins Repository.
- Fotos, die du in FotoMaß auswählst, werden in diesem MVP nicht an einen Server übertragen. Lokales Speichern ist browserabhängig; wichtige Ergebnisse daher zusätzlich als PNG exportieren.
- Die App ist ein MVP. Automatische Maßberechnung, Projektverwaltung mit mehreren Projekten und robustes Backup sind noch nicht enthalten.
