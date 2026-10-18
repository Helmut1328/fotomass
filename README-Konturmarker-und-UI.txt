FotoMaß – Arbeitsversion: Konturmarker und kompaktere Bedienung

Änderungen:
- Konturmarkierungen werden als eigener temporärer Zustand gespeichert und direkt auf dem Foto angezeigt.
- Das Werkzeug „Konturmarker“ zeichnet freihändig mit dem Finger.
- „Vorschläge aus Markierungen“ erzeugt aus vereinfachten, längeren Abschnitten der markierten Kontur unverbindliche Linienvorschläge.
- „Markierungen löschen“ entfernt nur die temporären Konturmarkierungen.
- Konturmarkierungen werden nicht als normale Zeichnungen behandelt und nicht in den Export eingebrannt.
- Modus-C-Bereich und Werkzeug-/Einstellungsbereich sind jetzt einklappbar, um auf kleinen Displays Platz zu sparen.
- Werkzeugraster nutzt auf Smartphones kompaktere 3-Spalten-Anordnung.
- Service-Worker-Cache wurde auf fotomass-v22 erhöht.

Wichtige Einschränkung:
Die aktuelle Umsetzung richtet Linien noch nicht automatisch auf die echte Bildkante aus. Aus der Freihandmarkierung werden gerade Liniensegmente durch Vereinfachung der gezeichneten Spur erzeugt. Sie sind Vorschläge und müssen einzeln übernommen werden. Automatisches Einrasten auf tatsächliche Kanten ist ein weiterer Entwicklungsschritt.

Prüfungen:
- app.js: node --check erfolgreich.
- index.html: HTML-Parser-Test erfolgreich.
- Kein vollständiger interaktiver iPhone-/Browser-Test durchgeführt.

Installation:
1. Bestehende GitHub-Version separat sichern.
2. ZIP entpacken.
3. Dateien mit den ursprünglichen Namen ins Repository hochladen und ersetzen.
4. GitHub Pages Veröffentlichung abwarten.
5. App vollständig schließen und neu öffnen, damit der Service-Worker-Cache aktualisiert wird.
