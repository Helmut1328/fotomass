FotoMaß v25 – gezieltere Konturmarker-Vorschläge

Änderungen:
- Konturmarkierungen dienen ausschließlich als Suchkorridor.
- Segmente ohne ausreichend starke Bildkante werden nicht mehr als scheinbar erkannte Maßlinien angezeigt.
- Freihandspuren werden stärker vereinfacht; kurze Segmente werden verworfen.
- Benachbarte, nahezu kollineare erkannte Kantenabschnitte werden zusammengeführt.
- Service-Worker-Cache auf fotomass-v25 angehoben.

Wichtig: Lieber kein Vorschlag als eine falsche Linie entlang der Markierung. Klassische Gradienten sind keine semantische Objekterkennung; Maserung und Schatten können weiterhin stören. JavaScript-Syntaxprüfung ist erfolgt; ein echter iPhone-Test mit dem Ganter-Foto steht noch aus. Die übrigen Dateien stammen aus v24.
