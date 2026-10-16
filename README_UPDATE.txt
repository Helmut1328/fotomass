FotoMaß – Update: Bild zuschneiden und skalieren

Dateien:
- index.html: aktualisierte HTML-Datei
- app.js: aktualisierte Bedienlogik
- style_patch.css: zusätzliche Styles für den Zuschneiderahmen

Einbau in GitHub Pages:
1. Lade index.html und app.js in das Hauptverzeichnis deines bestehenden fotomass-Repositorys und ersetze die vorhandenen Dateien.
2. Lade style_patch.css ebenfalls in das Hauptverzeichnis hoch.
3. Lass style.css, speech.js, storage.js, manifest.json und die übrigen bestehenden Dateien unverändert.
4. Warte auf GitHub Pages und lade die App auf dem Smartphone neu. Falls die alte Version erscheint, die Seite schließen und erneut öffnen.

Neue Bedienung:
- Im Zuschneidefenster den gelben Rahmen innerhalb verschieben oder an einer Kante/Ecke ziehen.
- Die vier Regler funktionieren weiterhin als Alternative.
- Eingefügte Bilder werden beim Ziehen der unteren rechten Ecke standardmäßig proportional skaliert.
- „Freie Verzerrung“ schaltet unabhängiges Ändern von Breite und Höhe ein.
- Vorhandene Projekte und Speicherlogik bleiben in den bestehenden storage.js- und app.js-Datenstrukturen.

Wichtig: Vor dem Ersetzen empfiehlt sich ein Download der aktuellen Dateien aus GitHub als Sicherung. Diese Dateien wurden lokal syntaktisch geprüft; ein vollständiger Test in Safari/iOS und im live geschalteten GitHub-Pages-Projekt steht noch aus.
