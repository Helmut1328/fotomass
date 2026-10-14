# FotoMaß – Smartphone-Aufmaß

Dateien (alle in dasselbe GitHub-Pages-Verzeichnis legen):
`index.html`, `style.css`, `app.js`, `speech.js`, `storage.js`, `service-worker.js`, `manifest.json`, `apple-touch-icon.png`, `icon-512.png`

## Bedienung
1. 📷 Kamera oder 🖼 Galerie
2. Werkzeug „＋ Maß“, Linie ziehen → **das Wert-Feld öffnet sich sofort** (tippen, 🎤 oder iPhone-Diktat)
3. Zoom: +/− oder zwei Finger · Fadenkreuz optional
4. **🖼 In Galerie (2 Fotos)**: Vorschau mit Original + Bild mit Maßen → „Beide in Fotos sichern“ → im Menü „2 Bilder sichern“
5. **📁 In Dateien sichern**: Projekt-Datei (`.fotomass.json`) im Teilen-Menü „In Dateien sichern“ ablegen; später „📂 Projekt-Datei öffnen“
6. Auswählen-Werkzeug: Doppel-Tipp = Wert ändern · lang drücken = Menü (Wert, 🎤, Farbe, Duplizieren, Löschen)

## Sprache
- Versteht „zwölfhundert“, „zweitausendeinhundertvierunddreißig“, „eins zwei drei vier“, „zwölf Komma fünf“, „120 Zentimeter“ (setzt die Einheit mit)
- Befehle: „OK / fertig“ übernimmt, „abbrechen“ schließt, „löschen“ leert
- Option „automatisch übernehmen“ und „🎤 sofort starten“ im Dialog
- Am iPhone funktioniert Sprache nur in Safari (nicht als Home-Bildschirm-App) und mit aktivierter Diktierfunktion. Alternative: Dialog-Link „⌨ Text-Tastatur“ und das Mikrofon der iPhone-Tastatur nutzen – das Wort „zwölfhundert“ wird beim Übernehmen in 1200 umgewandelt.

## Speichern
- Automatischer Zwischenspeicher (überlebt Neuladen, z. B. nach der Kamera)
- „Im Browser speichern“: mehrere Projekte (IndexedDB) mit Vorschaubild
- Projekt-Datei: Backup/Weitergabe, enthält Foto + alle Maße und Zeichnungen
