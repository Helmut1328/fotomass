# FotoMaß – Smartphone-Aufmaß

Statische HTML/CSS/JavaScript-Web-App für GitHub Pages.

## Neu in dieser Version

- **Kamera und Galerie getrennt** – zwei klare Buttons
- **Anfunkte (Snap)** – Maßlinien rasten an Endpunkten bestehender Maße ein (Maßketten)
- **Spracheingabe** – Maßwert per Mikrofon sprechen (Web Speech API, Chrome/Android & Safari wo unterstützt)
- Maßwert bleibt sichtbar auf der Linie; Antippen der Linie öffnet die Eingabe
- Übersichtliche Abschnitte: 1. Foto → 2. Zeichnung → 3. Maße → 4. Projekt

## Bedienung

1. **Kamera** oder **Galerie** wählen.
2. Werkzeug **＋ Maßlinie** → auf dem Foto von A nach B ziehen.
3. Wert tippen oder **🎤** antippen und Zahl sprechen.
4. Weitere Maßlinien an bestehende Endpunkte „anfunken“ (grüne Markierung).
5. Mit **↖ Auswählen** Endpunkte greifen und verschieben.
6. Fertiges Bild exportieren und/oder Projekt speichern.

## GitHub Pages

Dateien (`index.html`, `style.css`, `app.js`, `manifest.json`, `service-worker.js`, `README.md`) direkt in den Root des Repositories legen und Pages auf Branch `main` / `(root)` aktivieren.

## Hinweise

- Spracheingabe braucht Mikrofon-Berechtigung und funktioniert am besten in Chrome (Android) und neueren Safari-Versionen.
- Anfunkte können in den Einstellungen abgeschaltet werden.
- Große Fotos können den localStorage-Quota überschreiten → zusätzlich PNG exportieren.
