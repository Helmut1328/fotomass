# Prüfbericht FotoMaß

## A. Analyse (gefundene Probleme)

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| 1 | **Export zeigt Auswahl-Rahmen und blaue Griffe**, weil das Live-Canvas exportiert wurde | hoch | app.js |
| 2 | **Nur ein Bild exportierbar**, kein Original; Rückfall „Download“ landet in Dateien statt Galerie | hoch | app.js |
| 3 | Share-Menü wurde erst nach asynchroner Arbeit aufgerufen → iOS verweigert es teils (NotAllowedError) und der Fehler wurde verschluckt | hoch | app.js |
| 4 | Wert-Feld öffnete sich nach dem Ziehen nicht, nur per Doppel-Tipp | mittel | app.js |
| 5 | **Schrift, Linien und Griffe in Bild-Pixeln**: bei 4032 px Foto (auf 2000 verkleinert) und ~380 px Anzeige nur ca. 3–5 px groß → Griffe kaum treffbar | hoch | app.js |
| 6 | Zahlenparser kennt keine zusammengesetzten Wörter („zwölfhundert“ → nichts), „12 Komma 5“ wurde zu 125, Einheiten werden ignoriert | hoch | app.js |
| 7 | Foto im Projekt als Original-Data-URL (mehrere MB) → localStorage (≈5 MB) läuft voll; nur ein Projekt möglich | hoch | app.js |
| 8 | Neues Foto löschte Arbeit ohne Rückfrage; iOS lädt die Seite nach der Kamera oft neu → Arbeit weg | hoch | app.js |
| 9 | Eingabefelder mit 15 px → iOS zoomt beim Antippen heran | mittel | style.css |
| 10 | Text-Dialog öffnete beim Aufsetzen des Fingers → iOS-Tastatur erscheint oft nicht | mittel | app.js |
| 11 | Jeder Tipp erzeugte einen Rückgängig-Schritt, auch ohne Änderung | niedrig | app.js |
| 12 | `service-worker.js` leer, Manifest ohne Icons, kein `apple-touch-icon` | mittel | alle |
| 13 | Langes Drücken auf Maßlinie (laut Beschreibung gewünscht) fehlte | mittel | app.js |
| 14 | Geladene Projekt-Dateien wurden nicht geprüft | niedrig (Sicherheit) | app.js |

Sicherheit: Es gibt keine Server- oder Fremdinhalte; Texte werden nur über `textContent`/`value` und Canvas ausgegeben (kein XSS). Projekt-Dateien werden jetzt validiert (Zahlen, Farben, Einheiten, Typen).

## B. Änderungen (was wurde geändert)

- **speech.js (neu)**: Zahlenparser, Befehle, Spracherkennung; in Node getestet (21 Fälle)
- **storage.js (neu)**: IndexedDB, Teilen/Download, Validierung
- **app.js**: überarbeitet (Punkte 1–11, 13, 14)
- **index.html**: neue Dialoge (2-Fotos-Export, Menü, Projekte), Einheit im Wert-Dialog, Icons
- **style.css**: 16-px-Eingaben, neue Dialoge
- **service-worker.js, manifest.json, Icons**: Offline-Betrieb, Home-Bildschirm-Icon

## C. Offen / Empfehlungen
- Sprache am iPhone hängt an Safari/Siri-Einstellungen; Alternative Tastatur-Diktat ist eingebaut.
- Im Test emuliert (Chromium, Touch): echter iPhone-Test von Teilen-Menü und Mikrofon steht aus.
- Mögliche Ergänzungen: Maßkette/Summe, Winkel, Raster/Referenzmaß zur Perspektivkorrektur, PDF-Export.
