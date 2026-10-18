FotoMaß – Modus C mit verbesserter Kantenerkennung

Bedienung:
1. Foto laden.
2. Optional: Mit dem Rechteck-Werkzeug einen Rahmen um das Werkstück ziehen, auswählen und „Suchbereich setzen“.
3. „Mögliche Maßlinien suchen“ drücken.
4. Gestrichelte Linien im Foto und die Liste prüfen. Einen Vorschlag antippen, um ihn hervorzuheben.
5. Passende Vorschläge mit „Übernehmen“ bestätigen; unpassende mit „Verwerfen“ oder „Vorschläge verwerfen“ entfernen.
6. Bei vorhandener Referenz wird ein Wert berechnet. Ohne Referenz fragt FotoMaß den Wert ab.

Was an der Erkennung geändert wurde:
- Hauptursache der schwachen Ergebnisse: Hough-Stimmen nur im exakten Gradienten-Winkel → bei realen Fotos streuten die Stimmen. Jetzt stimmen Kantenpunkte mit Winkel-Toleranz (± ca. 10°) ab.
- Leichte 3×3-Glättung vor dem Sobel-Filter (weniger Maserungsrauschen).
- Robustere Nichtmaximum-Unterdrückung und etwas milderer adaptiver Schwellenwert für weiche Möbelkanten.
- Größere Lücken-Toleranz beim Bilden von Segmenten (unterbrochene Kanten).
- Scoring nach Länge, Kontinuität und Stärke; leichte Bevorzugung waagerechter/senkrechter Kanten, schräge bleiben möglich.
- Optionaler Suchbereich (ROI), damit unruhiger Hintergrund weniger stört.
- Vorschläge bleiben unverbindlich und werden nicht exportiert, solange sie nicht manuell übernommen wurden.

Grenzen:
Lokale Bildverarbeitung versteht nicht semantisch „Schrank“ oder „Werkstück“. Schatten, starke Maserung und perspektivische Verzerrung können weiterhin falsche oder fehlende Vorschläge erzeugen. Alle Vorschläge prüfen.

Service Worker: Cache-Version fotomass-v20. Nach dem Hochladen die App einmal mit Netzwerk neu öffnen bzw. den Browser-Cache leeren, damit der neue Code geladen wird.

Die bisherigen Maßlinien-, Referenz-, Zeichen-, Speicher- und Exportfunktionen bleiben erhalten.


NEU in dieser Version: Freihand-Konturmarker. Wähle „Konturmarker“, fahre wichtige Kanten mit dem Finger nach und tippe anschließend auf „Vorschläge aus Markierungen“. Die markierten Striche werden in gerade Segmente zerlegt und als unverbindliche Vorschläge in Foto und Liste angezeigt. Jede Maßlinie muss weiterhin einzeln übernommen werden. Markierungen sind eine temporäre Suchhilfe und werden nicht in das exportierte Foto eingebrannt. Die Funktion richtet die Markierung nicht automatisch auf eine erkannte Bildkante aus; sie macht deine markierte Kontur zunächst zu einem kontrollierbaren Linienvorschlag.
