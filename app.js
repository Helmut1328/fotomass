(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("editorCanvas");
  const ctx = canvas.getContext("2d");
  const emptyState = $("emptyState");
  const viewport = $("viewport");
  const canvasWrap = $("canvasWrap");
  const crosshairEl = $("crosshair");
  const unitSelect = $("unitSelect");
  const colorInput = $("colorInput");
  const widthInput = $("widthInput");
  const fontSizeInput = $("fontSizeInput");
  const snapToggle = $("snapToggle");
  const crosshairToggle = $("crosshairToggle");
  const textDialog = $("textDialog");
  const textDialogInput = $("textDialogInput");
  const valueDialog = $("valueDialog");
  const valueDialogInput = $("valueDialogInput");
  const valueDialogMic = $("valueDialogMic");
  const valueDialogHint = $("valueDialogHint");
  const zoomLabel = $("zoomLabel");

  let photo = new Image();
  let photoLoaded = false;
  let photoData = null;
  let tool = "select";
  let selectedId = null;
  let measures = [];
  let drawings = [];
  let history = [];
  let nextId = 1;
  let pointerStart = null;
  let activeDrawing = null;
  let pendingTextPoint = null;
  let editingMeasureId = null;
  let snapPoint = null;
  let recognition = null;
  let isListening = false;
  let speechTimeout = null;
  let speechSupported = false;

  // Zoom / Pan
  let viewScale = 1;       // Anzeigemaßstab (1 = fit)
  let viewOffsetX = 0;     // Verschiebung in Viewport-Pixeln
  let viewOffsetY = 0;
  let fitScale = 1;        // Skala, bei der Bild die Fläche füllt
  let isPanning = false;
  let panStart = null;
  let pointers = new Map(); // Multi-Touch für Pinch
  let lastPinchDist = 0;

  // Fadenkreuz: Versatz nach oben, damit Finger nicht verdeckt
  const CROSSHAIR_OFFSET_Y = -52; // px nach oben relativ zum Finger

  const buttons = {
    undo: $("undo"),
    export: $("exportImage"),
    clear: $("clearAll"),
    save: $("saveProject"),
    load: $("loadProject")
  };

  const HANDLE_R = 14;
  const HIT_TOLERANCE = 22;
  const SNAP_DIST = 28;

  // ---------- Speech ----------
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  function initSpeech() {
    if (!SpeechRecognitionAPI) return;
    try {
      recognition = new SpeechRecognitionAPI();
      recognition.lang = "de-DE";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        clearSpeechTimeout();
        const raw = (event.results[0] && event.results[0][0] && event.results[0][0].transcript) || "";
        const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
        if (cleaned) {
          valueDialogInput.value = cleaned;
          valueDialogHint.textContent = "Erkannt: " + cleaned;
        } else {
          valueDialogHint.textContent = "Keine Zahl – bitte tippen.";
        }
        stopListening(false);
      };
      recognition.onerror = (event) => {
        clearSpeechTimeout();
        const err = event.error || "";
        if (err === "not-allowed" || err === "service-not-allowed") {
          valueDialogHint.textContent = "Mikrofon verweigert – tippen.";
        } else if (err === "no-speech") {
          valueDialogHint.textContent = "Nichts gehört – nochmal 🎤.";
        } else if (err !== "aborted") {
          valueDialogHint.textContent = "Sprache nicht verfügbar – tippen.";
        }
        stopListening(false);
      };
      recognition.onend = () => {
        clearSpeechTimeout();
        if (isListening) stopListening(false);
      };
      speechSupported = true;
    } catch (_) {
      speechSupported = false;
    }
  }

  function clearSpeechTimeout() {
    if (speechTimeout) { clearTimeout(speechTimeout); speechTimeout = null; }
  }
  function stopListening(abort) {
    clearSpeechTimeout();
    isListening = false;
    valueDialogMic.classList.remove("listening");
    if (recognition) {
      try { if (abort) recognition.abort(); else recognition.stop(); } catch (_) {}
    }
  }
  function startListening() {
    if (!speechSupported || !recognition) {
      valueDialogHint.textContent = "Sprache nicht unterstützt – tippen.";
      return;
    }
    stopListening(true);
    setTimeout(() => {
      if (valueDialog.hidden) return;
      try {
        isListening = true;
        valueDialogMic.classList.add("listening");
        valueDialogHint.textContent = "Hört zu …";
        recognition.start();
        speechTimeout = setTimeout(() => {
          valueDialogHint.textContent = "Zeit abgelaufen – tippen oder 🎤.";
          stopListening(true);
        }, 6000);
      } catch (_) {
        valueDialogHint.textContent = "Mikrofon nicht startklar – tippen.";
        stopListening(false);
      }
    }, 150);
  }
  initSpeech();

  // ---------- History ----------
  function remember() {
    history.push(JSON.stringify({
      measures: JSON.parse(JSON.stringify(measures)),
      drawings: JSON.parse(JSON.stringify(drawings)),
      selectedId,
      nextId
    }));
    if (history.length > 40) history.shift();
    buttons.undo.disabled = history.length === 0;
  }

  function setReady(ready) {
    buttons.export.disabled = !ready;
    buttons.clear.disabled = !ready;
    buttons.save.disabled = !ready;
    buttons.undo.disabled = history.length === 0;
  }

  function getFontSize() {
    return Number(fontSizeInput.value) || 18;
  }

  // ---------- Zoom / Fit ----------
  function computeFitScale() {
    if (!photoLoaded) return 1;
    const wrap = canvasWrap.getBoundingClientRect();
    const sx = wrap.width / canvas.width;
    const sy = wrap.height / canvas.height;
    // Bild füllt die Fläche (cover-ähnlich, aber contain damit nichts abgeschnitten wird beim Fit)
    return Math.min(sx, sy);
  }

  function applyViewTransform() {
    if (!photoLoaded) return;
    // Canvas zentriert + skaliert + verschoben
    const totalScale = fitScale * viewScale;
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";
    canvas.style.transform =
      `translate(calc(-50% + ${viewOffsetX}px), calc(-50% + ${viewOffsetY}px)) scale(${totalScale})`;
    zoomLabel.textContent = Math.round(viewScale * 100) + " %";
  }

  function fitToView() {
    if (!photoLoaded) return;
    fitScale = computeFitScale();
    viewScale = 1;
    viewOffsetX = 0;
    viewOffsetY = 0;
    applyViewTransform();
  }

  function setZoom(newScale, centerX, centerY) {
    // centerX/Y relativ zum Viewport (optional, für Pinch-Zentrum)
    const prev = viewScale;
    viewScale = Math.max(0.5, Math.min(8, newScale));
    if (centerX != null && centerY != null && prev > 0) {
      const wrap = canvasWrap.getBoundingClientRect();
      const cx = centerX - wrap.left - wrap.width / 2;
      const cy = centerY - wrap.top - wrap.height / 2;
      // Offset so anpassen, dass der Punkt unter dem Finger bleibt
      viewOffsetX = cx - (cx - viewOffsetX) * (viewScale / prev);
      viewOffsetY = cy - (cy - viewOffsetY) * (viewScale / prev);
    }
    applyViewTransform();
  }

  $("zoomIn").addEventListener("click", () => setZoom(viewScale * 1.25));
  $("zoomOut").addEventListener("click", () => setZoom(viewScale / 1.25));
  $("zoomReset").addEventListener("click", () => fitToView());

  window.addEventListener("resize", () => {
    if (photoLoaded) {
      fitScale = computeFitScale();
      applyViewTransform();
    }
  });

  // ---------- Canvas zeichnen ----------
  function resizeCanvas() {
    if (!photoLoaded) return;
    // Interne Auflösung: Original bis max 2000 px
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(photo.naturalWidth, photo.naturalHeight));
    canvas.width = Math.round(photo.naturalWidth * scale);
    canvas.height = Math.round(photo.naturalHeight * scale);
    canvas.style.display = "block";
    emptyState.hidden = true;
    fitToView();
    draw();
  }

  function draw() {
    if (!photoLoaded) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    drawings.forEach((d) => drawShape(d));
    measures.forEach((m) => drawMeasure(m));
    if (activeDrawing && activeDrawing.type !== "move-measure" && activeDrawing.type !== "move-endpoint" && activeDrawing.type !== "pan") {
      if (activeDrawing.type === "measure") drawMeasurePreview(activeDrawing);
      else drawShape(activeDrawing);
    }
    if (snapPoint) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(snapPoint.x, snapPoint.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,200,83,0.35)";
      ctx.fill();
      ctx.strokeStyle = "#00c853";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMeasurePreview(d) {
    ctx.save();
    ctx.strokeStyle = d.color || colorInput.value;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(d.x1, d.y1);
    ctx.lineTo(d.x2, d.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawMeasure(m) {
    const chosen = m.id === selectedId;
    const color = m.color || "#ff3b30";
    const fs = getFontSize();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = chosen ? 4 : 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();

    const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const head = Math.max(9, fs * 0.55);
    [[m.x1, m.y1, angle], [m.x2, m.y2, angle + Math.PI]].forEach(([x, y, a]) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + head * Math.cos(a - 0.45), y + head * Math.sin(a - 0.45));
      ctx.lineTo(x + head * Math.cos(a + 0.45), y + head * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
    });

    const mx = (m.x1 + m.x2) / 2;
    const my = (m.y1 + m.y2) / 2;
    const label = `${m.value || "?"}${m.unit || " mm"}`;
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const th = fs + 6;
    const offset = fs * 0.7;
    let textAngle = angle;
    if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;

    ctx.translate(mx, my);
    ctx.rotate(textAngle);
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.fillRect(-tw / 2 - 5, -offset - th / 2 - 3, tw + 10, th + 6);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, -offset);
    ctx.restore();

    if (chosen) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#1682d5";
      ctx.lineWidth = 1.5;
      const pad = 10;
      ctx.strokeRect(
        Math.min(m.x1, m.x2) - pad,
        Math.min(m.y1, m.y2) - pad,
        Math.abs(m.x2 - m.x1) + pad * 2,
        Math.abs(m.y2 - m.y1) + pad * 2
      );
      ctx.setLineDash([]);
      drawHandle(m.x1, m.y1);
      drawHandle(m.x2, m.y2);
      ctx.restore();
    }
  }

  function drawHandle(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#1682d5";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawShape(d) {
    if (!d) return;
    ctx.save();
    ctx.strokeStyle = d.color || colorInput.value;
    ctx.fillStyle = d.color || colorInput.value;
    ctx.lineWidth = d.width || 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (d.type === "freehand") {
      if (!d.points || d.points.length < 2) { ctx.restore(); return; }
      ctx.beginPath();
      ctx.moveTo(d.points[0].x, d.points[0].y);
      for (let i = 1; i < d.points.length; i++) ctx.lineTo(d.points[i].x, d.points[i].y);
      ctx.stroke();
    } else if (d.type === "line") {
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
    } else if (d.type === "rect") {
      ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
    } else if (d.type === "text") {
      const fs = d.fontSize || getFontSize() + 4;
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(d.text || "Notiz", d.x1, d.y1);
    }
    ctx.restore();
  }

  // ---------- Koordinaten: Screen → Canvas ----------
  function pointFromEvent(e) {
    // Fingerposition → Canvas-Koordinaten unter Berücksichtigung von Zoom/Pan
    const wrap = canvasWrap.getBoundingClientRect();
    const totalScale = fitScale * viewScale;
    // Mittelpunkt des Viewports
    const cx = wrap.left + wrap.width / 2;
    const cy = wrap.top + wrap.height / 2;
    // Position relativ zum zentrierten, skalierten Canvas
    const sx = e.clientX - cx - viewOffsetX;
    const sy = e.clientY - cy - viewOffsetY;
    return {
      x: sx / totalScale + canvas.width / 2,
      y: sy / totalScale + canvas.height / 2
    };
  }

  /** Fadenkreuz-Position: Finger + Offset nach oben (Viewport-Koordinaten) */
  function updateCrosshair(clientX, clientY) {
    if (!crosshairToggle.checked || !photoLoaded) {
      crosshairEl.hidden = true;
      return;
    }
    const wrap = canvasWrap.getBoundingClientRect();
    const x = clientX - wrap.left;
    const y = clientY - wrap.top + CROSSHAIR_OFFSET_Y;
    crosshairEl.hidden = false;
    crosshairEl.style.left = x + "px";
    crosshairEl.style.top = y + "px";
  }

  function hideCrosshair() {
    crosshairEl.hidden = true;
  }

  /**
   * Wenn Fadenkreuz aktiv: Zeichenpunkt = Finger + Offset (in Canvas-Koordinaten)
   */
  function pointWithCrosshair(e) {
    if (!crosshairToggle.checked) return pointFromEvent(e);
    // Virtuellen Punkt erzeugen, der dem Fadenkreuz entspricht
    const fake = {
      clientX: e.clientX,
      clientY: e.clientY + CROSSHAIR_OFFSET_Y
    };
    return pointFromEvent(fake);
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function distanceToSegment(p, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / len2)) : 0;
    return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
  }

  // ---------- Snap ----------
  function getSnapCandidates(excludeId) {
    const pts = [];
    measures.forEach((m) => {
      if (excludeId && m.id === excludeId) return;
      pts.push({ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });
    });
    return pts;
  }
  function findSnap(p, excludeId) {
    if (!snapToggle.checked) return null;
    let best = null, bestDist = SNAP_DIST;
    for (const c of getSnapCandidates(excludeId)) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  // ---------- Hit ----------
  function hitMeasure(p) {
    if (selectedId !== null) {
      const m = measures.find((x) => x.id === selectedId);
      if (m) {
        // Handles skalieren optisch mit Zoom – Toleranz etwas anpassen
        const tol = HANDLE_R + 8;
        if (dist(p, { x: m.x1, y: m.y1 }) < tol) return { measure: m, endpoint: 1 };
        if (dist(p, { x: m.x2, y: m.y2 }) < tol) return { measure: m, endpoint: 2 };
      }
    }
    for (let i = measures.length - 1; i >= 0; i--) {
      const m = measures[i];
      if (distanceToSegment(p, m.x1, m.y1, m.x2, m.y2) < HIT_TOLERANCE) {
        return { measure: m, endpoint: 0 };
      }
    }
    return null;
  }

  function hitDrawing(p) {
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      if (d.type === "freehand" && d.points) {
        for (let j = 0; j < d.points.length - 1; j++) {
          if (distanceToSegment(p, d.points[j].x, d.points[j].y, d.points[j + 1].x, d.points[j + 1].y) < HIT_TOLERANCE) return i;
        }
      } else if (d.type === "line") {
        if (distanceToSegment(p, d.x1, d.y1, d.x2, d.y2) < HIT_TOLERANCE) return i;
      } else if (d.type === "rect") {
        const x1 = Math.min(d.x1, d.x2), y1 = Math.min(d.y1, d.y2);
        const x2 = Math.max(d.x1, d.x2), y2 = Math.max(d.y1, d.y2);
        const near =
          (p.x >= x1 - 8 && p.x <= x2 + 8 && (Math.abs(p.y - y1) < 12 || Math.abs(p.y - y2) < 12)) ||
          (p.y >= y1 - 8 && p.y <= y2 + 8 && (Math.abs(p.x - x1) < 12 || Math.abs(p.x - x2) < 12));
        if (near) return i;
      } else if (d.type === "text") {
        const fs = d.fontSize || getFontSize() + 4;
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        const tw = ctx.measureText(d.text || "Notiz").width;
        if (p.x >= d.x1 - 4 && p.x <= d.x1 + tw + 4 && p.y >= d.y1 - fs && p.y <= d.y1 + 6) return i;
      }
    }
    return -1;
  }

  // ---------- Maßliste ----------
  function renderMeasureList() {
    const list = $("measureList");
    list.replaceChildren();
    if (!measures.length) {
      const p = document.createElement("p");
      p.className = "empty-list";
      p.textContent = "Noch keine Maßlinien.";
      list.append(p);
      return;
    }
    measures.forEach((m, index) => {
      const row = document.createElement("div");
      row.className = "measure-item" + (m.id === selectedId ? " selected" : "");
      const title = document.createElement("button");
      title.type = "button";
      title.className = "secondary";
      title.textContent = `Maß ${index + 1}`;
      title.addEventListener("click", () => {
        selectedId = m.id;
        setTool("select");
        renderMeasureList();
        draw();
      });
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.placeholder = "Wert";
      input.value = m.value ?? "";
      input.addEventListener("change", () => {
        remember();
        m.value = input.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        input.value = m.value;
        draw();
      });
      input.addEventListener("focus", () => { openValueDialog(m.id, false); input.blur(); });
      const mic = document.createElement("button");
      mic.type = "button";
      mic.className = "mic-btn";
      mic.textContent = "🎤";
      mic.addEventListener("click", () => openValueDialog(m.id, true));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "danger delete-measure";
      del.textContent = "✕";
      del.addEventListener("click", () => {
        remember();
        measures = measures.filter((x) => x.id !== m.id);
        if (selectedId === m.id) selectedId = null;
        renderMeasureList();
        draw();
      });
      row.append(title, input, mic, del);
      list.append(row);
    });
  }

  function setTool(name) {
    tool = name;
    document.querySelectorAll(".tool").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === tool);
    });
  }

  // ---------- Foto ----------
  function loadImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Bitte eine Bilddatei wählen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoData = reader.result;
      photo = new Image();
      photo.onload = () => {
        photoLoaded = true;
        $("photoStatus").textContent = file.name || "Foto geladen";
        measures = [];
        drawings = [];
        history = [];
        selectedId = null;
        nextId = 1;
        snapPoint = null;
        resizeCanvas();
        renderMeasureList();
        setReady(true);
        $("saveStatus").textContent = "Foto geladen.";
      };
      photo.onerror = () => alert("Bild konnte nicht geladen werden.");
      photo.src = photoData;
    };
    reader.readAsDataURL(file);
  }

  $("photoCamera").addEventListener("change", (e) => {
    loadImageFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });
  $("photoGallery").addEventListener("change", (e) => {
    loadImageFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });

  // ---------- Buttons ----------
  buttons.undo.addEventListener("click", () => {
    const last = history.pop();
    if (!last) return;
    const state = JSON.parse(last);
    measures = state.measures;
    drawings = state.drawings;
    selectedId = state.selectedId;
    nextId = state.nextId || nextId;
    snapPoint = null;
    renderMeasureList();
    draw();
    buttons.undo.disabled = history.length === 0;
  });

  buttons.clear.addEventListener("click", () => {
    if (!confirm("Alle Maßlinien und Zeichnungen löschen?")) return;
    remember();
    measures = [];
    drawings = [];
    selectedId = null;
    snapPoint = null;
    renderMeasureList();
    draw();
  });

  buttons.export.addEventListener("click", () => {
    if (!photoLoaded) return;
    const name = ($("projectName").value.trim() || "fotomass").replace(/[^\w\-äöüÄÖÜß]+/g, "_");
    const a = document.createElement("a");
    a.download = name + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  });

  buttons.save.addEventListener("click", () => {
    if (!photoLoaded) return;
    try {
      const payload = {
        version: 5,
        projectName: $("projectName").value,
        photoData, measures, drawings, nextId,
        unit: unitSelect.value,
        snap: snapToggle.checked,
        fontSize: getFontSize(),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem("fotomass-project", JSON.stringify(payload));
      $("saveStatus").textContent = "Gespeichert (" + new Date().toLocaleString("de-DE") + ").";
    } catch (_) {
      $("saveStatus").textContent = "Speichern fehlgeschlagen – PNG exportieren.";
    }
  });

  buttons.load.addEventListener("click", () => loadProject(true));

  function loadProject(showFeedback) {
    try {
      const raw = localStorage.getItem("fotomass-project");
      if (!raw) {
        if (showFeedback) $("saveStatus").textContent = "Kein Projekt gefunden.";
        return;
      }
      const data = JSON.parse(raw);
      if (!data.photoData) {
        if (showFeedback) $("saveStatus").textContent = "Daten unvollständig.";
        return;
      }
      photoData = data.photoData;
      photo = new Image();
      photo.onload = () => {
        photoLoaded = true;
        $("photoStatus").textContent = "Gespeichertes Projekt";
        $("projectName").value = data.projectName || "";
        measures = data.measures || [];
        drawings = data.drawings || [];
        nextId = data.nextId || 1;
        selectedId = null;
        history = [];
        snapPoint = null;
        if (data.unit) unitSelect.value = data.unit;
        if (typeof data.snap === "boolean") snapToggle.checked = data.snap;
        if (data.fontSize) fontSizeInput.value = data.fontSize;
        resizeCanvas();
        renderMeasureList();
        setReady(true);
        if (showFeedback) {
          const when = data.savedAt ? new Date(data.savedAt).toLocaleString("de-DE") : "";
          $("saveStatus").textContent = "Geladen" + (when ? " (" + when + ")" : "") + ".";
        }
      };
      photo.onerror = () => {
        if (showFeedback) $("saveStatus").textContent = "Foto nicht ladbar.";
      };
      photo.src = photoData;
    } catch (_) {
      if (showFeedback) $("saveStatus").textContent = "Laden fehlgeschlagen.";
    }
  }

  $("styleToggle").addEventListener("click", () => {
    document.body.classList.toggle("site-bold");
    $("styleToggle").textContent = document.body.classList.contains("site-bold") ? "Technisch" : "Baustellenstil";
  });

  colorInput.addEventListener("change", () => {
    if (selectedId === null) return;
    const m = measures.find((x) => x.id === selectedId);
    if (m) { remember(); m.color = colorInput.value; draw(); }
  });
  unitSelect.addEventListener("change", () => {
    if (selectedId === null) return;
    const m = measures.find((x) => x.id === selectedId);
    if (m) { remember(); m.unit = unitSelect.value; draw(); renderMeasureList(); }
  });
  fontSizeInput.addEventListener("input", () => draw());
  document.querySelectorAll(".tool").forEach((b) => {
    b.addEventListener("click", () => setTool(b.dataset.tool));
  });

  // ---------- Dialoge ----------
  function openTextDialog(point) {
    pendingTextPoint = point;
    textDialogInput.value = "";
    textDialog.hidden = false;
    setTimeout(() => textDialogInput.focus(), 50);
  }
  function closeTextDialog() {
    textDialog.hidden = true;
    pendingTextPoint = null;
  }
  $("textDialogCancel").addEventListener("click", closeTextDialog);
  $("textDialogOk").addEventListener("click", () => {
    const txt = textDialogInput.value.trim();
    if (txt && pendingTextPoint) {
      remember();
      drawings.push({
        id: nextId++, type: "text",
        x1: pendingTextPoint.x, y1: pendingTextPoint.y,
        text: txt, color: colorInput.value,
        width: Number(widthInput.value), fontSize: getFontSize() + 4
      });
      draw();
    }
    closeTextDialog();
  });
  textDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("textDialogOk").click();
    if (e.key === "Escape") closeTextDialog();
  });

  function openValueDialog(measureId, startMic) {
    stopListening(true);
    editingMeasureId = measureId;
    const m = measures.find((x) => x.id === measureId);
    valueDialogInput.value = m ? (m.value || "") : "";
    valueDialogHint.textContent = speechSupported ? "Zahl tippen oder 🎤" : "Bitte tippen.";
    valueDialog.hidden = false;
    setTimeout(() => {
      valueDialogInput.focus();
      if (startMic && speechSupported) startListening();
    }, 100);
  }
  function closeValueDialog() {
    stopListening(true);
    valueDialog.hidden = true;
    editingMeasureId = null;
  }
  $("valueDialogCancel").addEventListener("click", closeValueDialog);
  $("valueDialogOk").addEventListener("click", () => {
    if (editingMeasureId !== null) {
      const m = measures.find((x) => x.id === editingMeasureId);
      if (m) {
        remember();
        m.value = valueDialogInput.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        draw();
        renderMeasureList();
      }
    }
    closeValueDialog();
  });
  valueDialogMic.addEventListener("click", () => {
    if (isListening) {
      stopListening(true);
      valueDialogHint.textContent = "Gestoppt – tippen oder 🎤.";
    } else startListening();
  });
  valueDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("valueDialogOk").click();
    if (e.key === "Escape") closeValueDialog();
  });

  // ---------- Pointer / Touch (inkl. Pinch-Zoom) ----------
  function onPointerDown(e) {
    if (!photoLoaded) return;
    e.preventDefault();
    canvasWrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Zwei Finger → Pinch vorbereiten
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      activeDrawing = null;
      pointerStart = null;
      hideCrosshair();
      return;
    }

    updateCrosshair(e.clientX, e.clientY);
    let p = pointWithCrosshair(e);
    pointerStart = p;
    snapPoint = null;

    // Pan-Werkzeug oder mittlerer/rechter Klick
    if (tool === "pan") {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, ox: viewOffsetX, oy: viewOffsetY };
      activeDrawing = { type: "pan" };
      return;
    }

    if (tool === "select") {
      const hit = hitMeasure(p);
      if (hit) {
        selectedId = hit.measure.id;
        remember();
        if (hit.endpoint === 1 || hit.endpoint === 2) {
          activeDrawing = { type: "move-endpoint", id: hit.measure.id, endpoint: hit.endpoint };
        } else {
          activeDrawing = {
            type: "move-measure", id: hit.measure.id,
            dx: p.x, dy: p.y,
            original: { x1: hit.measure.x1, y1: hit.measure.y1, x2: hit.measure.x2, y2: hit.measure.y2 },
            moved: false
          };
        }
      } else {
        selectedId = null;
        // Tippen ins Leere bei Zoom > 1 → Schieben erlauben
        if (viewScale > 1.05) {
          isPanning = true;
          panStart = { x: e.clientX, y: e.clientY, ox: viewOffsetX, oy: viewOffsetY };
          activeDrawing = { type: "pan" };
        }
      }
      renderMeasureList();
      draw();
      return;
    }

    if (tool === "eraser") {
      const hit = hitMeasure(p);
      if (hit) {
        remember();
        measures = measures.filter((x) => x.id !== hit.measure.id);
        if (selectedId === hit.measure.id) selectedId = null;
      } else {
        const idx = hitDrawing(p);
        if (idx >= 0) { remember(); drawings.splice(idx, 1); }
      }
      renderMeasureList();
      draw();
      return;
    }

    if (tool === "text") {
      openTextDialog(p);
      return;
    }

    remember();
    if (tool === "measure") {
      const sn = findSnap(p);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; }
    }

    activeDrawing = {
      id: nextId++,
      type: tool,
      x1: p.x, y1: p.y, x2: p.x, y2: p.y,
      color: colorInput.value,
      width: Number(widthInput.value),
      points: tool === "freehand" ? [p] : undefined,
      value: "",
      unit: unitSelect.value
    };
  }

  function onPointerMove(e) {
    if (!photoLoaded) return;
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-Zoom
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        setZoom(viewScale * factor, midX, midY);
      }
      lastPinchDist = dist;
      hideCrosshair();
      return;
    }

    updateCrosshair(e.clientX, e.clientY);

    if (!pointerStart && !isPanning) return;

    // Pan
    if (isPanning && panStart) {
      viewOffsetX = panStart.ox + (e.clientX - panStart.x);
      viewOffsetY = panStart.oy + (e.clientY - panStart.y);
      applyViewTransform();
      return;
    }

    if (!activeDrawing) return;
    let p = pointWithCrosshair(e);

    if (activeDrawing.type === "move-measure") {
      const m = measures.find((x) => x.id === activeDrawing.id);
      if (!m) return;
      const dx = p.x - activeDrawing.dx;
      const dy = p.y - activeDrawing.dy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) activeDrawing.moved = true;
      m.x1 = activeDrawing.original.x1 + dx;
      m.y1 = activeDrawing.original.y1 + dy;
      m.x2 = activeDrawing.original.x2 + dx;
      m.y2 = activeDrawing.original.y2 + dy;
      draw();
      return;
    }

    if (activeDrawing.type === "move-endpoint") {
      const m = measures.find((x) => x.id === activeDrawing.id);
      if (!m) return;
      const sn = findSnap(p, m.id);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; }
      else snapPoint = null;
      if (activeDrawing.endpoint === 1) { m.x1 = p.x; m.y1 = p.y; }
      else { m.x2 = p.x; m.y2 = p.y; }
      draw();
      return;
    }

    if (activeDrawing.type === "pan") return;

    if (activeDrawing.type === "measure") {
      const sn = findSnap(p);
      if (sn) { p = { x: sn.x, y: sn.y }; snapPoint = sn; }
      else snapPoint = null;
    }

    activeDrawing.x2 = p.x;
    activeDrawing.y2 = p.y;
    if (activeDrawing.type === "freehand") activeDrawing.points.push(p);
    draw();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) hideCrosshair();

    if (isPanning) {
      isPanning = false;
      panStart = null;
      activeDrawing = null;
      pointerStart = null;
      return;
    }

    if (!activeDrawing) {
      pointerStart = null;
      snapPoint = null;
      return;
    }

    if (activeDrawing.type === "move-measure") {
      if (!activeDrawing.moved) openValueDialog(activeDrawing.id, false);
      activeDrawing = null;
      pointerStart = null;
      snapPoint = null;
      draw();
      renderMeasureList();
      return;
    }

    if (activeDrawing.type === "move-endpoint" || activeDrawing.type === "pan") {
      activeDrawing = null;
      pointerStart = null;
      snapPoint = null;
      draw();
      renderMeasureList();
      return;
    }

    if (
      (activeDrawing.type === "line" || activeDrawing.type === "measure") &&
      dist({ x: activeDrawing.x1, y: activeDrawing.y1 }, { x: activeDrawing.x2, y: activeDrawing.y2 }) < 8
    ) {
      activeDrawing = null;
      pointerStart = null;
      snapPoint = null;
      draw();
      return;
    }

    if (activeDrawing.type === "measure") {
      measures.push({
        id: activeDrawing.id,
        x1: activeDrawing.x1, y1: activeDrawing.y1,
        x2: activeDrawing.x2, y2: activeDrawing.y2,
        value: "", unit: activeDrawing.unit || unitSelect.value,
        color: activeDrawing.color
      });
      selectedId = activeDrawing.id;
      openValueDialog(activeDrawing.id, false);
    } else if (activeDrawing.type !== "pan") {
      drawings.push(activeDrawing);
    }

    activeDrawing = null;
    pointerStart = null;
    snapPoint = null;
    draw();
    renderMeasureList();
  }

  canvasWrap.addEventListener("pointerdown", onPointerDown);
  canvasWrap.addEventListener("pointermove", onPointerMove);
  canvasWrap.addEventListener("pointerup", onPointerUp);
  canvasWrap.addEventListener("pointercancel", onPointerUp);
  canvasWrap.addEventListener("pointerleave", () => hideCrosshair());

  $("projectName").addEventListener("input", () => {
    if (photoLoaded) buttons.save.disabled = false;
  });

  setReady(false);
  loadProject(false);
})();
