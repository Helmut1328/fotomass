FotoMaß v24 – gezielte Korrektur Konturmarker und kompaktere Bedienung

Wichtige Änderungen:
- Der Konturmarker wird als Suchkorridor verwendet. Entlang der Markierung werden Bildgradienten gesucht und die Treffer als neue Gerade angepasst. Die rote Markierung selbst wird nicht als Maßlinie übernommen.
- In der Vorschlagsliste wird angezeigt, ob eine Anpassung an eine Bildkante gelang oder ob keine eindeutige Kante gefunden wurde.
- Die Werkzeugbedienung ist aufgeteilt: Hauptwerkzeuge über dem Foto, weitere Zeichenwerkzeuge direkt darunter, erweiterte Einstellungen in einem aufklappbaren Bereich. Doppelte Werkzeugbuttons im Einstellungsbereich wurden entfernt.
- Service-Worker-Cache auf fotomass-v24 angehoben.

Einschränkungen:
- Das Einrasten nutzt klassische lokale Gradienten und passt eine gerade Linie an gefundene Kantenpunkte an. Es ist keine semantische Objekterkennung; Maserung und Schatten können weiterhin stören.
- Syntax und Paketinhalt können geprüft werden, aber ein echter iPhone-Touchtest mit dem Ganter-Foto muss noch erfolgen.

GitHub: Alle Dateien mit ihren Originalnamen aus dem Paket hochladen und ersetzen. Vorher funktionierende Version sichern.
