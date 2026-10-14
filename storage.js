/* FotoMaß – Speichermodul
 * - Projekte im Browser (IndexedDB, mehrere Projekte + Autosave)
 * - Projekt als Datei sichern (iPhone: Teilen-Menü › „In Dateien sichern“, sonst Download)
 * - Bilder teilen (iPhone: „Bilder sichern“ = Galerie)
 */
(function (root) {
  "use strict";
  const FM = (root.FM = root.FM || {});
  const DB_NAME = "fotomass";
  const STORE = "projects";
  const AUTOSAVE_KEY = "_autosave";

  // ---------- IndexedDB ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!root.indexedDB) return reject(new Error("no-idb"));
        const req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const res = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(res && "result" in res ? res.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const put = (key, value) => tx("readwrite", (s) => s.put(value, key));
  const get = (key) => tx("readonly", (s) => s.get(key));
  const del = (key) => tx("readwrite", (s) => s.delete(key));

  function list() {
    return db().then((d) => new Promise((resolve, reject) => {
      const out = [];
      const req = d.transaction(STORE, "readonly").objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))));
        if (c.key !== AUTOSAVE_KEY && c.value) {
          out.push({ key: c.key, name: c.value.projectName || c.key, savedAt: c.value.savedAt || "", thumb: c.value.thumb || "" });
        }
        c.continue();
      };
      req.onerror = () => reject(req.error);
    }));
  }

  function requestPersistence() {
    try { if (root.navigator.storage && root.navigator.storage.persist) root.navigator.storage.persist(); } catch (_) {}
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

  /* Teilen-Menü öffnen. Rückgabe: "shared" | "cancelled" | "unsupported" | "failed"
   * WICHTIG: direkt im Klick-Handler aufrufen (iOS verlangt eine frische Berührung). */
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

  // Projekt-Datei: erst Teilen-Menü („In Dateien sichern“), sonst Download
  async function saveProjectFile(payload, baseName) {
    const json = JSON.stringify(payload);
    const name = baseName + ".fotomass.json";
    const candidates = ["application/json", "text/plain"];
    for (const type of candidates) {
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

  // Kleine Plausibilitätsprüfung für geladene Projektdaten
  function sanitizeProject(data) {
    if (!data || typeof data !== "object" || typeof data.photoData !== "string" || !data.photoData.startsWith("data:image/")) return null;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const measures = (Array.isArray(data.measures) ? data.measures : []).map((m) => ({
      id: num(m.id), x1: num(m.x1), y1: num(m.y1), x2: num(m.x2), y2: num(m.y2),
      value: String(m.value ?? "").replace(/[^\d.]/g, ""),
      unit: [" mm", " cm", " m"].includes(m.unit) ? m.unit : " mm",
      color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : "#ff3b30"
    }));
    const drawings = (Array.isArray(data.drawings) ? data.drawings : []).filter((d) => d && ["freehand", "line", "rect", "text"].includes(d.type)).map((d) => ({
      id: num(d.id), type: d.type,
      x1: num(d.x1), y1: num(d.y1), x2: num(d.x2), y2: num(d.y2),
      color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#ff3b30",
      width: num(d.width) || 4,
      fontSize: num(d.fontSize) || undefined,
      text: typeof d.text === "string" ? d.text.slice(0, 200) : undefined,
      points: Array.isArray(d.points) ? d.points.map((p) => ({ x: num(p.x), y: num(p.y) })) : undefined
    }));
    return {
      projectName: String(data.projectName || "").slice(0, 80),
      photoData: data.photoData,
      measures, drawings,
      nextId: num(data.nextId) || 1,
      unit: [" mm", " cm", " m"].includes(data.unit) ? data.unit : " mm",
      snap: typeof data.snap === "boolean" ? data.snap : true,
      fontSize: Math.min(48, Math.max(8, num(data.fontSize) || 18)),
      savedAt: data.savedAt || ""
    };
  }

  FM.storage = { put, get, del, list, AUTOSAVE_KEY, requestPersistence, downloadBlob, canShareFiles, shareFiles, saveProjectFile, sanitizeProject };
})(typeof window !== "undefined" ? window : globalThis);
