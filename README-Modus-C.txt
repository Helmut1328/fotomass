FotoMaß – Modus C mit verbesserter Kantenerkennung

Enthalten sind die bestehenden FotoMaß-Dateien sowie die Erweiterung für manuell bestätigbare Maßlinienvorschläge.

Bedienung:
1. Foto laden.
2. „Mögliche Maßlinien suchen“ drücken.
3. Die gestrichelten Linien im Foto und die Vorschläge in der Liste prüfen.
4. Passende Vorschläge einzeln mit „Übernehmen“ bestätigen; unpassende mit „Verwerfen“ entfernen.
5. Bei vorhandener Referenz wird ein Wert berechnet. Ohne Referenz fragt FotoMaß den Wert ab.

Verbesserung der Erkennung:
- Das Foto wird für die Analyse auf maximal 850 Pixel Kantenlänge verkleinert, um die Verarbeitung auf Smartphones zu begrenzen.
- Ein Sobel-Gradient erkennt Helligkeitsübergänge in beliebiger Richtung.
- Eine richtungsbasierte Hough-Auswertung berücksichtigt waagerechte, senkrechte und schräge Linien.
- Kantenpunkte werden zu Segmenten gruppiert; kleine Lücken werden toleriert und nahezu doppelte Linien gefiltert.
- Vorschläge bleiben unverbindlich und werden nicht exportiert, solange sie nicht manuell übernommen wurden.

Grenzen:
Die lokale, regelbasierte Bildverarbeitung versteht nicht semantisch, welches Objekt ein Schrank oder Werkstück ist. Schatten, Maserung, Fugen und Hintergrund können weiterhin Vorschläge erzeugen; schwache oder verdeckte Kanten können fehlen. Bei Fotos mit starker Perspektive oder geringer Schärfe ist die Erkennung eingeschränkt. Alle Vorschläge deshalb prüfen.

Die bisherige Maßlinien-, Referenzmaß-, Zeichen-, Speicher- und Exportfunktion bleibt Bestandteil des Pakets. Nach Austausch der Dateien kann bei einer installierten PWA ein Neuladen nötig sein, damit der neue Service-Worker geladen wird.
