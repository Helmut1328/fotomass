# FotoMaß Version 5 – Testanleitung

## 1. Maßbeschriftung verschieben
1. Auf dem iPhone ein Foto öffnen und eine Maßlinie mit Maßtext anlegen.
2. Werkzeug „Auswählen“ aktivieren.
3. Maßtext einmal antippen. Das Maß wird ausgewählt.
4. Den Maßtext ein zweites Mal antippen und mit dem Finger ziehen. Der Text soll sich bewegen, die Maßlinie und ihre Endpunkte sollen an Ort und Stelle bleiben.
5. Das Maß ein zweites Mal verschieben und prüfen, ob es sich weiterhin gut treffen lässt.

## 2. Verschiedene Maßtypen
- Lineares Maß verschieben.
- Referenzmaßbeschriftung verschieben.
- Winkelbeschriftung verschieben.
- Prüfen, dass sich die Maßlinie bzw. die Winkelschenkel beim Verschieben des Textes nicht mitbewegen.

## 3. Speichern, Verlauf und Export
1. Beschriftung verschieben und warten, bis „gesichert“ angezeigt wird.
2. Projekt schließen bzw. neu laden und wieder öffnen: Textposition muss erhalten bleiben.
3. Rückgängig und Wiederholen testen.
4. Maßbild exportieren: verschobener Text muss an seiner Position erscheinen; Auswahlrahmen und Griffe dürfen nicht im Export erscheinen.
5. Projektdatei exportieren und wieder importieren. Textposition muss erhalten bleiben.

## 4. Regressionstest der bisherigen Funktionen
- Hauptfoto laden und Projekt speichern/öffnen.
- Normale Maßlinie zeichnen, Endpunkte verschieben und Maßwert ändern.
- Referenzmaß setzen und eine weitere Maßlinie berechnen lassen.
- Winkel messen.
- Textfläche ein- und ausschalten.
- Freihand, Linie, Rechteck und Text ausprobieren.
- Zusatzbild zuschneiden, einfügen, verschieben, skalieren und exportieren.
- Rückgängig/Wiederholen und Export der Fotos testen.

## Hinweise
- Erst nach erfolgreichem Test die nächste Ausbaustufe beginnen.
- Wenn der Browser nach dem Deployment eine alte Version zeigt, die Seite vollständig neu laden; der Service-Worker-Cache wurde für Version 5 auf `fotomass-v12` erhöht.


## V5.1 – Freie Texte
1. Werkzeug „Text“ wählen und einen Text einfügen.
2. Auswahlwerkzeug aktivieren und den Text antippen.
3. Den ausgewählten Text erneut antippen: Dialog „Text bearbeiten“ muss erscheinen.
4. Wortlaut, Schriftgröße, Farbe und Texthintergrund ändern und übernehmen.
5. Den Text ziehen und verschieben.
6. Speichern, neu öffnen und exportieren; Textformatierung und Position müssen erhalten bleiben.
7. Rückgängig/Wiederholen sowie bestehende Maßlinien, Winkel und Zusatzbilder prüfen.
