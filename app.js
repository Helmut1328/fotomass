/* FotoMaß – Hauptprogramm
 * Aufbau: Zustand › Hilfsfunktionen › Verlauf › Zoom › Zeichnen › Treffer › Maßliste ›
 *         Foto › Projekt › Export › Dialoge › Zeigerbedienung › Start
 * Sprache: speech.js · Speichern/Teilen: storage.js
 */
(() => {
  "use strict";

  const { speech, storage } = window.FM;
  const $ = (id) => document.getElementById(id);

  // ---------- DOM ----------
  const canvas = $("editorCanvas");
  const ctx = canvas.getContext("2d");
  const baseCanvas = document.createElement("canvas"); // verkleinertes Foto ohne Zeichnung
  const canvasWrap = $("canvasWrap");
  const emptyState = $("emptyState");
  const crosshairEl = $("crosshair");
  const unitSelect = $("unitSelect");
  const colorInput = $("colorInput");
  const widthInput = $("widthInput");
  const dimensionEndStyle = $("dimensionEndStyle");
  const dimensionEndSize = $("dimensionEndSize");
  const dimensionExtensionLines = $("dimensionExtensionLines");
  const fontSizeInput = $("fontSizeInput");
  const snapToggle = $("snapToggle");
  const crosshairToggle = $("crosshairToggle");
  const zoomLabel = $("zoomLabel");
  const textDialog = $("textDialog");
  const textDialogInput = $("textDialogInput");
  const textDialogSize = $("textDialogSize");
  const textDialogColor = $("textDialogColor");
  const textDialogBg = $("textDialogBg");
  const textDialogTitle = $("textDialogTitle");
  let editingTextId = null;
  const valueDialog = $("valueDialog");
  const vInput = $("valueDialogInput");
  const vUnit = $("valueDialogUnit");
  const vMic = $("valueDialogMic");
  const vHint = $("valueDialogHint");
  const optAutoConfirm = $("optAutoConfirm");
  const optAutoMic = $("optAutoMic");
  const actionDialog = $("actionDialog");
  const saveDialog = $("saveDialog");
  const projectsDialog = $("projectsDialog");
  const insertImageInput = $("insertImageInput");
  const cropPreviewCanvas = $("cropPreviewCanvas");
  const cropPreviewCtx = cropPreviewCanvas.getContext("2d");
  const freeResizeToggle = $("freeResizeToggle");
  let cropDrag = null;
  const buttons = {
    undo: $("undo"), redo: $("redo"), export: $("exportImage"), exportProject: $("exportProject"),
    clear: $("clearAll"), save: $("saveProject"), load: $("loadProject"), importProject: $("importProject")
  };

  // ---------- Zustand ----------
  const MAX_SIDE = 2000;        // längste Foto-Seite im Editor
  const SKETCH_DEFAULT_W = 4000; // große Skizzenfläche (Haus 1:1 bei feinem Maßstab + Zoom)
  const SKETCH_DEFAULT_H = 3000;
  const CROSSHAIR_OFFSET_Y = -52;
  let photoLoaded = false;
  let canvasMode = "photo"; // photo | sketch
  let sketchScalePxPerMm = 0; // 0 = kein Skizzen-Maßstab; gesetzt nach maßbasiertem Rechteck
  let sketchCanvasW = SKETCH_DEFAULT_W;
  let sketchCanvasH = SKETCH_DEFAULT_H;
  let polylineDraft = null;   // laufende Polylinie { id, type, points, color, width, closed }
  let photoData = null;         // verkleinertes JPEG (Data-URL) -> wird im Projekt gespeichert
  let originalBlob = null;      // unverändertes Originalfoto (wird zusätzlich getrennt in IndexedDB abgelegt)
  let projectId = null;         // Projekt-ID (Schlüssel in der Datenbank – nie der Name)
  let projectCreated = null;
  let saveState = "idle";       // idle | pending | saved | error
  let redoStack = [];
  let tool = "select";
  let selectedId = null;
  let anglePoints = [];
  let measures = [];
  let drawings = [];
  let selectedDrawingId = null;
  // Foto- und Skizzen-Ebene getrennt: Objekte tragen layer "photo" | "sketch"
  const currentLayer = () => (canvasMode === "sketch" ? "sketch" : "photo");
  const layerOf = (o) => (o && o.layer === "sketch" ? "sketch" : "photo");
  const visibleMeasures = () => measures.filter((m) => layerOf(m) === currentLayer());
  const visibleDrawings = () => drawings.filter((d) => layerOf(d) === currentLayer());
  let cropSourceImage = null;
  let cropSourceName = "";
  const drawingImageCache = new Map();
  let history = [];
  let nextId = 1;
  let activeDrawing = null;
  let pointerStart = null;
  let preSnap = null;           // Zustand vor der laufenden Geste (für Rückgängig)
  let snapPoint = null;
  let lastTap = { id: null, time: 0 };
  let longPressTimer = null;
  let pressInfo = null;
  let pendingFocus = false;
  let pendingTextPoint = null;
  let actionMeasureId = null;
  let actionColorRemembered = false;
  let exportFiles = null;
  let exportUrls = [];

  // Zoom / Schieben
  let viewScale = 1, viewOffsetX = 0, viewOffsetY = 0, fitScale = 1;
  const pointers = new Map();
  let lastPinchDist = 0, lastPinchMid = null, multiTouchMode = false;

  // ---------- Größen ----------
  // Handles, Treffer-Toleranz und Einrasten sind in BILDSCHIRM-Pixeln angegeben,
  // damit sie auf dem Handy immer gut treffbar sind – egal wie weit das Foto verkleinert angezeigt wird.
  const totalScale = () => fitScale * viewScale;
  const scr = (n) => n / totalScale();
  // Linienstärke und Schrift sind relativ zur Bildgröße (Regler-Einheiten × K)
  const K = () => Math.max(canvas.width, canvas.height) / 560;
  const getFontSize = () => Number(fontSizeInput.value) || 24;
  const fmt = (v) => String(v ?? "").replace(".", ",");
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- Status ----------
  const setStatus = (t) => { $("saveStatus").textContent = t; };
  const hasWork = () => measures.length > 0 || drawings.length > 0;
  const isLocked = (m) => !!(m && m.locked);

  // Kurze Meldung unten mit optionaler Aktion (z. B. „Rückgängig“)
  let toastTimer = null;
  function toast(text, actionLabel, action, ms) {
    const el = $("toast");
    el.replaceChildren();
    const span = document.createElement("span");
    span.textContent = text;
    el.append(span);
    if (actionLabel && action) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = actionLabel;
      b.addEventListener("click", () => { el.hidden = true; action(); });
      el.append(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 5000);
  }

  // Speicherstatus oben rechts: immer sichtbar, ob die Arbeit gesichert ist
  let saveError = "";
  function setSaveState(state, errText) {
    saveState = state;
    saveError = errText || "";
    const el = $("saveBadge");
    el.dataset.state = state;
    el.textContent = { idle: "", pending: "… speichert", saved: "✓ gesichert", error: "⚠ nicht gesichert" }[state] || "";
    el.title = saveError;
    if (state === "error") setStatus(saveError);
  }

  // ---------- Verlauf ----------
  // Große eingefügte Bilder nicht bei jeder Verlaufsaktion erneut als JSON serialisieren.
  // Bilddaten bleiben im Speicher referenziert; der Verlauf speichert nur ihre ID.
  const historyImageData = new Map();
  const snapshot = () => {
    const savedDrawings = drawings.map((d) => {
      if (d.type !== "image" || !d.imageData) return d;
      const token = String(d.id);
      historyImageData.set(token, d.imageData);
      return { ...d, imageData: undefined, __fmHistoryImageToken: token };
    });
    return JSON.stringify({ measures, drawings: savedDrawings, selectedId, selectedDrawingId, nextId });
  };
  function pushHistory(s) {
    history.push(s);
    if (history.length > 60) history.shift();
    redoStack = []; // nach einer neuen Änderung gibt es nichts mehr zu wiederholen
    updateHistoryButtons();
  }
  const remember = () => pushHistory(snapshot());
  function updateHistoryButtons() {
    buttons.undo.disabled = history.length === 0;
    buttons.redo.disabled = redoStack.length === 0;
  }
  function restoreSnapshot(str) {
    const s = JSON.parse(str);
    measures = s.measures;
    drawings = (s.drawings || []).map((d) => {
      if (!d.__fmHistoryImageToken) return d;
      const restored = { ...d, imageData: historyImageData.get(d.__fmHistoryImageToken) };
      delete restored.__fmHistoryImageToken;
      return restored;
    });
    selectedId = s.selectedId;
    selectedDrawingId = s.selectedDrawingId || null;
    nextId = s.nextId || nextId;
    snapPoint = null;
  }
  function undo() {
    const last = history.pop();
    if (!last) return;
    redoStack.push(snapshot());
    restoreSnapshot(last);
    updateHistoryButtons();
    refresh();
  }
  function redo() {
    const next = redoStack.pop();
    if (!next) return;
    history.push(snapshot());
    restoreSnapshot(next);
    updateHistoryButtons();
    refresh();
  }

  function setReady(ready) {
    buttons.export.disabled = !ready;
    buttons.exportProject.disabled = !ready;
    buttons.clear.disabled = !ready;
    buttons.save.disabled = !ready;
    updateHistoryButtons();
  }

  // Nach jeder Änderung: Liste + Zeichnung neu, Zwischenspeicher planen
  function refresh() {
    renderMeasureList();
    draw();
    scheduleAutosave();
  }

  // ---------- Zoom ----------
  function computeFitScale() {
    if (!photoLoaded) return 1;
    const wrap = canvasWrap.getBoundingClientRect();
    return Math.min(wrap.width / canvas.width, wrap.height / canvas.height);
  }
  function applyViewTransform() {
    if (!photoLoaded) return;
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";
    canvas.style.transform = `translate(calc(-50% + ${viewOffsetX}px), calc(-50% + ${viewOffsetY}px)) scale(${totalScale()})`;
    zoomLabel.textContent = Math.round(viewScale * 100) + " %";
  }
  function fitToView() {
    if (!photoLoaded) return;
    fitScale = computeFitScale();
    viewScale = 1; viewOffsetX = 0; viewOffsetY = 0;
    applyViewTransform();
  }
  function setZoom(next, midX, midY) {
    const prev = viewScale;
    viewScale = Math.max(0.4, Math.min(8, next));
    if (midX != null && midY != null && prev > 0) {
      const wrap = canvasWrap.getBoundingClientRect();
      const cx = midX - wrap.left - wrap.width / 2;
      const cy = midY - wrap.top - wrap.height / 2;
      viewOffsetX = cx - (cx - viewOffsetX) * (viewScale / prev);
      viewOffsetY = cy - (cy - viewOffsetY) * (viewScale / prev);
    }
    applyViewTransform();
    draw(); // Handles haben feste Bildschirmgröße -> neu zeichnen
  }
  $("zoomIn").addEventListener("click", () => setZoom(viewScale * 1.25));
  $("zoomOut").addEventListener("click", () => setZoom(viewScale / 1.25));
  $("zoomReset").addEventListener("click", () => { fitToView(); draw(); });
  window.addEventListener("resize", () => {
    if (photoLoaded) { fitScale = computeFitScale(); applyViewTransform(); draw(); }
  });

  // ---------- Zeichnen ----------
  function hideEmptyState() { emptyState.hidden = true; emptyState.classList.add("is-hidden"); emptyState.style.display = "none"; }

  // Foto in den Editor übernehmen (verkleinert auf MAX_SIDE)
  function setBaseFromImage(img) {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    const s = Math.min(1, MAX_SIDE / Math.max(nw, nh));
    baseCanvas.width = canvas.width = Math.max(1, Math.round(nw * s));
    baseCanvas.height = canvas.height = Math.max(1, Math.round(nh * s));
    canvasWrap.style.setProperty("--photo-aspect", `${baseCanvas.width} / ${baseCanvas.height}`);
    baseCanvas.getContext("2d").drawImage(img, 0, 0, baseCanvas.width, baseCanvas.height);
    photoLoaded = true;
    canvas.style.display = "block";
    hideEmptyState();
    fitToView();
  }

  function ensureSketchCanvasSize() {
    // Große, vom Foto unabhängige Skizzenfläche – Zoom/Pan erlaubt „Haus 1:1“-Arbeitsweise
    const w = Math.max(SKETCH_DEFAULT_W, sketchCanvasW || SKETCH_DEFAULT_W);
    const h = Math.max(SKETCH_DEFAULT_H, sketchCanvasH || SKETCH_DEFAULT_H);
    sketchCanvasW = w;
    sketchCanvasH = h;
    if (baseCanvas.width !== w || baseCanvas.height !== h) {
      baseCanvas.width = canvas.width = w;
      baseCanvas.height = canvas.height = h;
      canvasWrap.style.setProperty("--photo-aspect", `${w} / ${h}`);
    }
    const g = baseCanvas.getContext("2d");
    g.save();
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.restore();
    photoLoaded = true;
    canvas.style.display = "block";
    hideEmptyState();
  }

  function setSketchBackground() {
    // Auswahl der anderen Ebene zurücksetzen
    selectedId = null;
    selectedDrawingId = null;
    polylineDraft = null;
    syncPolylineActions();
    ensureSketchCanvasSize();
    canvasMode = "sketch";
    document.body.classList.add("sketch-mode");
    $("toggleSketchView").textContent = "▧ Fotoansicht";
    $("toggleSketchView").disabled = false;
    $("sketchModeHint").textContent = "Skizzenansicht: eigene Ebene, getrennt vom Foto. Große Zeichenfläche – zoomen und schieben. Maße auf dem Foto bleiben unverändert.";
    fitToView();
    updateSketchScaleHint();
    renderMeasureList();
    draw();
  }

  function setPhotoBackground() {
    selectedId = null;
    selectedDrawingId = null;
    polylineDraft = null;
    syncPolylineActions();
    const img = new Image();
    img.onload = () => {
      setBaseFromImage(img);
      canvasMode = "photo";
      document.body.classList.remove("sketch-mode");
      $("toggleSketchView").textContent = "✎ Skizzenansicht";
      $("toggleSketchView").disabled = false;
      $("sketchModeHint").textContent = "Fotoansicht: nur Foto-Maße und -Zeichnungen. Die Skizzen-Ebene ist getrennt und bleibt erhalten.";
      updateSketchScaleHint();
      renderMeasureList();
      draw();
      scheduleAutosave();
    };
    img.onerror = () => toast("Fotoansicht konnte nicht geladen werden.");
    img.src = photoData;
  }

  function paint(g, forExport) {
    const k = K();
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.drawImage(baseCanvas, 0, 0);
    // Nur Objekte der aktuellen Ebene (Foto vs. Skizze)
    const layerDrawings = visibleDrawings();
    const layerMeasures = visibleMeasures();
    layerDrawings.forEach((d) => drawShape(g, d, k));
    if (!forExport && selectedDrawingId) {
      const sd = layerDrawings.find((d) => d.id === selectedDrawingId && (d.type === "image" || d.type === "text"));
      if (sd) {
        g.save(); g.strokeStyle = "#1682d5"; g.lineWidth = scr(2); g.setLineDash([scr(5), scr(4)]);
        if (sd.type === "image") {
          g.strokeRect(sd.x1, sd.y1, sd.x2 - sd.x1, sd.y2 - sd.y1);
          g.setLineDash([]); drawHandle(g, sd.x2, sd.y2);
        } else {
          const fs = (sd.fontSize || getFontSize() + 4) * k;
          g.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
          const tw = g.measureText(sd.text || "Notiz").width;
          const pad = scr(8);
          g.strokeRect(sd.x1-pad, sd.y1-fs-pad, tw+pad*2, fs+pad*2);
        }
        g.restore();
      }
    }
    if (!forExport && selectedDrawingId) {
      const sd = layerDrawings.find((d) => d.id === selectedDrawingId && !["image", "text"].includes(d.type));
      if (sd) {
        let x1, y1, x2, y2;
        if ((sd.type === "freehand" || sd.type === "polyline") && sd.points && sd.points.length) {
          x1 = Math.min(...sd.points.map(p => p.x)); y1 = Math.min(...sd.points.map(p => p.y));
          x2 = Math.max(...sd.points.map(p => p.x)); y2 = Math.max(...sd.points.map(p => p.y));
        } else if (sd.type === "circle") {
          const r = Math.hypot(sd.x2 - sd.x1, sd.y2 - sd.y1);
          x1 = sd.x1 - r; y1 = sd.y1 - r; x2 = sd.x1 + r; y2 = sd.y1 + r;
        } else { x1 = Math.min(sd.x1, sd.x2); y1 = Math.min(sd.y1, sd.y2); x2 = Math.max(sd.x1, sd.x2); y2 = Math.max(sd.y1, sd.y2); }
        g.save(); g.strokeStyle = "#1682d5"; g.lineWidth = scr(1.5); g.setLineDash([scr(5), scr(4)]);
        g.strokeRect(x1-scr(8), y1-scr(8), Math.max(scr(16),x2-x1+scr(16)), Math.max(scr(16),y2-y1+scr(16)));
        g.setLineDash([]); drawHandle(g, x1, y1); drawHandle(g, x2, y2);
        if (sd.type === "rect") { const cx=(x1+x2)/2, cy=y1-scr(24); g.beginPath(); g.moveTo((x1+x2)/2,y1); g.lineTo(cx,cy); g.stroke(); drawHandle(g,cx,cy); }
        if (sd.type === "line") { drawHandle(g,sd.x1,sd.y1); drawHandle(g,sd.x2,sd.y2); }
        if (sd.type === "circle") { drawHandle(g, sd.x1, sd.y1); drawHandle(g, sd.x2, sd.y2); }
        if (sd.type === "polyline" && sd.points) sd.points.forEach((pt) => drawHandle(g, pt.x, pt.y));
        g.restore();
      }
    }
    // Laufende Polylinie (noch nicht abgeschlossen)
    if (!forExport && polylineDraft && polylineDraft.points && polylineDraft.points.length) {
      drawShape(g, polylineDraft, k);
      g.save();
      g.fillStyle = "#1682d5";
      polylineDraft.points.forEach((pt) => { g.beginPath(); g.arc(pt.x, pt.y, scr(4), 0, Math.PI * 2); g.fill(); });
      g.restore();
    }
    layerMeasures.forEach((m) => drawMeasure(g, m, k, forExport));
    if (forExport) return;
    if (tool === "angle" && anglePoints.length) {
      g.save(); g.strokeStyle = colorInput.value; g.fillStyle = colorInput.value; g.lineWidth = 2 * k;
      g.beginPath(); anglePoints.forEach((pt,i) => i ? g.lineTo(pt.x,pt.y) : g.moveTo(pt.x,pt.y)); g.stroke();
      anglePoints.forEach(pt => { g.beginPath(); g.arc(pt.x,pt.y,4*k,0,Math.PI*2); g.fill(); }); g.restore();
    }
    if (activeDrawing && !/^(move-|text-place|angle-point)/.test(activeDrawing.type)) {
      if (activeDrawing.type === "measure" || activeDrawing.type === "reference") drawMeasurePreview(g, activeDrawing, k);
      else drawShape(g, activeDrawing, k);
    }
    if (snapPoint) {
      g.save();
      g.beginPath();
      g.arc(snapPoint.x, snapPoint.y, scr(12), 0, Math.PI * 2);
      g.fillStyle = "rgba(0,200,83,0.35)";
      g.fill();
      g.strokeStyle = "#00c853";
      g.lineWidth = scr(2.5);
      g.stroke();
      g.restore();
    }
  }
  function draw() { if (photoLoaded) paint(ctx, false); }

  function drawMeasurePreview(g, d, k) {
    g.save();
    g.strokeStyle = d.color || colorInput.value;
    g.lineWidth = 3 * k;
    g.lineCap = "round";
    g.setLineDash([6 * k, 4 * k]);
    g.beginPath();
    g.moveTo(d.x1, d.y1);
    g.lineTo(d.x2, d.y2);
    g.stroke();
    g.restore();
  }

  // Die Maßbeschriftung kann unabhängig von der Linie positioniert werden.
  // Technische Bemaßung: Text bleibt aufrecht. Vertikale Maße sind immer
  // von rechts lesbar; bei umgekehrter Zeichenrichtung kippt die Beschriftung nicht.
  function dimensionTextAngle(m) {
    let a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    while (a <= -Math.PI / 2) a += Math.PI;
    while (a > Math.PI / 2) a -= Math.PI;
    return a;
  }

  function measureLabelPosition(m) {
    if (m.type === "angle") {
      const a1 = Math.atan2(m.y2-m.y1,m.x2-m.x1), delta = angleRadians(m), mid = a1 + delta/2;
      const arm1 = Math.hypot(m.x2-m.x1,m.y2-m.y1), arm2 = Math.hypot(m.x3-m.x1,m.y3-m.y1);
      const radius = Math.max(18*K(),Math.min(48*K(),Math.min(arm1,arm2)*0.35));
      return {x:m.x1+Math.cos(mid)*(radius+12*K())+(m.labelOffsetX||0),y:m.y1+Math.sin(mid)*(radius+12*K())+(m.labelOffsetY||0)};
    }
    const fs=getFontSize()*K(), textAngle=dimensionTextAngle(m);
    const offset=fs*0.75;
    return {x:(m.x1+m.x2)/2+Math.sin(textAngle)*offset+(m.labelOffsetX||0),y:(m.y1+m.y2)/2-Math.cos(textAngle)*offset+(m.labelOffsetY||0)};
  }

  function drawMeasure(g, m, k, forExport) {
    const chosen = !forExport && m.id === selectedId;
    if (m.type === "angle") { drawAngleMeasure(g, m, k, chosen); return; }
    const color = m.color || "#ff3b30";
    const fs = getFontSize() * k;
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = (chosen ? 4 : 3) * k;
    g.lineCap = "round";
    const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);

    // Technische Maßhilfslinien: vom Endpunkt leicht über die Maßlinie hinaus.
    // Da die vorhandenen Messobjekte keine separaten Objektkanten speichern,
    // werden die Hilfslinien als kurze, einheitliche Verlängerungen dargestellt.
    const showExtensions = m.extensionLines !== undefined
      ? !!m.extensionLines
      : !!(dimensionExtensionLines && dimensionExtensionLines.checked);
    if (showExtensions) {
      const ax1 = Number.isFinite(m.baseX1) ? m.baseX1 : m.x1;
      const ay1 = Number.isFinite(m.baseY1) ? m.baseY1 : m.y1;
      const ax2 = Number.isFinite(m.baseX2) ? m.baseX2 : m.x2;
      const ay2 = Number.isFinite(m.baseY2) ? m.baseY2 : m.y2;
      g.save();
      g.strokeStyle = color;
      g.lineWidth = Math.max(1, 1.25 * k);
      g.globalAlpha = 0.82;
      [[ax1, ay1, m.x1, m.y1], [ax2, ay2, m.x2, m.y2]].forEach(([x1, y1, x2, y2]) => {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      });
      g.restore();
    }

    g.beginPath();
    g.moveTo(m.x1, m.y1);
    g.lineTo(m.x2, m.y2);
    g.stroke();
    const style = m.endStyle || dimensionEndStyle.value || "filled";
    const head = Math.max(5 * k, (Number(dimensionEndSize.value) || 10) * k);
    [[m.x1, m.y1, angle], [m.x2, m.y2, angle + Math.PI]].forEach(([x, y, a]) => {
      g.beginPath();
      if (style === "dot") {
        g.arc(x, y, Math.max(2 * k, head * 0.28), 0, Math.PI * 2);
        g.fill();
      } else if (style === "tick") {
        const dx = Math.cos(a + Math.PI / 4) * head * 0.75;
        const dy = Math.sin(a + Math.PI / 4) * head * 0.75;
        g.moveTo(x - dx, y - dy); g.lineTo(x + dx, y + dy); g.stroke();
      } else if (style === "slash") {
        const dx = Math.cos(a + Math.PI / 4) * head * 0.75;
        const dy = Math.sin(a + Math.PI / 4) * head * 0.75;
        g.moveTo(x - dx, y - dy); g.lineTo(x + dx, y + dy); g.stroke();
      } else {
        const spread = 0.48;
        g.moveTo(x, y);
        g.lineTo(x + head * Math.cos(a - spread), y + head * Math.sin(a - spread));
        g.lineTo(x + head * Math.cos(a + spread), y + head * Math.sin(a + spread));
        g.closePath();
        if (style === "open") { g.stroke(); }
        else if (style === "hollow") { g.fillStyle = "white"; g.fill(); g.stroke(); }
        else { g.fill(); }
      }
    });

    const label = `${m.labelPrefix ? m.labelPrefix + " " : ""}${m.isReference ? "REF · " : ""}${m.value ? fmt(m.value) : "?"}${m.unit || " mm"}${m.labelSuffix ? " " + m.labelSuffix : ""}`;
    g.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
    const tw = g.measureText(label).width;
    const th = fs + 6 * k;
    const offset = fs * 0.75;
    const textAngle = dimensionTextAngle(m);
    g.translate((m.x1 + m.x2) / 2 + (m.labelOffsetX || 0), (m.y1 + m.y2) / 2 + (m.labelOffsetY || 0));
    g.rotate(textAngle);
    if (m.textBg !== false) {
      g.fillStyle = "rgba(255,255,255,0.93)";
      g.fillRect(-tw / 2 - 5 * k, -offset - th / 2 - 2 * k, tw + 10 * k, th + 4 * k);
    }
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, 0, -offset);
    g.restore();

    if (chosen) {
      g.save();
      g.setLineDash([scr(5), scr(4)]);
      g.strokeStyle = "#1682d5";
      g.lineWidth = scr(1.5);
      const pad = scr(10);
      g.strokeRect(Math.min(m.x1, m.x2) - pad, Math.min(m.y1, m.y2) - pad, Math.abs(m.x2 - m.x1) + pad * 2, Math.abs(m.y2 - m.y1) + pad * 2);
      g.setLineDash([]);
      if (!m.locked) { drawHandle(g, m.x1, m.y1); drawHandle(g, m.x2, m.y2); }
      g.restore();
    }
  }

  function angleRadians(m) {
    const a1 = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const a2 = Math.atan2(m.y3 - m.y1, m.x3 - m.x1);
    return Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
  }

  function drawAngleMeasure(g, m, k, chosen) {
    const color = m.color || "#ff3b30";
    const fs = getFontSize() * k;
    const a1 = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const delta = angleRadians(m), a2 = a1 + delta;
    const arm1 = Math.hypot(m.x2-m.x1,m.y2-m.y1), arm2 = Math.hypot(m.x3-m.x1,m.y3-m.y1);
    const radius = Math.max(18*k, Math.min(48*k, Math.min(arm1,arm2)*0.35));
    g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = (chosen ? 4 : 3)*k; g.lineCap = "round";
    g.beginPath(); g.moveTo(m.x1,m.y1); g.lineTo(m.x2,m.y2); g.moveTo(m.x1,m.y1); g.lineTo(m.x3,m.y3); g.stroke();
    g.beginPath(); g.arc(m.x1,m.y1,radius,a1,a2,delta<0); g.stroke();
    const mid=a1+delta/2, tx=m.x1+Math.cos(mid)*(radius+12*k)+(m.labelOffsetX||0), ty=m.y1+Math.sin(mid)*(radius+12*k)+(m.labelOffsetY||0);
    const label=`${fmt(m.value)}°`; g.font=`bold ${fs}px system-ui, -apple-system, sans-serif`;
    const tw=g.measureText(label).width, th=fs+6*k;
    if (m.textBg !== false) { g.fillStyle="rgba(255,255,255,0.93)"; g.fillRect(tx-tw/2-5*k,ty-th/2-2*k,tw+10*k,th+4*k); }
    g.fillStyle=color; g.textAlign="center"; g.textBaseline="middle"; g.fillText(label,tx,ty);
    if (chosen) { drawHandle(g,m.x1,m.y1); drawHandle(g,m.x2,m.y2); drawHandle(g,m.x3,m.y3); }
    g.restore();
  }

  function drawHandle(g, x, y) {
    g.beginPath();
    g.arc(x, y, scr(15), 0, Math.PI * 2);
    g.fillStyle = "rgba(22, 130, 213, 0.25)";
    g.fill();
    g.strokeStyle = "#1682d5";
    g.lineWidth = scr(2.5);
    g.stroke();
    g.beginPath();
    g.arc(x, y, scr(5), 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.lineWidth = scr(1.5);
    g.stroke();
  }

  function drawShape(g, d, k) {
    if (!d) return;
    g.save();
    g.strokeStyle = d.color || colorInput.value;
    g.fillStyle = d.color || colorInput.value;
    g.lineWidth = (d.width || 4) * k;
    g.lineCap = "round";
    g.lineJoin = "round";
    if (d.type === "image") {
      let im = drawingImageCache.get(d.id);
      if ((!im || im.__fmData !== d.imageData) && d.imageData) {
        im = new Image(); im.__fmData = d.imageData; drawingImageCache.set(d.id, im);
        im.onload = () => draw(); im.onerror = () => { drawingImageCache.delete(d.id); };
        im.src = d.imageData;
      }
      if (im && im.complete && im.naturalWidth) g.drawImage(im, d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
    } else if (d.type === "freehand") {
      const pts = d.points;
      if (pts && pts.length > 1) {
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        // sanfte Kurve durch die Mittelpunkte
        for (let i = 1; i < pts.length - 1; i++) {
          g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        }
        g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        g.stroke();
      }
    } else if (d.type === "line") {
      g.beginPath();
      g.moveTo(d.x1, d.y1);
      g.lineTo(d.x2, d.y2);
      g.stroke();
    } else if (d.type === "circle") {
      const r = Math.hypot((d.x2 - d.x1), (d.y2 - d.y1));
      if (r > 0.5) {
        g.beginPath();
        g.arc(d.x1, d.y1, r, 0, Math.PI * 2);
        if (d.fill) {
          g.save();
          g.globalAlpha = Math.max(0, Math.min(1, Number(d.fillOpacity ?? 1)));
          g.fill();
          g.restore();
        }
        g.stroke();
      }
    } else if (d.type === "polyline") {
      const pts = d.points;
      if (pts && pts.length > 1) {
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        if (d.closed) g.closePath();
        g.stroke();
      } else if (pts && pts.length === 1) {
        g.beginPath();
        g.arc(pts[0].x, pts[0].y, Math.max(2, 3 * k), 0, Math.PI * 2);
        g.fill();
      }
    } else if (d.type === "rect") {
      const rx = Math.min(d.x1, d.x2), ry = Math.min(d.y1, d.y2);
      const rw = Math.abs(d.x2 - d.x1), rh = Math.abs(d.y2 - d.y1);
      const cx = rx + rw / 2, cy = ry + rh / 2;
      g.translate(cx, cy); g.rotate(d.rotation || 0);
      if (d.fill) { g.save(); g.globalAlpha = Math.max(0, Math.min(1, Number(d.fillOpacity ?? 1))); g.fillRect(-rw/2, -rh/2, rw, rh); g.restore(); }
      g.strokeRect(-rw/2, -rh/2, rw, rh);
    } else if (d.type === "text") {
      const fs = (d.fontSize || getFontSize() + 4) * k;
      g.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
      g.textAlign = "left";
      g.textBaseline = "alphabetic";
      const label = d.text || "Notiz";
      const tw = g.measureText(label).width;
      if (d.textBg) { g.fillStyle = "rgba(255,255,255,0.94)"; g.fillRect(d.x1-scr(4), d.y1-fs-scr(3), tw+scr(8), fs+scr(7)); }
      g.fillStyle = d.color || colorInput.value;
      g.fillText(label, d.x1, d.y1);
    }
    g.restore();
  }

  // ---------- Koordinaten ----------
  function pointFromClient(clientX, clientY) {
    const wrap = canvasWrap.getBoundingClientRect();
    const ts = totalScale();
    return {
      x: (clientX - (wrap.left + wrap.width / 2) - viewOffsetX) / ts + canvas.width / 2,
      y: (clientY - (wrap.top + wrap.height / 2) - viewOffsetY) / ts + canvas.height / 2
    };
  }
  const pointWithCrosshair = (e) => pointFromClient(e.clientX, e.clientY + (crosshairToggle.checked ? CROSSHAIR_OFFSET_Y : 0));

  function updateCrosshair(clientX, clientY) {
    if (!crosshairToggle.checked || !photoLoaded || multiTouchMode) { crosshairEl.hidden = true; return; }
    const wrap = canvasWrap.getBoundingClientRect();
    crosshairEl.hidden = false;
    crosshairEl.style.left = (clientX - wrap.left) + "px";
    crosshairEl.style.top = (clientY - wrap.top + CROSSHAIR_OFFSET_Y) + "px";
  }
  const hideCrosshair = () => { crosshairEl.hidden = true; };

  // ---------- Treffer ----------
  function distanceToSegment(p, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / len2)) : 0;
    return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
  }

  function findSnap(p, excludeId) {
    if (!snapToggle.checked) return null;
    let best = null, bestDist = scr(22);
    visibleMeasures().forEach((m) => {
      if (excludeId && m.id === excludeId) return;
      [{ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 }].forEach((c) => {
        const d = dist(p, c);
        if (d < bestDist) { bestDist = d; best = c; }
      });
    });
    visibleDrawings().forEach((d) => {
      if (excludeId && d.id === excludeId) return;
      if (d.type === "circle") {
        [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }].forEach((c) => {
          const dd = dist(p, c);
          if (dd < bestDist) { bestDist = dd; best = c; }
        });
      } else if (d.type === "polyline" && d.points) {
        d.points.forEach((c) => {
          const dd = dist(p, c);
          if (dd < bestDist) { bestDist = dd; best = c; }
        });
      } else if (d.type === "line" || d.type === "rect") {
        [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }].forEach((c) => {
          const dd = dist(p, c);
          if (dd < bestDist) { bestDist = dd; best = c; }
        });
      }
    });
    return best;
  }

  function hitMeasure(p) {
    const endTol = scr(26), lineTol = scr(20);
    const layerMs = visibleMeasures();
    // Beschriftung vor der Linie prüfen, damit sie unabhängig verschoben werden kann.
    for (let i=layerMs.length-1;i>=0;i--) {
      const m=layerMs[i], pos=measureLabelPosition(m);
      const label=m.type==="angle" ? `${fmt(m.value)}°` : `${m.labelPrefix ? m.labelPrefix + " " : ""}${m.isReference ? "REF · " : ""}${m.value ? fmt(m.value) : "?"}${m.unit || " mm"}${m.labelSuffix ? " " + m.labelSuffix : ""}`;
      const fs=getFontSize()*K(); ctx.save(); ctx.font=`bold ${fs}px system-ui, -apple-system, sans-serif`;
      const halfW=ctx.measureText(label).width/2+scr(12), halfH=fs/2+scr(10); ctx.restore();
      if(Math.abs(p.x-pos.x)<=halfW && Math.abs(p.y-pos.y)<=halfH) return {measure:m,endpoint:0,label:true};
    }
    // Endpunkte nur beim ausgewählten (sichtbare Griffe), nicht gesperrten Maß – schützt vor versehentlichem Verziehen
    const sel = layerMs.find((x) => x.id === selectedId);
    if (sel && !sel.locked) {
      if (dist(p, { x: sel.x1, y: sel.y1 }) < endTol) return { measure: sel, endpoint: 1 };
      if (dist(p, { x: sel.x2, y: sel.y2 }) < endTol) return { measure: sel, endpoint: 2 };
      if (sel.type === "angle" && dist(p, { x: sel.x3, y: sel.y3 }) < endTol) return { measure: sel, endpoint: 3 };
    }
    for (let i = layerMs.length - 1; i >= 0; i--) {
      const m = layerMs[i];
      if (distanceToSegment(p, m.x1, m.y1, m.x2, m.y2) < lineTol || (m.type === "angle" && distanceToSegment(p, m.x1, m.y1, m.x3, m.y3) < lineTol)) return { measure: m, endpoint: 0 };
    }
    return null;
  }

  function hitDrawing(p) {
    const tol = scr(20), k = K();
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      if (layerOf(d) !== currentLayer()) continue;
      if (d.type === "image") {
        const x1 = Math.min(d.x1, d.x2), y1 = Math.min(d.y1, d.y2), x2 = Math.max(d.x1, d.x2), y2 = Math.max(d.y1, d.y2);
        if (p.x >= x1 - tol && p.x <= x2 + tol && p.y >= y1 - tol && p.y <= y2 + tol) return i;
      } else if (d.type === "freehand" && d.points && d.points.length) {
        // Treffer entlang der gesamten Linie (nicht nur an Einzelpunkten); etwas großzügiger für Touch
        const fhTol = scr(28);
        let hit = false;
        for (let j = 0; j < d.points.length - 1; j++) {
          if (distanceToSegment(p, d.points[j].x, d.points[j].y, d.points[j + 1].x, d.points[j + 1].y) < fhTol) { hit = true; break; }
        }
        if (!hit && d.points.length === 1 && dist(p, d.points[0]) < fhTol) hit = true;
        if (hit) return i;
      } else if (d.type === "line") {
        if (distanceToSegment(p, d.x1, d.y1, d.x2, d.y2) < tol) return i;
      } else if (d.type === "circle") {
        const r = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
        const dCenter = Math.hypot(p.x - d.x1, p.y - d.y1);
        if (Math.abs(dCenter - r) < tol || dCenter < Math.min(tol, r * 0.35)) return i;
      } else if (d.type === "polyline" && d.points && d.points.length) {
        const plTol = scr(24);
        if (d.points.length === 1 && dist(p, d.points[0]) < plTol) return i;
        for (let j = 0; j < d.points.length - 1; j++) {
          if (distanceToSegment(p, d.points[j].x, d.points[j].y, d.points[j + 1].x, d.points[j + 1].y) < plTol) return i;
        }
        if (d.closed && d.points.length > 2 && distanceToSegment(p, d.points[d.points.length - 1].x, d.points[d.points.length - 1].y, d.points[0].x, d.points[0].y) < plTol) return i;
      } else if (d.type === "rect") {
        const x1 = Math.min(d.x1, d.x2), y1 = Math.min(d.y1, d.y2), x2 = Math.max(d.x1, d.x2), y2 = Math.max(d.y1, d.y2);
        const cx=(x1+x2)/2, cy=(y1+y2)/2, a=-(d.rotation||0), dx=p.x-cx, dy=p.y-cy;
        const q={x:cx+dx*Math.cos(a)-dy*Math.sin(a),y:cy+dx*Math.sin(a)+dy*Math.cos(a)};
        const near = q.x >= x1-tol && q.x <= x2+tol && q.y >= y1-tol && q.y <= y2+tol && (Math.abs(q.x-x1)<tol || Math.abs(q.x-x2)<tol || Math.abs(q.y-y1)<tol || Math.abs(q.y-y2)<tol);
        if (near || (q.x >= x1 && q.x <= x2 && q.y >= y1 && q.y <= y2) || (Math.abs(p.x-cx)<tol && Math.abs(p.y-(y1-scr(24)))<tol && selectedDrawingId===d.id)) return i;
      } else if (d.type === "text") {
        const fs = (d.fontSize || getFontSize() + 4) * k;
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        const tw = ctx.measureText(d.text || "Notiz").width;
        if (p.x >= d.x1 - tol && p.x <= d.x1 + tw + tol && p.y >= d.y1 - fs - tol && p.y <= d.y1 + tol) return i;
      }
    }
    return -1;
  }

  // ---------- Maßliste ----------
  function renderMeasureList() {
    const list = $("measureList");
    // Fokus zuerst lösen: löst ein anstehendes „change“ aus, bevor die Zeilen ersetzt werden (verhindert Wiedereintritt)
    const ae = document.activeElement;
    if (ae && ae !== document.body && list.contains(ae)) { try { ae.blur(); } catch (_) {} }
    list.replaceChildren();
    const layerMs = visibleMeasures();
    if (!layerMs.length) {
      const p = document.createElement("p");
      p.className = "empty-list";
      p.textContent = canvasMode === "sketch" ? "Noch keine Maßlinien in der Skizze." : "Noch keine Maßlinien auf dem Foto.";
      list.append(p);
      return;
    }
    layerMs.forEach((m, index) => {
      const row = document.createElement("div");
      row.className = "measure-item" + (m.id === selectedId ? " selected" : "");

      const title = document.createElement("button");
      title.type = "button";
      title.className = "secondary";
      title.textContent = `${m.locked ? "🔒 " : ""}${m.isReference ? "Referenz" : (m.type === "angle" ? "Winkel" : "Maß")} ${index + 1}${m.autoCalculated ? " · berechnet" : ""}`;
      title.addEventListener("click", () => { selectedId = m.id; $("textBgToggle").checked = m.textBg !== false; setTool("select"); renderMeasureList(); draw(); });

      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.placeholder = "Wert";
      input.value = fmt(m.value);
      input.readOnly = isLocked(m);
      input.addEventListener("change", () => {
        if (m.locked) return;
        remember();
        const p = speech.parseNumber(input.value, { typed: true });
        m.value = p.value;
        if (p.unit) m.unit = p.unit;
        m.autoCalculated = false;
        if (m.isReference) { calculateEmptyMeasuresFromReference(); }
        refresh();
      });

      const unit = document.createElement("span");
      unit.className = "unit-label";
      unit.textContent = (m.unit || " mm").trim();

      const mic = document.createElement("button");
      mic.type = "button";
      mic.className = "mic-btn";
      mic.textContent = "🎤";
      mic.addEventListener("click", () => openValueDialog(m.id, { mic: true }));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "danger delete-measure";
      del.textContent = "✕";
      del.disabled = isLocked(m);
      mic.disabled = isLocked(m);
      del.addEventListener("click", () => deleteMeasure(m.id));

      row.append(title, input, unit, mic, del);
      list.append(row);
    });
  }

  function deleteMeasure(id) {
    const m = measures.find((x) => x.id === id);
    if (!m) return;
    if (m.locked) { toast("🔒 Gesperrt – erst entsperren (lang drücken › Entsperren)."); return; }
    remember();
    measures = measures.filter((x) => x.id !== id);
    if (selectedId === id) selectedId = null;
    refresh();
    toast("Maß gelöscht.", "Rückgängig", undo);
  }

  function setTool(name) {
    if (tool === "angle" && name !== "angle" && anglePoints.length) { anglePoints = []; draw(); }
    if (tool === "polyline" && name !== "polyline" && polylineDraft) {
      // Beim Werkzeugwechsel offene Polylinie verwerfen
      polylineDraft = null;
      syncPolylineActions();
    }
    tool = name;
    document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
    if ((name === "measure" || name === "reference") && unitSelect.value === "°") unitSelect.value = " mm";
    if (name === "angle") setStatus("Winkel: dreimal tippen – Scheitelpunkt, erster Schenkel, zweiter Schenkel.");
    if (name === "reference") setStatus("Referenzmaß: bekannte Strecke ziehen und echten Wert eingeben. Es gilt für dieselbe Bildebene.");
    if (name === "circle") setStatus("Kreis: Mittelpunkt tippen und Radius ziehen.");
    if (name === "polyline") setStatus("Polylinie: nacheinander Punkte tippen, dann „Polylinie fertig“.");
    syncPolylineActions();
    // Füllregler immer nutzbar (Vorgabe für neue Rechtecke bzw. Änderung des ausgewählten)
    if (typeof syncRectFillControls === "function") {
      const sel = drawings.find((x) => x.id === selectedDrawingId && x.type === "rect");
      syncRectFillControls(sel || null);
    }
  }

  function syncPolylineActions() {
    const bar = $("polylineActions");
    if (!bar) return;
    const active = tool === "polyline";
    bar.hidden = !active;
    if (active) {
      // Zeichenfläche in den Blick rücken (unter der Zoom-Leiste bleiben die Buttons)
      try { canvasWrap.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {}
      const finish = $("polylineFinish");
      if (finish) finish.disabled = !(polylineDraft && polylineDraft.points && polylineDraft.points.length >= 2);
    }
  }

  // ---------- Referenzmaß / Maßstab ----------
  const unitFactorMm = (unit) => ({ " mm": 1, " cm": 10, " m": 1000 })[unit] || 1;
  const referenceMeasure = () => visibleMeasures().find((m) => m.isReference && Number(String(m.value).replace(",", ".")) > 0 && m.type !== "angle");
  function updateSketchScaleHint() {
    const el = $("sketchScaleHint");
    if (!el) return;
    if (canvasMode === "sketch" && sketchScalePxPerMm > 0 && Number.isFinite(sketchScalePxPerMm)) {
      el.hidden = false;
      el.textContent = `Skizzen-Maßstab aktiv · neue Maßlinien in mm (${(1 / sketchScalePxPerMm).toFixed(2)} mm/px) · Zoom/Pan für große Pläne`;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }
  function calculatedValueFor(m, unit) {
    const px = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
    if (!(px >= 0)) return null;
    // 1) Foto-Referenzmaß hat Vorrang
    const ref = referenceMeasure();
    if (ref && m !== ref) {
      const refPx = Math.hypot(ref.x2 - ref.x1, ref.y2 - ref.y1);
      const refValue = Number(String(ref.value).replace(",", "."));
      if (refPx > 0 && refValue > 0) {
        const lengthMm = (px / refPx) * refValue * unitFactorMm(ref.unit);
        return (lengthMm / unitFactorMm(unit || " mm")).toFixed(1).replace(/\.0$/, "");
      }
    }
    // 2) Skizzen-Maßstab nur in der Skizzenansicht (nach maßbasiertem Rechteck)
    if (canvasMode === "sketch" && sketchScalePxPerMm > 0 && Number.isFinite(sketchScalePxPerMm)) {
      const lengthMm = px / sketchScalePxPerMm;
      return (lengthMm / unitFactorMm(unit || " mm")).toFixed(1).replace(/\.0$/, "");
    }
    return null;
  }
  function recalculateAutomaticMeasures() {
    visibleMeasures().forEach((m) => {
      if (m.type !== "angle" && !m.isReference && m.autoCalculated) {
        const value = calculatedValueFor(m, m.unit || unitSelect.value);
        if (value !== null) m.value = value;
      }
    });
  }
  function calculateEmptyMeasuresFromReference() {
    visibleMeasures().forEach((m) => {
      if (m.type !== "angle" && !m.isReference && !String(m.value || "").trim()) {
        const value = calculatedValueFor(m, m.unit || unitSelect.value);
        if (value !== null) { m.value = value; m.autoCalculated = true; }
      }
    });
    recalculateAutomaticMeasures();
  }

  // ---------- 2D-Skizzenmodus ----------
  $("newSketch").addEventListener("click", async () => {
    if (!(await leaveCurrentProject())) return;
    resetState();
    projectId = storage.newId(); projectCreated = new Date().toISOString(); originalBlob = null;
    $("projectName").value = "2D-Skizze " + new Date().toLocaleDateString("de-DE");
    sketchCanvasW = SKETCH_DEFAULT_W;
    sketchCanvasH = SKETCH_DEFAULT_H;
    sketchScalePxPerMm = 0;
    // Minimales Platzhalter-Foto nur für Projektstruktur; Skizzenfläche ist unabhängig und größer
    const blank = document.createElement("canvas"); blank.width = 16; blank.height = 16;
    const bg = blank.getContext("2d"); bg.fillStyle = "#ffffff"; bg.fillRect(0, 0, 16, 16);
    photoData = blank.toDataURL("image/png");
    ensureSketchCanvasSize();
    canvasMode = "sketch";
    document.body.classList.add("sketch-mode");
    $("toggleSketchView").textContent = "▧ Fotoansicht";
    $("toggleSketchView").disabled = true; // kein echtes Foto
    $("photoStatus").textContent = "Leere 2D-Skizze";
    $("sketchModeHint").textContent = "Große Skizzenfläche (4000×3000 px). Zoomen & schieben – Maßstab per Rechteck setzen. Eigene Ebene, getrennt vom Foto.";
    updateSketchScaleHint();
    renderMeasureList();
    setReady(true);
    fitToView();
    refresh();
    setStatus("Neue 2D-Skizze angelegt. Maßbasiertes Rechteck setzt den Maßstab – Zeichnungen liegen nur in der Skizzen-Ebene.");
    flushAutosave();
  });

  $("toggleSketchView").addEventListener("click", () => {
    if (!photoLoaded || !photoData) return;
    if (canvasMode === "sketch") setPhotoBackground();
    else { setSketchBackground(); scheduleAutosave(); }
  });

  $("addDimensionRect").addEventListener("click", () => {
    if (!photoLoaded) { $("newSketch").click(); setStatus("Skizzenfläche wird angelegt. Tippe anschließend erneut auf „Rechteck erzeugen“."); return; }
    const wMm = Number($("sketchWidthMm").value), hMm = Number($("sketchHeightMm").value);
    if (!(wMm > 0 && hMm > 0 && Number.isFinite(wMm) && Number.isFinite(hMm))) { alert("Bitte Breite und Höhe größer als 0 mm eingeben."); return; }
    if (canvasMode !== "sketch") setSketchBackground();
    const marginX = canvas.width * 0.12, marginY = canvas.height * 0.14;
    const pxPerMm = Math.min((canvas.width - marginX * 2) / wMm, (canvas.height - marginY * 2) / hMm);
    if (!(pxPerMm > 0) || !Number.isFinite(pxPerMm)) { alert("Diese Maße passen nicht auf die Zeichenfläche."); return; }
    const rw = wMm * pxPerMm, rh = hMm * pxPerMm;
    const x1 = (canvas.width - rw) / 2, y1 = (canvas.height - rh) / 2;
    const x2 = x1 + rw, y2 = y1 + rh;
    remember();
    const id = nextId++;
    const col = colorInput.value || "#ff3b30";
    const endSt = dimensionEndStyle.value || "slash";
    const endSz = Number(dimensionEndSize.value) || 10;
    const extOn = dimensionExtensionLines.checked;
    drawings.push({ id, type: "rect", x1, y1, x2, y2, color: col, width: Number(widthInput.value) || 4, fill: false, fillOpacity: 1, rotation: 0, layer: "sketch" });
    const offset = Math.max(28, Math.min(canvas.width, canvas.height) * 0.045);
    // Breite: Maßlinie unter dem Rechteck, Hilfslinien von der Unterkante
    measures.push({
      id: nextId++, x1, y1: y2 + offset, x2, y2: y2 + offset,
      baseX1: x1, baseY1: y2, baseX2: x2, baseY2: y2,
      type: "linear", value: String(Math.round(wMm * 100) / 100), unit: " mm",
      color: col, textBg: true, locked: false, labelLocked: false,
      labelOffsetX: 0, labelOffsetY: 0, labelPrefix: "", labelSuffix: "",
      endStyle: endSt, endSize: endSz, extensionLines: extOn, layer: "sketch"
    });
    // Höhe: Maßlinie links vom Rechteck, Hilfslinien von der linken Kante
    measures.push({
      id: nextId++, x1: x1 - offset, y1, x2: x1 - offset, y2,
      baseX1: x1, baseY1: y1, baseX2: x1, baseY2: y2,
      type: "linear", value: String(Math.round(hMm * 100) / 100), unit: " mm",
      color: col, textBg: true, locked: false, labelLocked: false,
      labelOffsetX: 0, labelOffsetY: 0, labelPrefix: "", labelSuffix: "",
      endStyle: endSt, endSize: endSz, extensionLines: extOn, layer: "sketch"
    });
    sketchScalePxPerMm = pxPerMm; selectedDrawingId = id; selectedId = null;
    updateSketchScaleHint();
    refresh(); setStatus(`Rechteck erstellt: ${wMm} × ${hMm} mm. Maßstab aktiv – weitere Maßlinien werden in mm berechnet.`);
  });

  // Polylinie abschließen / abbrechen
  $("polylineFinish").addEventListener("click", () => {
    if (!polylineDraft || !polylineDraft.points || polylineDraft.points.length < 2) {
      toast("Mindestens zwei Punkte für eine Polylinie nötig.");
      return;
    }
    remember();
    const closed = !!( $("polylineClose") && $("polylineClose").checked );
    drawings.push({
      id: polylineDraft.id,
      type: "polyline",
      points: polylineDraft.points.map((q) => ({ x: q.x, y: q.y })),
      color: polylineDraft.color,
      width: polylineDraft.width || 4,
      closed,
      layer: currentLayer()
    });
    selectedDrawingId = polylineDraft.id;
    polylineDraft = null;
    syncPolylineActions();
    refresh();
    setStatus(closed ? "Geschlossene Polylinie erzeugt." : "Polylinie erzeugt.");
  });
  $("polylineCancel").addEventListener("click", () => {
    polylineDraft = null;
    syncPolylineActions();
    draw();
    setStatus("Polylinie verworfen.");
  });

  // ---------- Projekt: anlegen, sichern, öffnen ----------
  function resetState() {
    measures = []; drawings = []; history = []; redoStack = []; selectedId = null; selectedDrawingId = null; anglePoints = []; nextId = 1; snapPoint = null;
    activeDrawing = null; updateHistoryButtons();
  }

  const projectBaseName = () => ($("projectName").value.trim() || "fotomass").replace(/[^\p{L}\p{N}\-_]+/gu, "_").replace(/^_+|_+$/g, "") || "fotomass";

  // Kleines Vorschaubild (ohne Auswahl-Rahmen)
  function makeThumb() {
    const full = document.createElement("canvas");
    full.width = canvas.width; full.height = canvas.height;
    paint(full.getContext("2d"), true);
    const s = 180 / Math.max(canvas.width, canvas.height);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(canvas.width * s)); c.height = Math.max(1, Math.round(canvas.height * s));
    c.getContext("2d").drawImage(full, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.6);
  }

  // Projektdatensatz (Format 9): Maße, Zeichnungen und Beschriftungen sind eigene Daten – das Foto bleibt unverändert darunter
  function buildRecord(withThumb) {
    return {
      version: storage.FORMAT_VERSION, app: "FotoMaß",
      id: projectId, projectName: $("projectName").value, created: projectCreated, savedAt: new Date().toISOString(),
      photoData, canvasMode, sketchScalePxPerMm, sketchCanvasW, sketchCanvasH, measures, drawings, nextId,
      unit: unitSelect.value, snap: snapToggle.checked, fontSize: getFontSize(),
      dimensionEndStyle: dimensionEndStyle.value, dimensionEndSize: Number(dimensionEndSize.value) || 10,
      dimensionExtensionLines: dimensionExtensionLines.checked,
      thumb: withThumb ? makeThumb() : undefined, deletedAt: null
    };
  }

  // --- Automatisches Sichern (jede Änderung, 0,7 s verzögert; sofort beim Verlassen der App) ---
  let autosaveTimer = null;
  let saving = Promise.resolve();
  let rev = 0;
  function scheduleAutosave() {
    if (!photoLoaded || !projectId) return;
    rev++;
    setSaveState("pending");
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(flushAutosave, 700);
  }
  function flushAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    if (!photoLoaded || !projectId) return saving;
    const myRev = rev;
    const rec = buildRecord(true); // Stand sofort festhalten
    saving = saving
      .then(() => storage.putProject(rec))
      .then(() => { if (myRev === rev) setSaveState("saved"); })
      .catch((e) => setSaveState("error", storage.friendlyError(e)));
    return saving;
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveState === "pending") flushAutosave(); });
  window.addEventListener("pagehide", () => { if (saveState === "pending") flushAutosave(); });

  // Original unverändert und getrennt ablegen (Kopie der Bytes – nicht nur eine Dateireferenz)
  async function storeOriginal(file) {
    try {
      const copy = new Blob([await file.arrayBuffer()], { type: file.type || "image/jpeg" });
      await storage.putPhoto(projectId, copy);
      originalBlob = copy;
      return true;
    } catch (e) {
      originalBlob = file;
      toast("Originalfoto konnte nicht dauerhaft gespeichert werden: " + storage.friendlyError(e), null, null, 9000);
      return false;
    }
  }

  // Vor dem Wechsel zu einem anderen Foto/Projekt: aktuellen Stand sichern, bei Fehler nachfragen
  async function leaveCurrentProject() {
    if (!photoLoaded) return true;
    if (saveState === "pending" || saveState === "error") await flushAutosave();
    if (saveState === "error") {
      return confirm("Das aktuelle Projekt konnte nicht gesichert werden:\n" + saveError + "\n\nTrotzdem wechseln? Nicht gesicherte Änderungen gehen verloren.");
    }
    return true;
  }

  // Projekt im Editor anzeigen (Foto aus dem Datensatz, Original separat)
  function showProject(p, original) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resetState();
        setBaseFromImage(img);
        // Alte Projekte enthielten das volle Foto -> auf Editorgröße verkleinern
        const sameSize = (img.naturalWidth || img.width) === canvas.width;
        photoData = sameSize ? p.photoData : baseCanvas.toDataURL("image/jpeg", 0.9);
        canvasMode = p.canvasMode === "sketch" ? "sketch" : "photo";
        sketchScalePxPerMm = Number(p.sketchScalePxPerMm) > 0 ? Number(p.sketchScalePxPerMm) : 0;
        sketchCanvasW = Number(p.sketchCanvasW) > 0 ? Number(p.sketchCanvasW) : SKETCH_DEFAULT_W;
        sketchCanvasH = Number(p.sketchCanvasH) > 0 ? Number(p.sketchCanvasH) : SKETCH_DEFAULT_H;
        projectId = p.id; projectCreated = p.created;
        originalBlob = original || null;
        measures = p.measures; drawings = p.drawings; nextId = p.nextId;
        polylineDraft = null;
        if (canvasMode === "sketch") setSketchBackground();
        else { document.body.classList.remove("sketch-mode"); $("toggleSketchView").textContent = "✎ Skizzenansicht"; $("toggleSketchView").disabled = false; }
        $("projectName").value = p.projectName;
        $("photoStatus").textContent = p.projectName || "Projekt geöffnet";
        unitSelect.value = p.unit; snapToggle.checked = p.snap; fontSizeInput.value = p.fontSize;
        if (p.dimensionEndStyle) dimensionEndStyle.value = p.dimensionEndStyle;
        if (p.dimensionEndSize) dimensionEndSize.value = String(p.dimensionEndSize);
        dimensionExtensionLines.checked = p.dimensionExtensionLines !== false;
        updateSketchScaleHint();
        syncPolylineActions();
        renderMeasureList(); draw(); setReady(true);
        setSaveState("saved");
        resolve();
      };
      img.onerror = () => reject(new Error("Foto im Projekt nicht ladbar"));
      img.src = p.photoData;
    });
  }

  async function openProject(id) {
    try {
      const rec = await storage.getProject(id);
      const r = storage.parseProject(rec, { keepId: true });
      if (!r.project) { setStatus("Projekt nicht lesbar: " + r.error); return false; }
      let original = null;
      try { original = (await storage.getPhoto(id)) || null; } catch (_) {}
      await showProject(r.project, original);
      if (r.fromVersion < storage.FORMAT_VERSION) scheduleAutosave(); // ältere Projekte im neuen Format ablegen
      return true;
    } catch (e) {
      setStatus("Projekt konnte nicht geöffnet werden: " + (e && e.message ? e.message : e));
      return false;
    }
  }

  // Editor leeren (z. B. wenn das geöffnete Projekt in den Papierkorb kommt)
  function closeProject() {
    photoLoaded = false; canvasMode = "photo"; sketchScalePxPerMm = 0; projectId = null; photoData = null; originalBlob = null; polylineDraft = null;
    document.body.classList.remove("sketch-mode"); $("toggleSketchView").disabled = true;
    resetState();
    canvas.style.display = "none";
    emptyState.hidden = false; emptyState.classList.remove("is-hidden"); emptyState.style.display = "";
    $("projectName").value = ""; $("photoStatus").textContent = "Noch kein Foto";
    renderMeasureList(); setReady(false); setSaveState("idle");
  }

  // --- Neues Foto = neues Projekt (das bisherige bleibt in der Projektliste erhalten) ---
  function loadImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name || "")) {
      alert("Bitte eine Bilddatei wählen.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      if (!(await leaveCurrentProject())) return;
      resetState();
      canvasMode = "photo"; sketchScalePxPerMm = 0; document.body.classList.remove("sketch-mode"); polylineDraft = null;
      $("toggleSketchView").textContent = "✎ Skizzenansicht"; $("toggleSketchView").disabled = false;
      projectId = storage.newId();
      projectCreated = new Date().toISOString();
      $("projectName").value = "";
      setBaseFromImage(img);
      photoData = baseCanvas.toDataURL("image/jpeg", 0.9);
      $("photoStatus").textContent = file.name || "Foto geladen";
      originalBlob = file;
      renderMeasureList(); draw(); setReady(true);
      setStatus("Neues Projekt angelegt. Maßlinie ziehen – danach öffnet sich das Wert-Feld.");
      await storeOriginal(file);
      rev++;
      await flushAutosave();
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("Bild konnte nicht geladen werden (Format?)."); };
    img.src = url;
  }
  $("photoCamera").addEventListener("change", (e) => { loadImageFile(e.target.files && e.target.files[0]); e.target.value = ""; });
  $("photoGallery").addEventListener("change", (e) => { loadImageFile(e.target.files && e.target.files[0]); e.target.value = ""; });

  // "Jetzt sichern": sofort schreiben und Ergebnis anzeigen
  buttons.save.addEventListener("click", async () => {
    if (!photoLoaded) return;
    if (!$("projectName").value.trim()) $("projectName").value = "Projekt " + new Date().toLocaleDateString("de-DE");
    rev++;
    await flushAutosave();
    const est = await storage.estimate();
    if (saveState === "saved") {
      setStatus("✓ Gesichert um " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) +
        (est ? " · Browser-Speicher belegt: " + (est.usage / 1048576).toFixed(0) + " MB" : "") +
        ". Für ein Backup zusätzlich „In Dateien sichern“.");
    }
  });

  // --- Projektliste mit Papierkorb ---
  let showTrash = false;
  async function renderProjects() {
    const box = $("projectsList");
    box.replaceChildren();
    let items = [];
    try { items = await storage.listProjects(); }
    catch (e) { setStatus(storage.friendlyError(e)); }
    const trashCount = items.filter((i) => i.deletedAt).length;
    $("trashToggle").textContent = showTrash ? "‹ Zurück zu den Projekten" : "🗑 Papierkorb (" + trashCount + ")";
    const shown = items.filter((i) => !!i.deletedAt === showTrash);
    if (!shown.length) {
      const p = document.createElement("p");
      p.className = "empty-list";
      p.textContent = showTrash ? "Papierkorb ist leer. Gelöschte Projekte bleiben " + storage.TRASH_DAYS + " Tage erhalten." : "Noch keine Projekte. Mit Kamera oder Galerie beginnen.";
      box.append(p);
    }
    shown.forEach((it) => {
      const row = document.createElement("div");
      row.className = "project-row" + (it.id === projectId ? " current" : "");
      if (it.thumb && it.thumb.startsWith("data:image/")) {
        const im = document.createElement("img");
        im.src = it.thumb; im.alt = "";
        row.append(im);
      }
      const info = document.createElement("div");
      info.className = "project-info";
      const n = document.createElement("strong"); n.textContent = it.name;
      const d = document.createElement("small");
      d.textContent = (it.id === projectId ? "● geöffnet · " : "") + (it.savedAt ? new Date(it.savedAt).toLocaleString("de-DE") : "") + " · " + it.nMeasures + " Maße";
      info.append(n, d);
      row.append(info);

      if (!showTrash) {
        const open = document.createElement("button");
        open.type = "button"; open.textContent = "Öffnen"; open.disabled = it.id === projectId;
        open.addEventListener("click", async () => {
          if (!(await leaveCurrentProject())) return;
          closeDialog(projectsDialog);
          if (await openProject(it.id)) setStatus("Projekt „" + it.name + "“ geöffnet.");
        });
        const del = document.createElement("button");
        del.type = "button"; del.className = "danger delete-measure"; del.textContent = "🗑"; del.title = "In den Papierkorb";
        del.addEventListener("click", async () => {
          try {
            if (it.id === projectId) { if (saveState === "pending") await flushAutosave(); closeProject(); }
            const rec = await storage.getProject(it.id);
            rec.deletedAt = new Date().toISOString();
            await storage.putProject(rec);
            toast("„" + it.name + "“ im Papierkorb.", "Wiederherstellen", async () => {
              const r2 = await storage.getProject(it.id); r2.deletedAt = null; await storage.putProject(r2);
              if (!projectsDialog.hidden) renderProjects();
            }, 8000);
          } catch (e) { setStatus(storage.friendlyError(e)); }
          renderProjects();
        });
        row.append(open, del);
      } else {
        const back = document.createElement("button");
        back.type = "button"; back.textContent = "Zurück holen";
        back.addEventListener("click", async () => {
          try { const rec = await storage.getProject(it.id); rec.deletedAt = null; await storage.putProject(rec); } catch (e) { setStatus(storage.friendlyError(e)); }
          renderProjects();
        });
        const gone = document.createElement("button");
        gone.type = "button"; gone.className = "danger delete-measure"; gone.textContent = "✕"; gone.title = "Endgültig löschen";
        gone.addEventListener("click", async () => {
          if (!confirm("„" + it.name + "“ endgültig löschen? Das kann nicht rückgängig gemacht werden.")) return;
          try { await storage.removeProject(it.id); } catch (e) { setStatus(storage.friendlyError(e)); }
          renderProjects();
        });
        row.append(back, gone);
      }
      box.append(row);
    });
    const est = await storage.estimate();
    $("storageInfo").textContent = est ? "Browser-Speicher belegt: " + (est.usage / 1048576).toFixed(0) + " MB" + (est.quota ? " von ca. " + (est.quota / 1048576).toFixed(0) + " MB" : "") : "";
  }
  buttons.load.addEventListener("click", async () => {
    showTrash = false;
    if (saveState === "pending") await flushAutosave();
    await renderProjects();
    showDialog(projectsDialog);
  });
  $("trashToggle").addEventListener("click", () => { showTrash = !showTrash; renderProjects(); });
  $("projectsClose").addEventListener("click", () => closeDialog(projectsDialog));

  // --- Projekt-Datei (Dateien-App) ---
  // Datei erst fertig bauen, dann mit einem frischen Tipp teilen (iOS verlangt eine Berührung direkt vor dem Teilen)
  let projectFile = null;
  async function buildProjectFile() {
    const rec = buildRecord(false);
    rec.sourceId = rec.id; delete rec.id;
    if ($("optWithOriginal").checked && originalBlob) {
      rec.originalData = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(originalBlob);
      });
      rec.originalName = "original";
    }
    const name = projectBaseName() + ".fotomass.json";
    return new File([JSON.stringify(rec)], name, { type: "application/json" });
  }
  async function prepareProjectFile() {
    $("projectFileShare").disabled = true; $("projectFileDownload").disabled = true;
    $("projectFileInfo").textContent = "Datei wird vorbereitet …";
    try {
      projectFile = await buildProjectFile();
      $("projectFileInfo").textContent = "„" + projectFile.name + "“ ist bereit (" + (projectFile.size / 1048576).toFixed(1) + " MB).";
      $("projectFileShare").disabled = false; $("projectFileDownload").disabled = false;
    } catch (e) {
      projectFile = null;
      $("projectFileInfo").textContent = "Datei konnte nicht erstellt werden (zu wenig Arbeitsspeicher?). Ohne Originalfoto nochmal versuchen.";
    }
  }
  buttons.exportProject.addEventListener("click", async () => {
    if (!photoLoaded) return;
    $("optWithOriginal").disabled = !originalBlob;
    if (!originalBlob) $("optWithOriginal").checked = false;
    showDialog($("projectFileDialog"));
    await prepareProjectFile();
  });
  $("optWithOriginal").addEventListener("change", prepareProjectFile);
  $("projectFileShare").addEventListener("click", async () => {
    if (!projectFile) return;
    const hint = $("projectFileInfo");
    const r = await storage.shareFiles([new File([projectFile], projectFile.name, { type: "application/json" })], projectBaseName())
      .then((x) => (x === "unsupported" ? storage.shareFiles([new File([projectFile], projectFile.name, { type: "text/plain" })], projectBaseName()) : x));
    if (r === "shared") hint.textContent = "✓ Im Menü „In Dateien sichern“ ablegen. Später mit „Projekt-Datei öffnen“ wieder laden.";
    else if (r === "cancelled") hint.textContent = "Abgebrochen – die Datei ist weiter bereit.";
    else hint.textContent = "Teilen nicht möglich – bitte „Herunterladen“ nutzen.";
  });
  $("projectFileDownload").addEventListener("click", () => {
    if (!projectFile) return;
    storage.downloadBlob(projectFile, projectFile.name);
    $("projectFileInfo").textContent = "Heruntergeladen (Ordner „Downloads“).";
  });
  $("projectFileClose").addEventListener("click", () => { closeDialog($("projectFileDialog")); projectFile = null; });

  // --- Projekt-Datei öffnen: immer als NEUES Projekt, überschreibt nie ein vorhandenes ---
  buttons.importProject.addEventListener("click", () => $("projectFileInput").click());
  $("projectFileInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 150 * 1048576) { setStatus("Datei zu groß (über 150 MB)."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      let raw;
      try { raw = JSON.parse(reader.result); } catch (_) { setStatus("Keine gültige Projekt-Datei (kein lesbares JSON)."); return; }
      const r = storage.parseProject(raw);
      if (!r.project) { setStatus("Import abgelehnt: " + r.error); return; }
      if (!(await leaveCurrentProject())) return;
      try {
        let original = null;
        if (r.originalData) { try { original = await storage.dataUrlToBlob(r.originalData); } catch (_) {} }
        const p = r.project;
        if (!p.projectName) p.projectName = file.name.replace(/\.fotomass\.json$|\.json$/i, "");
        p.savedAt = new Date().toISOString();
        await storage.putProject(p);
        if (original) await storage.putPhoto(p.id, original);
        await showProject(p, original);
        setStatus("Projekt „" + p.projectName + "“ geöffnet" + (r.fromVersion < storage.FORMAT_VERSION ? " (älteres Dateiformat " + r.fromVersion + " übernommen)" : "") + (original ? "." : ". Hinweis: kein Originalfoto in der Datei – „Original“ ist die verkleinerte Kopie."));
      } catch (err) {
        setStatus("Import fehlgeschlagen: " + storage.friendlyError(err));
      }
    };
    reader.onerror = () => setStatus("Datei konnte nicht gelesen werden.");
    reader.readAsText(file);
  });

  // ---------- Export: zwei Fotos (Original + mit Maßen) ----------
  const extFor = (type) => ({ "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif", "image/webp": "webp" }[type] || "jpg");

  function renderAnnotatedBlob() {
    const c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    paint(c.getContext("2d"), true); // ohne Auswahl-Rahmen, Griffe und Einrast-Punkt
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
  }

  function clearExportUrls() { exportUrls.forEach((u) => URL.revokeObjectURL(u)); exportUrls = []; }

  buttons.export.addEventListener("click", async () => {
    if (!photoLoaded) return;
    setStatus("Bilder werden vorbereitet …");
    try {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const base = `${projectBaseName()}_${stamp}`;
      const annotated = await renderAnnotatedBlob();
      let original = originalBlob || null;
      if (!original) { try { original = (await storage.getPhoto(projectId)) || null; } catch (_) {} }
      const reduced = !original; // Originaldatei nicht vorhanden (z. B. Projekt aus Datei ohne Original)
      if (reduced) original = await (await fetch(photoData)).blob();
      const otype = original.type || "image/jpeg";
      $("capOriginal").textContent = reduced ? "Foto (verkleinert – Originaldatei fehlt)" : "Original";
      if (canvasMode === "sketch") {
        exportFiles = [new File([annotated], `${base}_2D-Skizze.png`, { type: "image/png" })];
        $("saveDialogTitle").textContent = "2D-Skizze exportieren";
        $("previewOriginalFigure").hidden = true;
        $("prevAnnotated").alt = "2D-Skizze";
        $("capAnnotated").textContent = "2D-Skizze";
        $("saveShare").textContent = "📲 Skizze sichern / teilen";
      } else {
        exportFiles = [
          new File([original], `${base}_${reduced ? "Foto-verkleinert" : "Original"}.${extFor(otype)}`, { type: otype }),
          new File([annotated], `${base}_Masse.png`, { type: "image/png" })
        ];
        $("saveDialogTitle").textContent = "Zwei Fotos sichern";
        $("previewOriginalFigure").hidden = false;
        $("prevOriginal").src = exportUrls[0] || "";
        $("capOriginal").textContent = reduced ? "Foto (verkleinert)" : "Original";
        $("prevAnnotated").alt = "Foto mit Maßen";
        $("capAnnotated").textContent = "Mit Maßen";
        $("saveShare").textContent = "📲 Beide in Fotos sichern";
      }
      clearExportUrls();
      exportUrls = exportFiles.map((f) => URL.createObjectURL(f));
      if (canvasMode === "sketch") $("prevAnnotated").src = exportUrls[0];
      else { $("prevOriginal").src = exportUrls[0]; $("prevAnnotated").src = exportUrls[1]; }
      $("saveDialogHint").textContent = storage.canShareFiles(exportFiles)
        ? (exportFiles.length === 1 ? "Tippen und im Teilen-Menü sichern oder versenden." : "Tippen, dann im Menü „2 Bilder sichern“ wählen. Alternativ ein Bild lange drücken › „Zu Fotos hinzufügen“.")
        : "Teilen wird hier nicht unterstützt: Bild lange drücken oder „Als Dateien laden“.";
      showDialog(saveDialog);
      setStatus("");
    } catch (_) {
      setStatus("Bild-Export fehlgeschlagen.");
    }
  });

  // Direkt im Klick: kein await davor, sonst verweigert iOS das Teilen-Menü
  $("saveShare").addEventListener("click", async () => {
    if (!exportFiles) return;
    const hint = $("saveDialogHint");
    const r = await storage.shareFiles(exportFiles, "FotoMaß");
    if (r === "shared") hint.textContent = "✓ Geteilt. Wenn „2 Bilder sichern“ gewählt wurde, liegen beide Fotos jetzt in der Galerie.";
    else if (r === "cancelled") hint.textContent = "Abgebrochen – nochmal tippen oder Bild lange drücken.";
    else if (r === "unsupported") hint.textContent = "Teilen nicht möglich: Bild lange drücken › „Zu Fotos hinzufügen“ oder „Als Dateien laden“.";
    else hint.textContent = "Teilen fehlgeschlagen – nochmal tippen oder Bild lange drücken › „Zu Fotos hinzufügen“.";
  });
  $("saveDownload").addEventListener("click", () => {
    if (!exportFiles) return;
    exportFiles.forEach((f, i) => setTimeout(() => storage.downloadBlob(f, f.name), i * 500));
    $("saveDialogHint").textContent = exportFiles.length === 1 ? "Skizze wurde geladen (Ordner „Downloads“)." : "Beide Dateien wurden geladen (Ordner „Downloads“).";
  });
  $("saveClose").addEventListener("click", () => { closeDialog(saveDialog); clearExportUrls(); exportFiles = null; $("previewOriginalFigure").hidden = false; $("saveDialogTitle").textContent = "Zwei Fotos sichern"; $("saveShare").textContent = "📲 Beide in Fotos sichern"; });

  // ---------- Allgemeine Dialog-Helfer ----------
  let lastDialogOpen = 0;
  function showDialog(el) { lastDialogOpen = Date.now(); el.hidden = false; }
  function closeDialog(el) { el.hidden = true; }
  // Das „Nachklick“-Ereignis eines Tipps darf nicht den gerade geöffneten Dialog bedienen
  document.addEventListener("click", (e) => {
    if (e.isTrusted && Date.now() - lastDialogOpen < 350 && e.target.closest && e.target.closest(".dialog")) {
      e.stopPropagation(); e.preventDefault();
    }
  }, true);

  // ---------- Text-Dialog: neu anlegen und nachträglich bearbeiten ----------
  function openTextDialog(point, textObject) {
    editingTextId = textObject ? textObject.id : null;
    pendingTextPoint = point || null;
    textDialogTitle.textContent = textObject ? "Text bearbeiten" : "Beschriftung";
    textDialogInput.value = textObject ? (textObject.text || "") : "";
    textDialogSize.value = String(textObject ? (textObject.fontSize || getFontSize()+4) : (getFontSize()+4));
    textDialogColor.value = textObject ? (textObject.color || colorInput.value) : colorInput.value;
    textDialogBg.checked = textObject ? !!textObject.textBg : false;
    $("textDialogOk").textContent = textObject ? "Änderungen übernehmen" : "Text einfügen";
    showDialog(textDialog);
    pendingFocus = "text";
    setTimeout(() => textDialogInput.focus(), 60);
  }
  function closeTextDialog() { closeDialog(textDialog); pendingTextPoint = null; editingTextId = null; $("textDialogOk").textContent = "Text einfügen"; }
  $("textDialogCancel").addEventListener("click", closeTextDialog);
  $("textDialogOk").addEventListener("click", () => {
    const txt = textDialogInput.value.trim();
    if (txt && editingTextId !== null) {
      const d = drawings.find((x) => x.id === editingTextId && x.type === "text");
      if (d) {
        remember(); d.text = txt; d.fontSize = Number(textDialogSize.value) || 28;
        d.color = textDialogColor.value || "#ff3b30"; d.textBg = textDialogBg.checked;
        selectedDrawingId = d.id; selectedId = null; refresh();
      }
    } else if (txt && pendingTextPoint) {
      remember();
      const d = { id: nextId++, type: "text", x1: pendingTextPoint.x, y1: pendingTextPoint.y, text: txt, color: textDialogColor.value || colorInput.value, width: Number(widthInput.value), fontSize: Number(textDialogSize.value) || getFontSize()+4, textBg: textDialogBg.checked, layer: currentLayer() };
      drawings.push(d); selectedDrawingId = d.id; selectedId = null; refresh();
    }
    closeTextDialog(); draw();
  });
  textDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("textDialogOk").click(); }
    if (e.key === "Escape") closeTextDialog();
  });

  // ---------- Wert-Dialog (Tippen + Sprache) ----------
  const dlg = { id: null, isNew: false, listener: null, confirmTimer: null };
  try {
    optAutoConfirm.checked = localStorage.getItem("fm-autoconfirm") !== "0";
    optAutoMic.checked = localStorage.getItem("fm-automic") === "1";
  } catch (_) {}
  optAutoConfirm.addEventListener("change", () => { try { localStorage.setItem("fm-autoconfirm", optAutoConfirm.checked ? "1" : "0"); } catch (_) {} });
  optAutoMic.addEventListener("change", () => { try { localStorage.setItem("fm-automic", optAutoMic.checked ? "1" : "0"); } catch (_) {} });

  function stopSpeech() {
    clearTimeout(dlg.confirmTimer);
    if (dlg.listener) { dlg.listener.stop(); dlg.listener = null; }
    vMic.classList.remove("listening");
  }

  function startSpeech() {
    stopSpeech();
    vMic.classList.add("listening");
    const handlers = {
      onStatus: (t) => { vHint.textContent = t; },
      onResult: (r) => {
        vInput.value = fmt(r.value);
        if (r.unit) vUnit.value = r.unit;
        if (!r.final) { vHint.textContent = "… " + fmt(r.value) + (r.unit || ""); return; }
        if (optAutoConfirm.checked) {
          vHint.textContent = "✓ " + fmt(r.value) + vUnit.value + " – wird übernommen … (Antippen zum Ändern)";
          clearTimeout(dlg.confirmTimer);
          dlg.confirmTimer = setTimeout(() => $("valueDialogOk").click(), 1100);
        } else {
          vHint.textContent = "Erkannt: " + fmt(r.value) + vUnit.value + " – „Übernehmen“ oder sagen: „OK“.";
        }
      },
      onCommand: (cmd) => {
        if (cmd === "confirm") { if (vInput.value) $("valueDialogOk").click(); else vHint.textContent = "Erst ein Maß sagen."; }
        else if (cmd === "cancel") closeValueDialog();
        else if (cmd === "clear") { vInput.value = ""; vHint.textContent = "Gelöscht – nochmal sprechen."; setTimeout(startSpeech, 200); }
      },
      onEnd: () => { vMic.classList.remove("listening"); dlg.listener = null; }
    };
    dlg.listener = speech.listen(handlers);
    if (!dlg.listener) vMic.classList.remove("listening");
  }

  function openValueDialog(measureId, opts = {}) {
    stopSpeech();
    const m = measures.find((x) => x.id === measureId);
    if (!m) return;
    if (m.locked) { toast("🔒 Gesperrt – erst entsperren (lang drücken › Entsperren)."); return; }
    dlg.id = measureId;
    dlg.isNew = !!opts.isNew;
    $("valueDialogTitle").textContent = `${m.isReference ? "Referenzmaß" : (m.type === "angle" ? "Winkel" : "Maß")} ${measures.indexOf(m) + 1} – Wert`;
    vInput.value = fmt(m.value);
    $("dimensionPrefix").value = m.labelPrefix || "";
    $("dimensionSuffix").value = m.labelSuffix || "";
    vUnit.value = m.unit || " mm";
    vInput.inputMode = "decimal";
    $("keyboardToggle").textContent = "⌨ Text-Tastatur (für iPhone-Diktat)";
    const st = speech.status();
    vHint.textContent = !st.ok ? st.reason
      : st.standalone ? "Zahl tippen. Hinweis: Als Home-Bildschirm-App geht Sprache am iPhone oft nicht – dann in Safari öffnen oder ⌨ nutzen."
      : "Zahl tippen oder 🎤 antippen";
    showDialog(valueDialog);
    const wantMic = opts.mic || (optAutoMic.checked && st.ok);
    if (wantMic) {
      startSpeech(); // direkt im Tipp, damit iOS das Mikrofon freigibt
    } else {
      // Fokus sofort (Tastatur) und – falls iOS das hier ablehnt – nochmal beim touchend desselben Tipps
      try { vInput.focus(); vInput.select(); } catch (_) {}
      if (opts.fromPointer) pendingFocus = "value";
      setTimeout(() => { if (!valueDialog.hidden && document.activeElement !== vInput && !dlg.listener) { try { vInput.focus(); vInput.select(); } catch (_) {} } }, 120);
    }
  }

  function closeValueDialog() {
    stopSpeech();
    // Neue Maßlinie bei „Abbrechen“ verwerfen (noch kein bestätigter Wert)
    if (dlg.isNew && dlg.id != null) {
      const had = measures.some((x) => x.id === dlg.id);
      if (had) {
        // Undo stellt den Zustand vor dem Einfügen wieder her und entfernt die leere Linie
        if (history.length) undo();
        else {
          measures = measures.filter((x) => x.id !== dlg.id);
          if (selectedId === dlg.id) selectedId = null;
          refresh();
        }
        setStatus("Maßlinie verworfen.");
      }
    }
    closeDialog(valueDialog);
    dlg.id = null;
    dlg.isNew = false;
    pendingFocus = false;
  }

  function commitValue() {
    const m = measures.find((x) => x.id === dlg.id);
    if (m) {
      const p = speech.parseNumber(vInput.value, { typed: true });
      if (!dlg.isNew) remember(); // neue Linie: Rückgängig entfernt Linie samt Wert in einem Schritt
      m.value = p.value;
      m.labelPrefix = $("dimensionPrefix").value.trim();
      m.labelSuffix = $("dimensionSuffix").value.trim();
      m.unit = p.unit || vUnit.value || " mm";
      if (m.isReference || m.type === "reference") {
        m.isReference = true;
        m.type = "reference";
        // Pro Projekt gibt es eine aktive Referenz. Ältere Referenzlinien bleiben als normale Maßlinien sichtbar.
        measures.forEach((other) => { if (other.id !== m.id && other.isReference) { other.isReference = false; other.type = "linear"; } });
        if (!(Number(String(m.value).replace(",", ".")) > 0)) setStatus("Referenzwert muss größer als 0 sein.");
        else { calculateEmptyMeasuresFromReference(); setStatus("Referenzmaß gesetzt. Neue Maßlinien werden für dieselbe Bildebene berechnet."); }
      } else {
        // Sobald ein berechneter Wert manuell geändert wird, bleibt er ein manueller Wert.
        m.autoCalculated = false;
        recalculateAutomaticMeasures();
      }
      // Wichtig: isNew zurücksetzen, bevor closeValueDialog läuft –
      // sonst würde der Cancel-Pfad die gerade bestätigte Maßlinie per Undo wieder entfernen.
      dlg.isNew = false;
      refresh();
    }
    closeValueDialog();
  }

  $("valueDialogOk").addEventListener("click", commitValue);
  $("valueDialogCancel").addEventListener("click", closeValueDialog);
  vMic.addEventListener("click", () => {
    if (dlg.listener) { stopSpeech(); vHint.textContent = "Gestoppt – tippen oder nochmal 🎤."; }
    else startSpeech();
  });
  vInput.addEventListener("input", () => { clearTimeout(dlg.confirmTimer); });
  vUnit.addEventListener("change", () => { clearTimeout(dlg.confirmTimer); });
  vInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitValue();
    if (e.key === "Escape") closeValueDialog();
  });
  $("keyboardToggle").addEventListener("click", () => {
    stopSpeech();
    const text = vInput.inputMode !== "text";
    vInput.inputMode = text ? "text" : "decimal";
    $("keyboardToggle").textContent = text ? "123 Zahlen-Tastatur" : "⌨ Text-Tastatur (für iPhone-Diktat)";
    vHint.textContent = text ? "Tastatur-Mikrofon nutzen und z. B. „zwölfhundert“ sagen – wird beim Übernehmen in eine Zahl umgewandelt." : "Zahl tippen oder 🎤 antippen";
    vInput.blur(); vInput.focus();
  });

  // ---------- Menü bei langem Drücken ----------
  function openActionDialog(id) {
    const m = measures.find((x) => x.id === id);
    if (!m) return;
    actionMeasureId = id;
    actionColorRemembered = false;
    selectedId = id;
    syncQuickMeasureLock();
    $("actionTitle").textContent = `${m.isReference ? "Referenzmaß" : (m.type === "angle" ? "Winkel" : "Maß")} ${measures.indexOf(m) + 1}: ${m.value ? fmt(m.value) + (m.unit || "") : "kein Wert"}`;
    $("actColor").value = m.color || "#ff3b30";
    syncActionLock(m);
    renderMeasureList(); draw();
    showDialog(actionDialog);
  }
  function syncActionLock(m) {
    $("actLock").textContent = m.locked ? "🔓 Maßlinie entsperren" : "🔒 Maßlinie sperren";
    ["actValue", "actMic", "actDelete"].forEach((id) => { $(id).disabled = !!m.locked; });
    $("actColor").disabled = !!m.locked;
  }
  $("actLock").addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    const m = measures.find((x) => x.id === actionMeasureId);
    if (!m) return;
    remember();
    m.locked = !m.locked;
    m.labelLocked = m.locked; // Maßlinie und zugehörige Maßzahl immer gemeinsam sperren
    syncActionLock(m);
    syncQuickMeasureLock();
    $("actionTitle").textContent = `${m.isReference ? "Referenzmaß" : (m.type === "angle" ? "Winkel" : "Maß")} ${measures.indexOf(m) + 1}${m.locked ? " 🔒" : ""}`;
    refresh();
    toast(m.locked ? "Maßlinie gesperrt." : "Maßlinie entsperrt.");
  });
  const closeActionDialog = () => { closeDialog(actionDialog); actionMeasureId = null; };
  $("actClose").addEventListener("click", closeActionDialog);
  $("actValue").addEventListener("click", () => { const id = actionMeasureId; closeActionDialog(); openValueDialog(id); });
  $("actMic").addEventListener("click", () => { const id = actionMeasureId; closeActionDialog(); openValueDialog(id, { mic: true }); });
  $("actColor").addEventListener("input", (e) => {
    const m = measures.find((x) => x.id === actionMeasureId);
    if (!m) return;
    if (!actionColorRemembered) { remember(); actionColorRemembered = true; }
    m.color = e.target.value;
    draw(); scheduleAutosave();
  });
  $("actDuplicate").addEventListener("click", () => {
    const m = measures.find((x) => x.id === actionMeasureId);
    if (!m) return;
    remember();
    const off = scr(40);
    const copy = Object.assign({}, m, { locked: false, id: nextId++, x1: m.x1 + off, y1: m.y1 + off, x2: m.x2 + off, y2: m.y2 + off, ...(m.type === "angle" ? { x3: m.x3 + off, y3: m.y3 + off } : {}) });
    if (copy.isReference) { copy.isReference = false; copy.type = "linear"; copy.autoCalculated = false; }
    measures.push(copy);
    selectedId = copy.id;
    closeActionDialog();
    refresh();
  });
  $("actDelete").addEventListener("click", () => {
    const id = actionMeasureId;
    closeActionDialog();
    deleteMeasure(id);
  });

  // ---------- Bilder einfügen und zuschneiden (Version 4) ----------
  const imageCropDialog = $("imageCropDialog");
  const cropInputs = [$("cropLeft"), $("cropRight"), $("cropTop"), $("cropBottom")];
  function cropBounds() {
    const iw = cropSourceImage.naturalWidth, ih = cropSourceImage.naturalHeight;
    return {
      l: Number($("cropLeft").value) / 100, r: Number($("cropRight").value) / 100,
      t: Number($("cropTop").value) / 100, b: Number($("cropBottom").value) / 100,
      iw, ih
    };
  }
  function paintCropPreview() {
    if (!cropSourceImage) return;
    const iw = cropSourceImage.naturalWidth, ih = cropSourceImage.naturalHeight;
    const scale = Math.min(900 / iw, 600 / ih, 1);
    cropPreviewCanvas.width = Math.max(1, Math.round(iw * scale));
    cropPreviewCanvas.height = Math.max(1, Math.round(ih * scale));
    const w = cropPreviewCanvas.width, h = cropPreviewCanvas.height;
    const { l, r, t, b } = cropBounds();
    const x = l*w, y = t*h, cw = Math.max(1, (1-l-r)*w), ch = Math.max(1, (1-t-b)*h);
    cropPreviewCtx.clearRect(0, 0, w, h);
    cropPreviewCtx.drawImage(cropSourceImage, 0, 0, w, h);
    cropPreviewCtx.fillStyle = "rgba(0,0,0,.48)";
    cropPreviewCtx.fillRect(0, 0, w, y); cropPreviewCtx.fillRect(0, y+ch, w, h-y-ch);
    cropPreviewCtx.fillRect(0, y, x, ch); cropPreviewCtx.fillRect(x+cw, y, w-x-cw, ch);
    cropPreviewCtx.strokeStyle = "#ffca28"; cropPreviewCtx.lineWidth = Math.max(2, w/300);
    cropPreviewCtx.setLineDash([]); cropPreviewCtx.strokeRect(x, y, cw, ch);
    const hs = Math.max(7, Math.min(14, w/35)); cropPreviewCtx.fillStyle = "#fff";
    [[x,y],[x+cw,y],[x,y+ch],[x+cw,y+ch]].forEach(([hx,hy])=>cropPreviewCtx.fillRect(hx-hs/2,hy-hs/2,hs,hs));
  }
  function cropPointerDown(e) {
    if (!cropSourceImage) return;
    e.preventDefault(); cropPreviewCanvas.setPointerCapture(e.pointerId);
    const rect = cropPreviewCanvas.getBoundingClientRect();
    const px = (e.clientX-rect.left)/rect.width, py = (e.clientY-rect.top)/rect.height;
    const b = cropBounds(), x1=b.l, x2=1-b.r, y1=b.t, y2=1-b.b, edge=0.045;
    const nearL=Math.abs(px-x1)<edge, nearR=Math.abs(px-x2)<edge, nearT=Math.abs(py-y1)<edge, nearB=Math.abs(py-y2)<edge;
    let mode = (nearL||nearR||nearT||nearB) ? "resize" : "move";
    if (mode === "resize" && !(nearL||nearR||nearT||nearB)) mode="move";
    cropDrag={x:px,y:py,b:{l:b.l,r:b.r,t:b.t,b:b.b},edges:{l:nearL,r:nearR,t:nearT,b:nearB},mode};
  }
  function cropPointerMove(e) {
    if (!cropDrag || !cropSourceImage) return;
    e.preventDefault();
    const rect=cropPreviewCanvas.getBoundingClientRect();
    const px=(e.clientX-rect.left)/rect.width, py=(e.clientY-rect.top)/rect.height;
    const dx=px-cropDrag.x, dy=py-cropDrag.y, o=cropDrag.b, ed=cropDrag.edges;
    let l=o.l,r=o.r,t=o.t,b=o.b;
    if (cropDrag.mode === "move") {
      const width=1-o.l-o.r, height=1-o.t-o.b;
      l=Math.min(1-width,Math.max(0,o.l+dx)); r=1-width-l;
      t=Math.min(1-height,Math.max(0,o.t+dy)); b=1-height-t;
    } else {
      if(ed.l) l=Math.min(0.8,Math.max(0, o.l+dx));
      if(ed.r) r=Math.min(0.8,Math.max(0, o.r-dx));
      if(ed.t) t=Math.min(0.8,Math.max(0, o.t+dy));
      if(ed.b) b=Math.min(0.8,Math.max(0, o.b-dy));
      if(l+r>0.8){if(ed.l)l=0.8-r;else r=0.8-l;}
      if(t+b>0.8){if(ed.t)t=0.8-b;else b=0.8-t;}
    }
    $("cropLeft").value=Math.round(l*100); $("cropRight").value=Math.round(r*100);
    $("cropTop").value=Math.round(t*100); $("cropBottom").value=Math.round(b*100);
    paintCropPreview();
  }
  function cropPointerUp(){cropDrag=null;}
  cropPreviewCanvas.addEventListener("pointerdown", cropPointerDown);
  cropPreviewCanvas.addEventListener("pointermove", cropPointerMove);
  cropPreviewCanvas.addEventListener("pointerup", cropPointerUp);
  cropPreviewCanvas.addEventListener("pointercancel", cropPointerUp);
  function closeCropDialog() { closeDialog(imageCropDialog); cropSourceImage = null; cropSourceName = ""; }
  $("insertImageButton").addEventListener("click", () => {
    if (!photoLoaded) { setStatus("Bitte zuerst ein Hauptfoto laden."); return; }
    insertImageInput.click();
  });
  insertImageInput.addEventListener("change", () => {
    const file = insertImageInput.files && insertImageInput.files[0]; insertImageInput.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setStatus("Bitte eine Bilddatei auswählen."); return; }
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url); cropSourceImage = im; cropSourceName = file.name || "Detailbild";
      cropInputs.forEach((input) => input.value = "0"); paintCropPreview(); showDialog(imageCropDialog);
    };
    im.onerror = () => { URL.revokeObjectURL(url); setStatus("Das Bildformat kann nicht geöffnet werden. Bitte als JPEG oder PNG auswählen."); };
    im.src = url;
  });
  cropInputs.forEach((input) => input.addEventListener("input", () => {
    // Mindestens 20 % Bildfläche erhalten, damit sich kein leerer Ausschnitt ergibt.
    const l=Number($("cropLeft").value), r=Number($("cropRight").value), t=Number($("cropTop").value), b=Number($("cropBottom").value);
    if (l+r>80) { if (input.id==="cropLeft") $("cropRight").value=80-l; else $("cropLeft").value=80-r; }
    if (t+b>80) { if (input.id==="cropTop") $("cropBottom").value=80-t; else $("cropTop").value=80-b; }
    paintCropPreview();
  }));
  $("cropReset").addEventListener("click", () => { cropInputs.forEach((input)=>input.value="0"); paintCropPreview(); });
  $("cropCancel").addEventListener("click", closeCropDialog);
  $("cropInsert").addEventListener("click", () => {
    if (!cropSourceImage || !photoLoaded) return;
    const im=cropSourceImage, iw=im.naturalWidth, ih=im.naturalHeight;
    const l=Number($("cropLeft").value)/100, r=Number($("cropRight").value)/100, t=Number($("cropTop").value)/100, b=Number($("cropBottom").value)/100;
    const sx=Math.round(iw*l), sy=Math.round(ih*t), sw=Math.max(1,Math.round(iw*(1-l-r))), sh=Math.max(1,Math.round(ih*(1-t-b)));
    const maxSide=1400, scale=Math.min(1,maxSide/Math.max(sw,sh));
    const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(sw*scale)); c.height=Math.max(1,Math.round(sh*scale));
    c.getContext("2d").drawImage(im,sx,sy,sw,sh,0,0,c.width,c.height);
    const imageData=c.toDataURL("image/jpeg",0.88);
    const w=Math.min(canvas.width*0.38,480), h=w*c.height/c.width;
    const x=Math.max(0,(canvas.width-w)/2), y=Math.max(0,(canvas.height-h)/2);
    remember(); const id=nextId++;
    const item={id,type:"image",x1:x,y1:y,x2:x+w,y2:y+h,imageData,sourceName:cropSourceName,layer:currentLayer()};
    drawings.push(item); drawingImageCache.delete(id); selectedDrawingId=id; selectedId=null;
    closeCropDialog(); setTool("select"); refresh(); setStatus("Bild eingefügt. Mit Auswählen verschieben; an der unteren rechten Ecke standardmäßig proportional skalieren. Freie Verzerrung lässt sich unten einschalten.");
  });

  // ---------- Werkzeug-Leiste & Einstellungen ----------
  buttons.undo.addEventListener("click", undo);
  buttons.redo.addEventListener("click", redo);
  buttons.clear.addEventListener("click", () => {
    const layer = currentLayer();
    const keep = measures.filter((m) => isLocked(m) || layerOf(m) !== layer);
    const otherDrawings = drawings.filter((d) => layerOf(d) !== layer);
    const layerName = layer === "sketch" ? "Skizzen-Ebene" : "Foto-Ebene";
    if (!confirm("Alles auf der " + layerName + " löschen?" + (keep.filter(isLocked).length ? "\n(Gesperrte Maße bleiben erhalten.)" : ""))) return;
    remember();
    measures = keep;
    drawings = otherDrawings;
    selectedId = null; selectedDrawingId = null; snapPoint = null; polylineDraft = null;
    syncPolylineActions();
    refresh();
    toast(layerName + " gelöscht.", "Rückgängig", undo, 8000);
  });
  $("styleToggle").addEventListener("click", () => {
    document.body.classList.toggle("site-bold");
    $("styleToggle").textContent = document.body.classList.contains("site-bold") ? "Technisch" : "Baustellenstil";
  });
  const rectFillToggle = $("rectFillToggle");
  const rectFillOpacity = $("rectFillOpacity");
  const rectFillOpacityNumber = $("rectFillOpacityNumber");
  const rectFillOpacityValue = $("rectFillOpacityValue");
  function setOpacityControl(value) {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (rectFillOpacity) rectFillOpacity.value = String(n);
    if (rectFillOpacityNumber) rectFillOpacityNumber.value = String(n);
    if (rectFillOpacityValue) rectFillOpacityValue.textContent = n + "%";
    const d = drawings.find(x => x.id === selectedDrawingId && x.type === "rect");
    if (d) {
      if (!rectFillOpacity?.dataset.fmRemembered) { remember(); if (rectFillOpacity) rectFillOpacity.dataset.fmRemembered = "1"; }
      d.fillOpacity = n / 100;
      draw(); scheduleAutosave();
    }
  }
  function syncQuickMeasureLock() {
    const btn = $("quickMeasureLock");
    if (!btn) return;
    const m = measures.find(x => x.id === selectedId);
    btn.disabled = !m;
    btn.textContent = m && m.locked ? "🔓 Maßlinie entsperren" : "🔒 Maßlinie sperren";
  }
  const quickMeasureLock = $("quickMeasureLock");
  if (quickMeasureLock) quickMeasureLock.addEventListener("click", () => {
    const m = measures.find(x => x.id === selectedId);
    if (!m) { toast("Bitte zuerst eine Maßlinie antippen."); return; }
    remember();
    m.locked = !m.locked;
    m.labelLocked = m.locked; // Maßlinie und zugehörige Maßzahl gemeinsam sperren/entsperren
    syncQuickMeasureLock();
    syncActionLock(m);
    refresh();
    toast(m.locked ? "Maßlinie und Maßzahl gesperrt – beide bleiben unverändert." : "Maßlinie und Maßzahl entsperrt.");
  });
  function syncRectFillControls(d) {
    // Regler sind immer bedienbar: mit ausgewähltem Rechteck ändern sie dieses,
    // ohne Auswahl dienen sie als Vorgabe für das nächste Rechteck.
    if (rectFillToggle) rectFillToggle.disabled = false;
    if (rectFillOpacity) rectFillOpacity.disabled = false;
    if (d && d.type === "rect") {
      if (rectFillToggle) rectFillToggle.checked = !!d.fill;
      const opacity = Math.round((d.fillOpacity ?? 1) * 100);
      if (rectFillOpacity) rectFillOpacity.value = String(opacity);
      if (rectFillOpacityNumber) rectFillOpacityNumber.value = String(opacity);
    }
    if (rectFillOpacityValue && rectFillOpacity) rectFillOpacityValue.textContent = rectFillOpacity.value + "%";
  }
  if (rectFillToggle) rectFillToggle.addEventListener("change", () => {
    const d = drawings.find(x => x.id === selectedDrawingId && x.type === "rect");
    if (d) {
      remember(); d.fill = rectFillToggle.checked;
      if (d.fill && d.fillOpacity == null) d.fillOpacity = Number(rectFillOpacity.value) / 100;
      refresh();
    }
  });
  if (rectFillOpacity) rectFillOpacity.addEventListener("input", () => {
    if (rectFillOpacityNumber) rectFillOpacityNumber.value = rectFillOpacity.value;
    if (rectFillOpacityValue) rectFillOpacityValue.textContent = rectFillOpacity.value + "%";
    const d = drawings.find(x => x.id === selectedDrawingId && x.type === "rect");
    if (!d) return; // Wert gilt als Vorgabe für neu gezeichnete Rechtecke.
    if (!rectFillOpacity.dataset.fmRemembered) { remember(); rectFillOpacity.dataset.fmRemembered = "1"; }
    d.fillOpacity = Number(rectFillOpacity.value) / 100;
    draw(); scheduleAutosave();
  });
  if (rectFillOpacityNumber) {
    rectFillOpacityNumber.addEventListener("input", () => {
      const raw = rectFillOpacityNumber.value;
      if (raw === "") return;
      setOpacityControl(raw);
    });
    rectFillOpacityNumber.addEventListener("change", () => {
      setOpacityControl(rectFillOpacityNumber.value);
      if (rectFillOpacity) delete rectFillOpacity.dataset.fmRemembered;
    });
  }
  if (rectFillOpacity) rectFillOpacity.addEventListener("change", () => { delete rectFillOpacity.dataset.fmRemembered; });
  widthInput.addEventListener("input", () => {
    const d = drawings.find(x => x.id === selectedDrawingId && ["freehand","line","rect"].includes(x.type));
    if (!d) return;
    if (!widthInput.dataset.fmRemembered) { remember(); widthInput.dataset.fmRemembered="1"; }
    d.width = Number(widthInput.value); draw(); scheduleAutosave();
  });
  widthInput.addEventListener("change", () => { delete widthInput.dataset.fmRemembered; });
  colorInput.addEventListener("change", () => {
    const m = measures.find((x) => x.id === selectedId);
    const d = drawings.find((x) => x.id === selectedDrawingId);
    if (m) { remember(); m.color = colorInput.value; refresh(); }
    else if (d && ["freehand","line","rect"].includes(d.type)) { remember(); d.color = colorInput.value; refresh(); }
  });
  unitSelect.addEventListener("change", () => {
    const m = measures.find((x) => x.id === selectedId);
    if (m) {
      remember();
      const nextUnit = unitSelect.value;
      if (m.isReference) {
        const n = Number(String(m.value).replace(",", "."));
        if (Number.isFinite(n) && n > 0) m.value = String(Number((n * unitFactorMm(m.unit) / unitFactorMm(nextUnit)).toFixed(3)));
        m.unit = nextUnit;
        calculateEmptyMeasuresFromReference();
      } else {
        m.unit = nextUnit;
        if (m.autoCalculated) { const value = calculatedValueFor(m, m.unit); if (value !== null) m.value = value; }
      }
      refresh();
    }
  });
  fontSizeInput.addEventListener("input", () => { draw(); scheduleAutosave(); });
  $("applyDimensionStyle").disabled = false;
  $("applyDimensionStyle").addEventListener("click", () => {
    const m = measures.find((x) => x.id === selectedId);
    if (!m) { toast("Bitte zuerst eine Maßlinie auswählen."); return; }
    remember();
    m.endStyle = dimensionEndStyle.value;
    m.endSize = Number(dimensionEndSize.value) || 10;
    m.extensionLines = dimensionExtensionLines.checked;
    refresh();
    toast("Stil auf ausgewählte Maßlinie angewendet.");
  });
  dimensionEndStyle.addEventListener("change", () => { draw(); scheduleAutosave(); });
  dimensionEndSize.addEventListener("input", () => { draw(); scheduleAutosave(); });
  dimensionExtensionLines.addEventListener("change", () => { draw(); scheduleAutosave(); });
  $("textBgToggle").addEventListener("change", () => {
    const m = measures.find((x) => x.id === selectedId);
    if (m) { remember(); m.textBg = $("textBgToggle").checked; refresh(); }
    else { draw(); scheduleAutosave(); }
  });
  document.querySelectorAll(".tool").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  $("projectName").addEventListener("input", scheduleAutosave);

  // ---------- Zeigerbedienung: 1 Finger = Werkzeug, 2 Finger = Zoom + Schieben ----------
  const cancelLongPress = () => { clearTimeout(longPressTimer); longPressTimer = null; };
  const endGesture = () => { activeDrawing = null; pointerStart = null; snapPoint = null; preSnap = null; cancelLongPress(); };

  function onPointerDown(e) {
    if (!photoLoaded) return;
    e.preventDefault();
    try { canvasWrap.setPointerCapture(e.pointerId); } catch (_) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) { // zweiter Finger: laufende Aktion abbrechen
      multiTouchMode = true;
      endGesture();
      hideCrosshair();
      const pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      lastPinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      draw();
      return;
    }

    multiTouchMode = false;
    updateCrosshair(e.clientX, e.clientY);
    let p = pointWithCrosshair(e);
    pointerStart = p;
    pressInfo = { x: e.clientX, y: e.clientY };
    snapPoint = null;
    preSnap = snapshot();

    if (tool === "select") {
      const hit = hitMeasure(p);
      if (hit) {
        selectedDrawingId = null;
        if (hit.label) {
          const armedLabel = selectedId === hit.measure.id && !hit.measure.labelLocked;
          selectedId = hit.measure.id;
          activeDrawing = { type:"move-label", id:hit.measure.id, dx:p.x, dy:p.y, moved:false, changed:false, armed:armedLabel, originalX:hit.measure.labelOffsetX||0, originalY:hit.measure.labelOffsetY||0, labelLocked:!!hit.measure.labelLocked };
          cancelLongPress();
          longPressTimer = setTimeout(() => {
            if (activeDrawing && !activeDrawing.moved && !multiTouchMode && activeDrawing.id === hit.measure.id) {
              const id = hit.measure.id; endGesture(); hideCrosshair();
              try { navigator.vibrate && navigator.vibrate(15); } catch (_) {}
              openActionDialog(id);
            }
          }, 550);
          renderMeasureList(); draw(); return;
        }
        // Erst antippen = auswählen. Verschieben geht nur, wenn das Maß schon ausgewählt und nicht gesperrt ist.
        const armed = selectedId === hit.measure.id && !hit.measure.locked;
        selectedId = hit.measure.id;
        syncQuickMeasureLock();
        activeDrawing = hit.endpoint
          ? { type: "move-endpoint", id: hit.measure.id, endpoint: hit.endpoint, moved: false, changed: false, armed, original: { x1: hit.measure.x1, y1: hit.measure.y1, x2: hit.measure.x2, y2: hit.measure.y2, x3: hit.measure.x3, y3: hit.measure.y3 } }
          : { type: "move-measure", id: hit.measure.id, dx: p.x, dy: p.y, moved: false, changed: false, armed, original: { x1: hit.measure.x1, y1: hit.measure.y1, x2: hit.measure.x2, y2: hit.measure.y2, x3: hit.measure.x3, y3: hit.measure.y3 } };
        // langes Drücken ohne Bewegen -> Menü
        cancelLongPress();
        longPressTimer = setTimeout(() => {
          if (activeDrawing && !activeDrawing.moved && !multiTouchMode && /^move-/.test(activeDrawing.type)) {
            const id = activeDrawing.id;
            endGesture();
            hideCrosshair();
            try { navigator.vibrate && navigator.vibrate(15); } catch (_) {}
            openActionDialog(id);
          }
        }, 550);
      } else {
        selectedId = null;
        syncQuickMeasureLock();
        const drawIndex = hitDrawing(p);
        const imageDrawing = drawIndex >= 0 ? drawings[drawIndex] : null;
        if (imageDrawing && imageDrawing.type === "image") {
          const wasSelected = selectedDrawingId === imageDrawing.id;
          selectedDrawingId = imageDrawing.id;
          const resizeHit = wasSelected && dist(p, {x:imageDrawing.x2, y:imageDrawing.y2}) < scr(30);
          activeDrawing = { type: resizeHit ? "move-resize-image" : "move-image", id:imageDrawing.id, dx:p.x, dy:p.y, moved:false, changed:false, armed:wasSelected, aspectRatio:(imageDrawing.y2-imageDrawing.y1)/Math.max(1,imageDrawing.x2-imageDrawing.x1), original:{x1:imageDrawing.x1,y1:imageDrawing.y1,x2:imageDrawing.x2,y2:imageDrawing.y2} };
          cancelLongPress();
        } else if (imageDrawing && imageDrawing.type === "text") {
          const wasSelected = selectedDrawingId === imageDrawing.id;
          selectedDrawingId = imageDrawing.id;
          activeDrawing = { type: "move-text", id:imageDrawing.id, dx:p.x, dy:p.y, moved:false, changed:false, armed:wasSelected, original:{x1:imageDrawing.x1,y1:imageDrawing.y1} };
          cancelLongPress();
        } else if (imageDrawing) {
          const wasSelected = selectedDrawingId === imageDrawing.id;
          selectedDrawingId = imageDrawing.id;
          if (imageDrawing.type === "rect" && wasSelected) {
            const x1=Math.min(imageDrawing.x1,imageDrawing.x2), y1=Math.min(imageDrawing.y1,imageDrawing.y2), x2=Math.max(imageDrawing.x1,imageDrawing.x2), y2=Math.max(imageDrawing.y1,imageDrawing.y2);
            const cx=(x1+x2)/2, cy=(y1+y2)/2;
            if (dist(p,{x:cx,y:y1-scr(24)})<scr(30)) { activeDrawing={type:"move-rotate-rect",id:imageDrawing.id,center:{x:cx,y:cy},startAngle:Math.atan2(p.y-cy,p.x-cx),originalRotation:imageDrawing.rotation||0,moved:false,changed:false,armed:true}; cancelLongPress(); draw(); return; }
          }
          let bounds;
          if ((imageDrawing.type === "freehand" || imageDrawing.type === "polyline") && imageDrawing.points && imageDrawing.points.length) {
            bounds = { x1: Math.min(...imageDrawing.points.map(q=>q.x)), y1: Math.min(...imageDrawing.points.map(q=>q.y)), x2: Math.max(...imageDrawing.points.map(q=>q.x)), y2: Math.max(...imageDrawing.points.map(q=>q.y)) };
          } else if (imageDrawing.type === "circle") {
            const r = Math.hypot(imageDrawing.x2 - imageDrawing.x1, imageDrawing.y2 - imageDrawing.y1);
            bounds = { x1: imageDrawing.x1 - r, y1: imageDrawing.y1 - r, x2: imageDrawing.x1 + r, y2: imageDrawing.y1 + r };
          } else {
            bounds = { x1: Math.min(imageDrawing.x1,imageDrawing.x2), y1: Math.min(imageDrawing.y1,imageDrawing.y2), x2: Math.max(imageDrawing.x1,imageDrawing.x2), y2: Math.max(imageDrawing.y1,imageDrawing.y2) };
          }
          if (wasSelected && imageDrawing.type === "line") {
            if (dist(p,{x:imageDrawing.x1,y:imageDrawing.y1})<scr(30)) { activeDrawing={type:"move-drawing-endpoint",id:imageDrawing.id,endpoint:1,moved:false,changed:false,armed:true,original:JSON.parse(JSON.stringify(imageDrawing))}; cancelLongPress(); draw(); return; }
            if (dist(p,{x:imageDrawing.x2,y:imageDrawing.y2})<scr(30)) { activeDrawing={type:"move-drawing-endpoint",id:imageDrawing.id,endpoint:2,moved:false,changed:false,armed:true,original:JSON.parse(JSON.stringify(imageDrawing))}; cancelLongPress(); draw(); return; }
          }
          if (wasSelected && imageDrawing.type === "circle" && dist(p, { x: imageDrawing.x2, y: imageDrawing.y2 }) < scr(30)) {
            activeDrawing = { type: "move-resize-shape", id: imageDrawing.id, dx: p.x, dy: p.y, moved: false, changed: false, armed: true, original: JSON.parse(JSON.stringify(imageDrawing)), bounds };
            cancelLongPress(); draw(); return;
          }
          const resizeHit = wasSelected && dist(p, {x:bounds.x2,y:bounds.y2}) < scr(30);
          activeDrawing = { type: resizeHit && imageDrawing.type !== "freehand" && imageDrawing.type !== "polyline" ? "move-resize-shape" : "move-shape", id:imageDrawing.id, dx:p.x, dy:p.y, moved:false, changed:false, armed:wasSelected, original:JSON.parse(JSON.stringify(imageDrawing)), bounds };
          cancelLongPress();
        } else { selectedDrawingId = null; }
      }
      $("textBgToggle").checked = selectedId ? (measures.find(x => x.id === selectedId)?.textBg !== false) : true;
      const selectedDrawing = drawings.find(x => x.id === selectedDrawingId);
      if (selectedDrawing && ["freehand", "line", "rect", "circle", "polyline"].includes(selectedDrawing.type)) {
        widthInput.value = String(selectedDrawing.width || 4);
        colorInput.value = selectedDrawing.color || "#ff3b30";
      }
      syncRectFillControls(selectedDrawing && selectedDrawing.type === "rect" ? selectedDrawing : null);
      draw();
      return;
    }

    if (tool === "eraser") {
      const hit = hitMeasure(p);
      if (hit) {
        if (hit.measure.locked) { toast("🔒 Gesperrt – erst entsperren (lang drücken)."); return; }
        pushHistory(preSnap);
        measures = measures.filter((x) => x.id !== hit.measure.id);
        if (selectedId === hit.measure.id) selectedId = null;
        refresh();
        toast("Maß gelöscht.", "Rückgängig", undo);
      } else {
        const idx = hitDrawing(p);
        if (idx >= 0) { pushHistory(preSnap); const removed = drawings.splice(idx, 1)[0]; if (removed && removed.type === "image") drawingImageCache.delete(removed.id); if (removed && removed.id === selectedDrawingId) selectedDrawingId = null; refresh(); }
      }
      return;
    }

    if (tool === "angle") { activeDrawing = { type: "angle-point", p }; return; }

    if (tool === "text") { // Dialog erst beim Loslassen öffnen (sonst kommt die iOS-Tastatur nicht)
      activeDrawing = { type: "text-place", p };
      return;
    }

    // Polylinie: jeder Tipp setzt einen Punkt; Abschluss über „Fertig“
    if (tool === "polyline") {
      const sn = findSnap(p);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; }
      if (!polylineDraft) {
        polylineDraft = {
          id: nextId++, type: "polyline", points: [{ x: p.x, y: p.y }],
          color: colorInput.value, width: Number(widthInput.value) || 4, closed: false,
          layer: currentLayer()
        };
      } else {
        const last = polylineDraft.points[polylineDraft.points.length - 1];
        if (dist(last, p) > scr(6)) polylineDraft.points.push({ x: p.x, y: p.y });
      }
      syncPolylineActions();
      draw();
      setStatus(`Polylinie: ${polylineDraft.points.length} Punkt(e) – weiter tippen oder „Fertig“.`);
      return;
    }

    if (tool === "measure" || tool === "reference" || tool === "circle") {
      const sn = findSnap(p);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; }
    }
    activeDrawing = {
      id: nextId++, type: tool,
      x1: p.x, y1: p.y, x2: p.x, y2: p.y,
      color: colorInput.value, width: Number(widthInput.value),
      points: tool === "freehand" ? [p] : undefined,
      fill: (tool === "rect" || tool === "circle") ? !!(rectFillToggle && rectFillToggle.checked) : false,
      fillOpacity: (tool === "rect" || tool === "circle") && rectFillOpacity ? Number(rectFillOpacity.value) / 100 : 1,
      value: "", unit: unitSelect.value,
      layer: currentLayer()
    };
  }

  function onPointerMove(e) {
    if (!photoLoaded) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) { // Zoom + Schieben
      multiTouchMode = true;
      hideCrosshair();
      const pts = [...pointers.values()];
      const distNow = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (lastPinchDist > 0) setZoom(viewScale * (distNow / lastPinchDist), mid.x, mid.y);
      if (lastPinchMid) { viewOffsetX += mid.x - lastPinchMid.x; viewOffsetY += mid.y - lastPinchMid.y; applyViewTransform(); }
      lastPinchDist = distNow; lastPinchMid = mid;
      return;
    }
    if (multiTouchMode) return;

    updateCrosshair(e.clientX, e.clientY);
    if (!pointerStart || !activeDrawing || activeDrawing.type === "text-place" || activeDrawing.type === "angle-point") return;

    // kleine Zitterbewegung bei „Antippen / Lang drücken“ ignorieren
    if (/^move-/.test(activeDrawing.type) && !activeDrawing.moved) {
      if (!pressInfo || Math.hypot(e.clientX - pressInfo.x, e.clientY - pressInfo.y) < 8) return;
      activeDrawing.moved = true;
      cancelLongPress();
    }

    let p = pointWithCrosshair(e);

    if (/^move-/.test(activeDrawing.type) && !activeDrawing.armed) return; // nur auswählen, nichts verschieben

    if (activeDrawing.type === "move-text") {
      const d = drawings.find((x) => x.id === activeDrawing.id && x.type === "text");
      if (!d) return;
      activeDrawing.changed = true;
      d.x1 = activeDrawing.original.x1 + (p.x-activeDrawing.dx);
      d.y1 = activeDrawing.original.y1 + (p.y-activeDrawing.dy);
      draw(); return;
    }
    if (activeDrawing.type === "move-image" || activeDrawing.type === "move-resize-image") {
      const d = drawings.find((x) => x.id === activeDrawing.id && x.type === "image");
      if (!d) return;
      activeDrawing.changed = true;
      const dx = p.x - activeDrawing.dx, dy = p.y - activeDrawing.dy;
      if (activeDrawing.type === "move-image") {
        d.x1 = activeDrawing.original.x1 + dx; d.y1 = activeDrawing.original.y1 + dy;
        d.x2 = activeDrawing.original.x2 + dx; d.y2 = activeDrawing.original.y2 + dy;
      } else {
        const minW = scr(40), minH = scr(40);
        d.x2 = Math.max(d.x1 + minW, activeDrawing.original.x2 + dx);
        if (freeResizeToggle.checked) {
          d.y2 = Math.max(d.y1 + minH, activeDrawing.original.y2 + dy);
        } else {
          d.y2 = d.y1 + Math.max(minH, (d.x2 - d.x1) * activeDrawing.aspectRatio);
        }
      }
      draw(); return;
    }
    if (activeDrawing.type === "move-rotate-rect") {
      const d=drawings.find(x=>x.id===activeDrawing.id && x.type==="rect"); if(!d) return;
      activeDrawing.changed=true; d.rotation=activeDrawing.originalRotation + Math.atan2(p.y-activeDrawing.center.y,p.x-activeDrawing.center.x)-activeDrawing.startAngle; draw(); return;
    }
    if (activeDrawing.type === "move-drawing-endpoint") {
      const d=drawings.find(x=>x.id===activeDrawing.id && x.type==="line"); if(!d) return;
      activeDrawing.changed=true; if(activeDrawing.endpoint===1){d.x1=p.x;d.y1=p.y;}else{d.x2=p.x;d.y2=p.y;} draw(); return;
    }
    if (activeDrawing.type === "move-shape" || activeDrawing.type === "move-resize-shape") {
      const d = drawings.find(x => x.id === activeDrawing.id);
      if (!d) return;
      activeDrawing.changed = true;
      const dx = p.x - activeDrawing.dx, dy = p.y - activeDrawing.dy, o = activeDrawing.original;
      if (activeDrawing.type === "move-shape") {
        if (d.type === "freehand" || d.type === "polyline") d.points = (o.points || []).map(q => ({x:q.x+dx,y:q.y+dy}));
        else { d.x1=o.x1+dx; d.y1=o.y1+dy; d.x2=o.x2+dx; d.y2=o.y2+dy; }
      } else if (d.type === "circle") {
        // Radius am Umfangspunkt ändern, Mittelpunkt bleibt
        d.x2 = p.x; d.y2 = p.y;
      } else {
        const b = activeDrawing.bounds, minW = scr(12), minH = scr(12);
        const nx2 = Math.max(b.x1+minW, b.x2+dx), ny2 = Math.max(b.y1+minH, b.y2+dy);
        d.x1=b.x1; d.y1=b.y1; d.x2=nx2; d.y2=ny2;
        if (d.type === "line") { d.x1=b.x1; d.y1=b.y1; }
      }
      draw(); return;
    }
    if (activeDrawing.type === "move-label") {
      const m=measures.find((x)=>x.id===activeDrawing.id);
      if(!m||m.labelLocked) return;
      activeDrawing.changed=true;
      m.labelOffsetX=activeDrawing.originalX+(p.x-activeDrawing.dx);
      m.labelOffsetY=activeDrawing.originalY+(p.y-activeDrawing.dy);
      draw(); return;
    }
    if (activeDrawing.type === "move-measure") {
      const m = measures.find((x) => x.id === activeDrawing.id);
      if (!m || m.locked) return;
      activeDrawing.changed = true;
      const dx = p.x - activeDrawing.dx, dy = p.y - activeDrawing.dy;
      m.x1 = activeDrawing.original.x1 + dx; m.y1 = activeDrawing.original.y1 + dy;
      m.x2 = activeDrawing.original.x2 + dx; m.y2 = activeDrawing.original.y2 + dy;
      if (m.type === "angle") { m.x3 = activeDrawing.original.x3 + dx; m.y3 = activeDrawing.original.y3 + dy; }
      draw();
      return;
    }
    if (activeDrawing.type === "move-endpoint") {
      const m = measures.find((x) => x.id === activeDrawing.id);
      if (!m || m.locked) return;
      activeDrawing.changed = true;
      const sn = findSnap(p, m.id);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; } else snapPoint = null;
      if (activeDrawing.endpoint === 1) {
        m.x1 = p.x; m.y1 = p.y;
        // Basispunkt mitziehen, wenn er bisher am Endpunkt lag (oder noch nicht gesetzt war)
        if (!Number.isFinite(m.baseX1) || (m.baseX1 === activeDrawing.original.x1 && m.baseY1 === activeDrawing.original.y1)) {
          m.baseX1 = p.x; m.baseY1 = p.y;
        }
      } else if (activeDrawing.endpoint === 3 && m.type === "angle") {
        m.x3 = p.x; m.y3 = p.y;
      } else {
        m.x2 = p.x; m.y2 = p.y;
        if (!Number.isFinite(m.baseX2) || (m.baseX2 === activeDrawing.original.x2 && m.baseY2 === activeDrawing.original.y2)) {
          m.baseX2 = p.x; m.baseY2 = p.y;
        }
      }
      if (m.type === "angle") m.value = (Math.abs(angleRadians(m))*180/Math.PI).toFixed(1);
      else if (m.autoCalculated) { const value = calculatedValueFor(m, m.unit); if (value !== null) m.value = value; }
      if (m.isReference) recalculateAutomaticMeasures();
      draw();
      return;
    }
    if (activeDrawing.type === "measure" || activeDrawing.type === "reference") {
      const sn = findSnap(p);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; } else snapPoint = null;
    }
    activeDrawing.x2 = p.x; activeDrawing.y2 = p.y;
    if (activeDrawing.type === "freehand") {
      const last = activeDrawing.points[activeDrawing.points.length - 1];
      if (dist(last, p) > scr(1.5)) activeDrawing.points.push(p);
    }
    draw();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    cancelLongPress();
    if (pointers.size < 2) { lastPinchDist = 0; lastPinchMid = null; }
    if (pointers.size === 0) {
      hideCrosshair();
      if (multiTouchMode) { multiTouchMode = false; endGesture(); return; }
    }
    if (multiTouchMode || pointers.size > 0) return;
    if (!activeDrawing) { pointerStart = null; snapPoint = null; return; }

    const a = activeDrawing;

    if (a.type === "angle-point") {
      const beforeAngleTap = preSnap;
      anglePoints.push({x:a.p.x,y:a.p.y}); endGesture();
      if (anglePoints.length < 3) { setStatus(`Winkel: Punkt ${anglePoints.length} von 3 gesetzt – ${anglePoints.length === 1 ? "Scheitel" : "erster Schenkel"}. Weiter tippen.`); draw(); return; }
      const [v,p1,p2]=anglePoints; anglePoints=[];
      const a1=Math.atan2(p1.y-v.y,p1.x-v.x), a2=Math.atan2(p2.y-v.y,p2.x-v.x);
      const angle=Math.abs(Math.atan2(Math.sin(a2-a1),Math.cos(a2-a1)))*180/Math.PI;
      const id=nextId++; pushHistory(beforeAngleTap);
      measures.push({id,type:"angle",x1:v.x,y1:v.y,x2:p1.x,y2:p1.y,x3:p2.x,y3:p2.y,value:angle.toFixed(1),unit:"°",color:colorInput.value,textBg:$("textBgToggle").checked,layer:currentLayer()});
      selectedId=id; setTool("select"); refresh(); setStatus(`Winkel bemaßt: ${angle.toFixed(1).replace(".",",")}°`); return;
    }

    if (a.type === "text-place") {
      endGesture();
      openTextDialog(a.p);
      return;
    }

    if (a.type === "move-text") {
      if (a.moved && a.changed) { pushHistory(preSnap); scheduleAutosave(); endGesture(); draw(); }
      else { const d = drawings.find((x) => x.id === a.id && x.type === "text"); endGesture(); draw(); if (d && a.armed && selectedDrawingId === d.id) openTextDialog(null, d); }
      return;
    }
    if (a.type === "move-shape" || a.type === "move-resize-shape" || a.type === "move-rotate-rect" || a.type === "move-drawing-endpoint") {
      if (a.moved && a.changed) { pushHistory(preSnap); scheduleAutosave(); }
      endGesture(); draw(); return;
    }
    if (a.type === "move-image" || a.type === "move-resize-image") {
      if (a.moved && a.changed) { pushHistory(preSnap); scheduleAutosave(); }
      endGesture(); draw(); return;
    }
    if (a.type === "move-label") {
      if(a.moved && a.changed) { pushHistory(preSnap); scheduleAutosave(); }
      endGesture(); draw(); renderMeasureList(); return;
    }
    if (a.type === "move-measure" || a.type === "move-endpoint") {
      if (a.moved) {
        if (a.changed) { pushHistory(preSnap); scheduleAutosave(); }
      } else if (a.type === "move-measure") { // Doppel-Tipp öffnet das Wert-Feld
        const now = Date.now();
        if (lastTap.id === a.id && now - lastTap.time < 450) {
          lastTap = { id: null, time: 0 };
          endGesture(); draw(); renderMeasureList();
          openValueDialog(a.id, { fromPointer: true });
          return;
        }
        lastTap = { id: a.id, time: now };
      }
      endGesture(); draw(); renderMeasureList();
      return;
    }

    // Zu kurze Linien / Kreise verwerfen
    if ((a.type === "line" || a.type === "measure" || a.type === "reference" || a.type === "circle") && dist({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) < scr(8)) {
      endGesture(); draw();
      return;
    }

    pushHistory(preSnap);
    let newMeasureId = null;
    if (a.type === "measure" || a.type === "reference") {
      const isRef = a.type === "reference";
      const m = { id: a.id, type: isRef ? "reference" : "linear", isReference: isRef, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, baseX1: a.x1, baseY1: a.y1, baseX2: a.x2, baseY2: a.y2, extensionLines: dimensionExtensionLines.checked, endStyle: dimensionEndStyle.value, endSize: Number(dimensionEndSize.value) || 10, value: "", unit: a.unit || unitSelect.value, color: a.color, textBg: $("textBgToggle").checked, autoCalculated: false, layer: currentLayer() };
      if (!isRef) {
        const value = calculatedValueFor(m, m.unit);
        if (value !== null) { m.value = value; m.autoCalculated = true; }
      }
      measures.push(m);
      selectedId = a.id;
      newMeasureId = a.id;
    } else {
      a.layer = currentLayer();
      drawings.push(a);
    }
    endGesture();
    refresh();
    // Referenzlinie benötigt den bekannten echten Wert; normale Linien fragen nur dann nach, wenn kein Maßstab existiert.
    if (newMeasureId !== null) {
      const created = measures.find((m) => m.id === newMeasureId);
      if (created && (created.isReference || !created.autoCalculated)) openValueDialog(newMeasureId, { isNew: true, fromPointer: true });
      else setStatus(`Berechnet: ${fmt(created.value)}${created.unit || " mm"}. Doppel-Tipp zum manuellen Ändern.`);
    }
  }

  function onPointerCancel(e) { // z. B. System-Geste: nichts übernehmen
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { multiTouchMode = false; hideCrosshair(); }
    endGesture();
    draw();
  }

  canvasWrap.addEventListener("pointerdown", onPointerDown);
  canvasWrap.addEventListener("pointermove", onPointerMove);
  canvasWrap.addEventListener("pointerup", onPointerUp);
  canvasWrap.addEventListener("pointercancel", onPointerCancel);
  canvasWrap.addEventListener("pointerleave", () => { if (pointers.size === 0) hideCrosshair(); });
  canvasWrap.addEventListener("contextmenu", (e) => e.preventDefault());
  // iOS: Tastatur öffnet nur innerhalb der Berührung -> beim touchend nochmal fokussieren
  canvasWrap.addEventListener("touchend", () => {
    const which = pendingFocus; pendingFocus = false;
    try {
      if (which === "value" && !valueDialog.hidden && !dlg.listener) { vInput.focus(); vInput.select(); }
      if (which === "text" && !textDialog.hidden) textDialogInput.focus();
    } catch (_) {}
  }, { passive: true });

  // ---------- Start ----------
  async function restore() {
    try {
      await storage.migrateLegacy();      // ältere Daten (Autosave, benannte Projekte, localStorage) übernehmen
      await storage.purgeTrash();         // Papierkorb nach 30 Tagen leeren
      const items = (await storage.listProjects()).filter((i) => !i.deletedAt);
      if (items.length) await openProject(items[0].id); // zuletzt bearbeitetes Projekt
    } catch (e) {
      setSaveState("error", storage.friendlyError(e));
    }
  }

  setReady(false);
  storage.requestPersistence();
  restore();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("service-worker.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (w) w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) toast("Neue Version geladen – beim nächsten Öffnen aktiv.", null, null, 6000);
        });
      });
    }).catch(() => {});
  }
})();
