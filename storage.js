/* FotoMaß – Speichermodul
 * - Projekte in IndexedDB (Schlüssel = Projekt-ID, nie der Name)
 * - Originalfoto getrennt und unverändert als Blob („photos“)
 * - Papierkorb (deletedAt), Migration älterer Daten, Import-Validierung
 * - Teilen/Download von Projekt-Dateien und Bildern
 */
(function (root) {
  "use strict";
  const FM = (root.FM = root.FM || {});

  const DB_NAME = "fotomass";
  const DB_VERSION = 2;
  const STORE_P = "projects";
  const STORE_PH = "photos";
  const FORMAT_VERSION = 13;          // + Kreis, Polylinie, Skizzen-Maßstab 0 = inaktiv
  const TRASH_DAYS = 30;
  const UNITS = [" mm", " cm", " m", "°"];

  // ---------- Hilfsfunktionen ----------
  function newId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (_) {}
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Verständliche Meldung statt technischem Fehlernamen
  function friendlyError(err) {
    const name = (err && err.name) || "";
    const msg = (err && err.message) || "";
    if (name === "QuotaExceededError" || /quota/i.test(msg)) {
      return "Speicher voll – bitte „In Dateien sichern“ nutzen und nicht mehr benötigte Projekte löschen.";
    }
    if (msg === "no-idb" || name === "SecurityError") {
      return "Der Browser-Speicher ist nicht verfügbar (z. B. privater Modus) – bitte regelmäßig „In Dateien sichern“.";
    }
    if (name === "InvalidStateError" || name === "UnknownError") {
      return "Der Browser-Speicher antwortet nicht – App neu öffnen. Bis dahin „In Dateien sichern“ nutzen.";
    }
    return "Speichern fehlgeschlagen (" + (name || "Fehler") + "). Bitte „In Dateien sichern“ nutzen.";
  }

  // ---------- IndexedDB ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!root.indexedDB) return reject(new Error("no-idb"));
        let req;
        try { req = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE_P)) d.createObjectStore(STORE_P);
          if (!d.objectStoreNames.contains(STORE_PH)) d.createObjectStore(STORE_PH);
        };
        req.onsuccess = () => {
          const d = req.result;
          d.onversionchange = () => { d.close(); dbPromise = null; };
          resolve(d);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("blocked"));
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  // Führt fn(store) in einer Transaktion aus; löst erst nach „complete“ auf
  // (dann ist wirklich geschrieben – Quota-Fehler kommen als abort).
  function run(storeName, mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      let t, out;
      try {
        t = d.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        if (req) req.onsuccess = () => { out = req.result; };
      } catch (e) { return reject(e); }
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("abort"));
    }));
  }

  const putProject = (rec) => run(STORE_P, "readwrite", (s) => s.put(rec, rec.id));
  const getProject = (id) => run(STORE_P, "readonly", (s) => s.get(id));
  const putPhoto = (id, blob) => run(STORE_PH, "readwrite", (s) => s.put(blob, id));
  const getPhoto = (id) => run(STORE_PH, "readonly", (s) => s.get(id));

  function removeProject(id) { // endgültig
    return run(STORE_P, "readwrite", (s) => s.delete(id)).then(() => run(STORE_PH, "readwrite", (s) => s.delete(id)));
  }

  // Alle Projekte als kleine Übersicht (ohne die großen Fotodaten zu behalten)
  function listProjects() {
    return db().then((d) => new Promise((resolve, reject) => {
      const out = [];
      const req = d.transaction(STORE_P, "readonly").objectStore(STORE_P).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))));
        const v = c.value;
        if (v && typeof v.id === "string") {
          out.push({
            id: v.id, name: v.projectName || "Ohne Namen", savedAt: v.savedAt || "", created: v.created || "",
            thumb: v.thumb || "", deletedAt: v.deletedAt || null,
            nMeasures: Array.isArray(v.measures) ? v.measures.length : 0
          });
        }
        c.continue();
      };
      req.onerror = () => reject(req.error);
    }));
  }

  async function estimate() {
    try {
      if (root.navigator.storage && root.navigator.storage.estimate) {
        const e = await root.navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0 };
      }
    } catch (_) {}
    return null;
  }

  function requestPersistence() {
    try { if (root.navigator.storage && root.navigator.storage.persist) return root.navigator.storage.persist(); } catch (_) {}
    return Promise.resolve(false);
  }

  // Papierkorb: nach TRASH_DAYS endgültig entfernen
  async function purgeTrash() {
    const limit = Date.now() - TRASH_DAYS * 86400000;
    const items = await listProjects();
    for (const it of items) {
      if (it.deletedAt && Date.parse(it.deletedAt) < limit) await removeProject(it.id);
    }
  }

  // ---------- Validierung / Migration ----------
  const isNum = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  const colorOr = (c) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : "#ff3b30");
  const unitOr = (u) => (UNITS.includes(u) ? u : " mm");
  const cleanValue = (v) => String(v == null ? "" : v).replace(/,/g, ".").replace(/[^\d.]/g, "").slice(0, 12);
  const cleanText = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

  /* Prüft und vereinheitlicht ein Projekt aus Datei, localStorage oder alter Datenbank.
   * Rückgabe: { project } oder { error }. Neue ID, außer opts.keepId. */
  function parseProject(raw, opts) {
    opts = opts || {};
    if (!raw || typeof raw !== "object") return { error: "Die Datei enthält kein Projekt." };
    const version = Number(raw.version) || 1;
    if (version > FORMAT_VERSION) return { error: "Die Datei stammt von einer neueren FotoMaß-Version (Format " + version + "). Bitte die App aktualisieren." };
    const photoOk = typeof raw.photoData === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(raw.photoData) && raw.photoData.length < 80e6;
    if (!photoOk) return { error: "Kein gültiges Foto in der Datei." };

    const measures = (Array.isArray(raw.measures) ? raw.measures : []).slice(0, 2000)
      .filter((m) => m && [m.x1, m.y1, m.x2, m.y2].every(isNum))
      .map((m, i) => {
        const out = {
          id: isNum(m.id) ? m.id : 100000 + i,
          x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2,
          x3: isNum(m.x3) ? m.x3 : undefined, y3: isNum(m.y3) ? m.y3 : undefined,
          type: m.type === "angle" && isNum(m.x3) && isNum(m.y3) ? "angle" : (m.type === "reference" ? "reference" : "linear"),
          isReference: m.isReference === true || m.type === "reference",
          autoCalculated: m.autoCalculated === true,
          value: cleanValue(m.value), unit: unitOr(m.unit), color: colorOr(m.color), textBg: m.textBg !== false,
          label: cleanText(m.label, 40), locked: m.locked === true,
          labelLocked: m.labelLocked === true,
          labelOffsetX: isNum(m.labelOffsetX) ? m.labelOffsetX : 0,
          labelOffsetY: isNum(m.labelOffsetY) ? m.labelOffsetY : 0,
          // Individuelle Maßlinien-Darstellung und Beschriftung (Format 11+)
          labelPrefix: cleanText(m.labelPrefix, 24),
          labelSuffix: cleanText(m.labelSuffix, 24),
          endStyle: typeof m.endStyle === "string" && ["slash", "filled", "open", "hollow", "dot", "tick"].includes(m.endStyle) ? m.endStyle : undefined,
          endSize: isNum(m.endSize) ? Math.max(5, Math.min(20, m.endSize)) : undefined,
          extensionLines: typeof m.extensionLines === "boolean" ? m.extensionLines : undefined,
          layer: m.layer === "sketch" ? "sketch" : "photo"
        };
        // Basispunkte der Maßhilfslinien (ursprüngliche Bezugspunkte)
        if (isNum(m.baseX1)) out.baseX1 = m.baseX1;
        if (isNum(m.baseY1)) out.baseY1 = m.baseY1;
        if (isNum(m.baseX2)) out.baseX2 = m.baseX2;
        if (isNum(m.baseY2)) out.baseY2 = m.baseY2;
        return out;
      });

    const drawings = (Array.isArray(raw.drawings) ? raw.drawings : []).slice(0, 5000)
      .filter((d) => d && ["freehand", "line", "rect", "text", "image", "circle", "polyline"].includes(d.type))
      .filter((d) => d.type !== "image" || (typeof d.imageData === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d.imageData) && d.imageData.length < 12e6))
      .map((d, i) => {
        const out = {
          id: isNum(d.id) ? d.id : 200000 + i, type: d.type,
          layer: d.layer === "sketch" ? "sketch" : "photo",
          x1: isNum(d.x1) ? d.x1 : 0, y1: isNum(d.y1) ? d.y1 : 0, x2: isNum(d.x2) ? d.x2 : 0, y2: isNum(d.y2) ? d.y2 : 0,
          color: colorOr(d.color),
          width: isNum(d.width) && d.width > 0 ? Math.min(d.width, 40) : 4,
          fontSize: isNum(d.fontSize) && d.fontSize > 0 ? Math.min(d.fontSize, 120) : undefined,
          text: d.type === "text" ? cleanText(d.text, 200) : undefined,
          imageData: d.type === "image" ? d.imageData : undefined,
          sourceName: d.type === "image" ? cleanText(d.sourceName, 100) : undefined,
          points: (d.type === "freehand" || d.type === "polyline") && Array.isArray(d.points)
            ? d.points.slice(0, 20000).filter((p) => p && isNum(p.x) && isNum(p.y)).map((p) => ({ x: p.x, y: p.y })) : undefined
        };
        // Rechteck: Füllung, Transparenz und Drehung beim Laden erhalten
        if (d.type === "rect") {
          out.fill = d.fill === true;
          out.fillOpacity = isNum(d.fillOpacity) ? Math.max(0, Math.min(1, d.fillOpacity)) : 1;
          out.rotation = isNum(d.rotation) ? d.rotation : 0;
        }
        // Kreis: optionale Füllung
        if (d.type === "circle") {
          out.fill = d.fill === true;
          out.fillOpacity = isNum(d.fillOpacity) ? Math.max(0, Math.min(1, d.fillOpacity)) : 1;
        }
        // Polylinie: geschlossen?
        if (d.type === "polyline") {
          out.closed = d.closed === true;
        }
        // Text: Hintergrundflag
        if (d.type === "text") out.textBg = d.textBg !== false;
        return out;
      });

    const maxId = Math.max(0, ...measures.map((m) => m.id), ...drawings.map((d) => d.id));
    const original = typeof raw.originalData === "string" && /^data:image\/[a-z0-9.+-]+;base64,/.test(raw.originalData) && raw.originalData.length < 150e6
      ? raw.originalData : null;

    const project = {
      version: FORMAT_VERSION, app: "FotoMaß",
      id: opts.keepId && typeof raw.id === "string" ? raw.id : newId(),
      projectName: cleanText(raw.projectName, 80),
      created: typeof raw.created === "string" ? raw.created : (typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString()),
      savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
      photoData: raw.photoData,
      canvasMode: raw.canvasMode === "sketch" ? "sketch" : "photo",
      sketchCanvasW: isNum(raw.sketchCanvasW) && raw.sketchCanvasW > 0 ? Math.min(raw.sketchCanvasW, 12000) : 4000,
      sketchCanvasH: isNum(raw.sketchCanvasH) && raw.sketchCanvasH > 0 ? Math.min(raw.sketchCanvasH, 12000) : 3000,
      // 0 = kein aktiver Skizzen-Maßstab. Alte Default-1-Werte ohne echten Maßstab werden auf 0 gesetzt.
      sketchScalePxPerMm: (function () {
        const s = isNum(raw.sketchScalePxPerMm) ? raw.sketchScalePxPerMm : 0;
        if (!(s > 0) || s > 100) return 0;
        // Format < 12 speicherte oft 1 als „leer“ – nur echte Maßstäbe behalten
        if ((Number(raw.version) || 1) < 12 && Math.abs(s - 1) < 1e-9) return 0;
        return s;
      })(),
      measures, drawings,
      nextId: Math.max(isNum(raw.nextId) ? raw.nextId : 1, maxId + 1),
      unit: unitOr(raw.unit),
      snap: typeof raw.snap === "boolean" ? raw.snap : true,
      fontSize: Math.min(48, Math.max(8, isNum(raw.fontSize) ? raw.fontSize : 24)),
      dimensionEndStyle: typeof raw.dimensionEndStyle === "string" && ["slash", "filled", "open", "hollow", "dot", "tick"].includes(raw.dimensionEndStyle) ? raw.dimensionEndStyle : "slash",
      dimensionEndSize: isNum(raw.dimensionEndSize) ? Math.max(5, Math.min(20, raw.dimensionEndSize)) : 10,
      dimensionExtensionLines: raw.dimensionExtensionLines !== false,
      thumb: typeof raw.thumb === "string" && raw.thumb.startsWith("data:image/") && raw.thumb.length < 200e3 ? raw.thumb : "",
      deletedAt: null
    };
    return { project, originalData: original, fromVersion: version };
  }

  const dataUrlToBlob = (url) => fetch(url).then((r) => r.blob());

  /* Ältere Daten übernehmen (einmalig, nichts wird gelöscht außer dem alten Datenbank-Schlüssel nach erfolgreicher Übernahme):
   *  - Datenbank v1: Schlüssel „_autosave“ und benannte Projekte (Schlüssel = Name)
   *  - localStorage „fotomass-project“ (Format 7)
   * Rückgabe: Anzahl übernommener Projekte */
  async function migrateLegacy() {
    let count = 0;
    const d = await db();
    const legacy = await new Promise((resolve, reject) => {
      const rows = [];
      const req = d.transaction(STORE_P, "readonly").objectStore(STORE_P).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(rows);
        if (!(c.value && typeof c.value.id === "string")) rows.push({ key: c.key, value: c.value });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    for (const row of legacy) {
      const r = parseProject(row.value);
      if (r.project) {
        if (row.key === "_autosave" && !r.project.projectName) r.project.projectName = "Wiederhergestellt";
        await putProject(r.project);
        count++;
      }
      await run(STORE_P, "readwrite", (s) => s.delete(row.key)); // erst nach erfolgreichem Schreiben
    }
    try {
      const raw = root.localStorage && root.localStorage.getItem("fotomass-project");
      if (raw && !root.localStorage.getItem("fm-ls-migrated")) {
        const r = parseProject(JSON.parse(raw));
        if (r.project) {
          if (!r.project.projectName) r.project.projectName = "Altes Projekt";
          await putProject(r.project);
          count++;
        }
        root.localStorage.setItem("fm-ls-migrated", "1"); // Original bleibt als Sicherung erhalten
      }
    } catch (_) {}
    return count;
  }

  // ---------- Dateien ----------
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function canShareFiles(files) {
    try { return !!(root.navigator.canShare && root.navigator.canShare({ files })); } catch (_) { return false; }
  }

  /* Teilen-Menü. Rückgabe: "shared" | "cancelled" | "unsupported" | "failed"
   * Direkt im Klick-Handler aufrufen (iOS verlangt eine frische Berührung). */
  async function shareFiles(files, title) {
    if (!canShareFiles(files)) return "unsupported";
    try {
      await root.navigator.share({ files, title: title || "FotoMaß" });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      return "failed";
    }
  }

  // Projekt-Datei: Teilen-Menü („In Dateien sichern“), sonst Download
  async function saveProjectFile(payload, baseName) {
    const json = JSON.stringify(payload);
    const name = baseName + ".fotomass.json";
    for (const type of ["application/json", "text/plain"]) {
      const file = new File([json], name, { type });
      if (canShareFiles([file])) {
        const r = await shareFiles([file], baseName);
        if (r === "shared" || r === "cancelled") return r;
        break;
      }
    }
    downloadBlob(new Blob([json], { type: "application/json" }), name);
    return "downloaded";
  }

  FM.storage = {
    FORMAT_VERSION, TRASH_DAYS, newId, friendlyError,
    putProject, getProject, listProjects, removeProject, putPhoto, getPhoto,
    estimate, requestPersistence, purgeTrash, parseProject, dataUrlToBlob, migrateLegacy,
    downloadBlob, canShareFiles, shareFiles, saveProjectFile
  };
  if (typeof module !== "undefined" && module.exports) module.exports = FM.storage;
})(typeof window !== "undefined" ? window : globalThis);
