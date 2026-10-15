# FotoMaß – Version 5

Smartphone-Aufmaß für Schreinerarbeiten und private Projekte.

## Dateien für GitHub Pages
Alle neun App-Dateien in dasselbe Verzeichnis wie bisher hochladen/ersetzen: `index.html`, `style.css`, `app.js`, `speech.js`, `storage.js`, `service-worker.js`, `manifest.json`, `apple-touch-icon.png`, `icon-512.png`. Diese Dokumentation und `TESTANLEITUNG.md` sind zusätzliche Hilfsdateien.

## Neu in Version 5
- Maßbeschriftungen können unabhängig von der Maßlinie verschoben werden.
- Zum Verschieben: Beschriftung einmal antippen, damit das Maß ausgewählt ist; danach die Beschriftung erneut antippen und ziehen.
- Verschobene Beschriftungspositionen werden im Projekt gespeichert und beim Export mit ausgegeben.
- Rückgängig/Wiederholen und automatische Speicherung berücksichtigen die Änderung.

## Weiterhin enthalten
Manuelle Maßlinien, Endpunkte bearbeiten, Maßwert ändern, Winkelbemaßung, Referenzmaßberechnung für annähernd frontale ebene Flächen, Textfläche ein/aus, Freihand, Linien, Rechtecke, Text, zusätzliche Bilder einfügen/zuschneiden/verschieben/skalieren, Projektimport/-export, Rückgängig/Wiederholen und Bildexport.

## Hinweise
- Die Referenzmessung ist eine Näherung für annähernd frontale, ebene Flächen; Perspektive kann Ergebnisse verfälschen.
- Zusatzbilder werden beim Einfügen verkleinert, um den Browser-Speicher zu schonen.
- JavaScript-Syntax und Paketstruktur wurden geprüft. Ein vollständiger Funktionstest im echten iPhone-Browser war nicht möglich; bitte die Testanleitung nach dem Upload ausführen.
