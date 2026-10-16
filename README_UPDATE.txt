FotoMaß – Fehlerkorrektur für Sperren und Maßzahlen

Enthalten:
- index.html
- app.js
- style_patch.css
- README_UPDATE.txt

Korrekturen:
1. Sperren/Entsperren: Verlaufssicherungen serialisieren eingefügte Bilddaten nicht mehr bei jeder Aktion erneut. Das reduziert die Arbeit beim Sperren einer Maßlinie deutlich, wenn große Bilder eingefügt sind.
2. Maßzahlen: Textwinkel werden einheitlich normalisiert. Vertikale Maßzahlen sind immer von rechts lesbar; bei umgekehrter Zeichenrichtung kippt die Beschriftung nicht mehr auf den Kopf.
3. CSS: index.html bindet style_patch.css jetzt ausdrücklich ein.

Einbau:
1. Vorher die aktuellen Dateien in GitHub herunterladen oder anderweitig sichern.
2. Im Repository fotomass die index.html und app.js durch diese Version ersetzen.
3. style_patch.css im selben Hauptverzeichnis ablegen.
4. Die vorhandene style.css, storage.js, speech.js und übrige Projektdateien nicht ersetzen.
5. GitHub Pages neu laden; auf dem iPhone die Seite schließen und erneut öffnen, falls der Cache noch die alte Version zeigt.

Bitte insbesondere Sperren, Entsperren, Rückgängig/Wiederholen, Projekt neu öffnen und Bild-Export auf dem iPhone testen.
