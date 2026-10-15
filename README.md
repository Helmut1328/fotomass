# FotoMaß – Version 3: Referenzmaße

Smartphone-optimierte Foto-Aufmaß-App für GitHub Pages.

## Dateien
Alle neun Laufzeitdateien müssen im gleichen GitHub-Pages-Verzeichnis liegen:
`index.html`, `style.css`, `app.js`, `speech.js`, `storage.js`, `service-worker.js`, `manifest.json`, `apple-touch-icon.png`, `icon-512.png`.

## Referenzmaß verwenden
1. Foto öffnen.
2. Werkzeug **⚖ Referenz** wählen und die bekannte Strecke auf dem Foto zeichnen.
3. Den bekannten echten Wert samt Einheit eingeben, z. B. `600 mm`.
4. Werkzeug **＋ Maß** wählen und weitere Strecken in derselben Bildebene zeichnen. FotoMaß berechnet den Wert automatisch.
5. Automatisch berechnete Werte sind in der Maßliste mit **berechnet** markiert. Doppeltippen oder die Zahl in der Liste ändern macht den Wert zu einem manuellen Wert.
6. Wird die Länge der Referenzlinie geändert, werden automatisch berechnete Werte aktualisiert.

## Grenzen
Die Referenzberechnung verwendet ein einfaches Pixelverhältnis. Sie ist für eine annähernd frontal fotografierte, ebene Fläche gedacht. Sie korrigiert keine Perspektive und ist nicht zuverlässig für Strecken in unterschiedlichen Tiefen oder auf verschiedenen Ebenen. Winkel werden weiterhin geometrisch aus drei Bildpunkten berechnet und nicht über den Maßstab skaliert.

## Version
Projektdateiformat 10. Der Service-Worker-Cache wurde auf `fotomass-v11` erhöht.
