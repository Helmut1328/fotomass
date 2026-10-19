FotoMaß – Priorität A + B (Stabilität & Design)

ÄNDERUNGEN PRIORITÄT A (Stabilität)
------------------------------------
1. parseProject (storage.js)
   - labelPrefix, labelSuffix, endStyle, endSize, extensionLines
   - baseX1/Y1/X2/Y2 (Maßhilfslinien-Bezugspunkte)
   - dimensionEndStyle / dimensionEndSize / dimensionExtensionLines auf Projektebene
   → Alle Werte bleiben beim Speichern, Browser-Reload und Datei-Import erhalten.

2. Abbrechen bei neuer Maßlinie (app.js)
   - „Abbrechen“ im Werte-Dialog verwirft die gerade gezeichnete Maßlinie
     (Undo auf den Zustand vor dem Einfügen).

3. Maßhilfslinien robuster (app.js)
   - Maßbasierte Rechtecke setzen baseX/Y an den Rechteckkanten.
   - Endpunkt verschieben aktualisiert den zugehörigen Basispunkt,
     wenn er bisher am Endpunkt lag (sinnvolle Hilfslinien).
   - Ganzes Maß verschieben lässt Bases unverändert (klassische Hilfslinien).

ÄNDERUNGEN PRIORITÄT B (Design / Bedienung)
-------------------------------------------
- Canvas größer: ~68–72 vh auf dem iPhone, bis 720 px auf Desktop
- Primärwerkzeuge (Auswählen / Maß / Referenz) größer und hervorgehoben
- Weniger Innenabstände, kompaktere Topbar und Panels
- Touch-Hinweis auf sehr schmalen Geräten ausgeblendet (mehr Platz)
- Service-Worker-Cache: fotomass-v23-stability-design-ab

VERÖFFENTLICHUNG
----------------
ZIP entpacken und Dateien mit denselben Namen im GitHub-Repository ersetzen.
Vorher aktuellen Stand sichern.

Nach dem Upload auf dem Smartphone testen:
1. Neue Maßlinie zeichnen → Abbrechen → Linie muss verschwinden
2. Text davor/danach setzen → speichern → Projekt neu öffnen → Texte bleiben
3. Maßhilfslinien: Maß zeichnen, Linie versetzen → Hilfslinien von Bezugspunkten
4. Maßbasiertes Rechteck → Hilfslinien von den Kanten
5. Canvas nimmt mehr Platz ein, Primärwerkzeuge sind gut treffbar

BETROFFENE DATEIEN
------------------
- app.js
- storage.js
- style.css
- service-worker.js
