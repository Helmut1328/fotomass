(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("editorCanvas");
  const ctx = canvas.getContext("2d");
  const emptyState = $("emptyState");
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
  let lastTapTime = 0;
  let lastTapMeasureId = null;

  // Zoom / Pan (nur mit 2 Fingern)
  let viewScale = 1;
  let viewOffsetX = 0;
  let viewOffsetY = 0;
  let fitScale = 1;
  let pointers = new Map();
  let lastPinchDist = 0;
  let lastPinchMid = null;
  let multiTouchMode = false; // true sobald 2 Finger aktiv waren

  const CROSSHAIR_OFFSET_Y = -52;
  const HANDLE_R = 22;
  const HIT_TOLERANCE = 26;
  const SNAP_DIST = 28;

  const buttons = {
    undo: $("undo"),
    export: $("exportImage"),
    clear: $("clearAll"),
    save: $("saveProject"),
    load: $("loadProject")
  };

  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ---------- Sprache ----------
  const DE_NUM = {
    null: 0, nullen: 0, eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, funf: 5,
    sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwolf: 12,
    dreizehn: 13, vierzehn: 14, fünfzehn: 15, funfzehn: 15, sechzehn: 16, siebzehn: 17,
    achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40,
    fünfzig: 50, funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
    hundert: 100, tausend: 1000
  };

  function parseSpokenNumber(raw) {
    if (!raw) return "";
    // Ziffern direkt
    const digits = raw.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    if (digits && /\d/.test(digits)) return digits;

    // Einfache deutsche Zahlwörter
    const tokens = raw.toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z\s-]/g, " ")
      .split(/[\s-]+/)
      .filter(Boolean);

    let total = 0;
    let current = 0;
    let found = false;
    for (const t of tokens) {
      const key = t.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü");
      // normalize back for lookup without umlauts too
      const v = DE_NUM[t] !== undefined ? DE_NUM[t]
        : (DE_NUM[key] !== undefined ? DE_NUM[key] : undefined);
      if (v === undefined) continue;
      found = true;
      if (v === 1000) {
        current = (current || 1) * 1000;
        total += current;
        current = 0;
      } else if (v === 100) {
        current = (current || 1) * 100;
      } else if (v >= 20) {
        current += v;
      } else {
        current += v;
      }
    }
    total += current;
    return found ? String(total) : "";
  }

  function speakNumber() {
    if (!SpeechAPI) {
      valueDialogHint.textContent = "Sprache wird hier nicht unterstützt (Chrome/Android empfohlen). Bitte tippen.";
      return;
    }
    // Nur bei HTTPS oder localhost
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      valueDialogHint.textContent = "Sprache braucht HTTPS (z. B. GitHub Pages). Bitte tippen.";
      return;
    }

    try {
      if (window._fmRec) {
        window._fmRec.onresult = null;
        window._fmRec.onerror = null;
        window._fmRec.onend = null;
        try { window._fmRec.abort(); } catch (_) {}
        window._fmRec = null;
      }
    } catch (_) {}

    let rec;
    try {
      rec = new SpeechAPI();
    } catch (_) {
      valueDialogHint.textContent = "Sprache nicht startbar – bitte tippen.";
      return;
    }

    window._fmRec = rec;
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    valueDialogMic.classList.add("listening");
    valueDialogHint.textContent = "Hört zu … Zahl sagen (z. B. „1234“ oder „zwölfhundert“).";

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      valueDialogMic.classList.remove("listening");
      try { rec.stop(); } catch (_) {}
      try { rec.abort(); } catch (_) {}
      window._fmRec = null;
    };

    const timeout = setTimeout(() => {
      valueDialogHint.textContent = "Zeit abgelaufen – nochmal 🎤 oder tippen.";
      finish();
    }, 8000);

    rec.onresult = (ev) => {
      let best = "";
      let rawBest = "";
      for (let i = 0; i < ev.results.length; i++) {
        for (let j = 0; j < ev.results[i].length; j++) {
          const t = ev.results[i][j].transcript || "";
          const num = parseSpokenNumber(t);
          if (num && num.length >= best.length) {
            best = num;
            rawBest = t;
          }
          if (!rawBest) rawBest = t;
        }
        // finales Ergebnis
        if (ev.results[i].isFinal && best) {
          clearTimeout(timeout);
          valueDialogInput.value = best;
          valueDialogHint.textContent = "Erkannt: " + best;
          finish();
          return;
        }
      }
      if (best) {
        valueDialogInput.value = best;
        valueDialogHint.textContent = "… " + best;
      } else if (rawBest) {
        valueDialogHint.textContent = "… „" + rawBest + "“";
      }
    };

    rec.onerror = (ev) => {
      clearTimeout(timeout);
      const err = ev.error || "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        valueDialogHint.textContent = "Mikrofon verweigert – in Browser-Einstellungen erlauben.";
      } else if (err === "no-speech") {
        valueDialogHint.textContent = "Nichts gehört – nochmal 🎤.";
      } else if (err === "network") {
        valueDialogHint.textContent = "Netzwerkfehler bei Sprache – bitte tippen.";
      } else if (err !== "aborted") {
        valueDialogHint.textContent = "Sprache-Fehler (" + err + ") – bitte tippen.";
      }
      finish();
    };

    rec.onend = () => {
      clearTimeout(timeout);
      if (!finished) {
        if (!valueDialogInput.value) {
          valueDialogHint.textContent = "Keine Zahl erkannt – nochmal 🎤 oder tippen.";
        }
        finish();
      }
    };

    // Direkt im User-Gesture-Kontext starten
    try {
      rec.start();
    } catch (e) {
      clearTimeout(timeout);
      valueDialogHint.textContent = "Start fehlgeschlagen – 1 Sek. warten, nochmal 🎤.";
      finish();
    }
  }

  function stopSpeech() {
    try {
      if (window._fmRec) {
        window._fmRec.onresult = null;
        window._fmRec.onerror = null;
        window._fmRec.onend = null;
        try { window._fmRec.abort(); } catch (_) {}
        window._fmRec = null;
      }
    } catch (_) {}
    valueDialogMic.classList.remove("listening");
  }

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

  function hideEmptyState() {
    emptyState.hidden = true;
    emptyState.classList.add("is-hidden");
    emptyState.style.display = "none";
  }

  function showEmptyState() {
    emptyState.hidden = false;
    emptyState.classList.remove("is-hidden");
    emptyState.style.display = "";
  }

  // ---------- Zoom / Fit ----------
  function computeFitScale() {
    if (!photoLoaded) return 1;
    const wrap = canvasWrap.getBoundingClientRect();
    const sx = wrap.width / canvas.width;
    const sy = wrap.height / canvas.height;
    return Math.min(sx, sy);
  }

  function applyViewTransform() {
    if (!photoLoaded) return;
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

  function setZoom(newScale, midClientX, midClientY) {
    const prev = viewScale;
    viewScale = Math.max(0.4, Math.min(8, newScale));
    if (midClientX != null && midClientY != null && prev > 0) {
      const wrap = canvasWrap.getBoundingClientRect();
      const cx = midClientX - wrap.left - wrap.width / 2;
      const cy = midClientY - wrap.top - wrap.height / 2;
      viewOffsetX = cx - (cx - viewOffsetX) * (viewScale / prev);
      viewOffsetY = cy - (cy - viewOffsetY) * (viewScale / prev);
    }
    applyViewTransform();
  }

  $("zoomIn").addEventListener("click", () => setZoom(viewScale * 1.25));
  $("zoomOut").addEventListener("click", () => setZoom(viewScale / 1.25));
  $("zoomReset").addEventListener("click", () => fitToView());
  window.addEventListener("resize", () => {
    if (photoLoaded) { fitScale = computeFitScale(); applyViewTransform(); }
  });

  // ---------- Canvas ----------
  function resizeCanvas() {
    if (!photoLoaded) return;
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(photo.naturalWidth, photo.naturalHeight));
    canvas.width = Math.round(photo.naturalWidth * scale);
    canvas.height = Math.round(photo.naturalHeight * scale);
    canvas.style.display = "block";
    hideEmptyState();
    fitToView();
    draw();
  }

  function draw() {
    if (!photoLoaded) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    drawings.forEach((d) => drawShape(d));
    measures.forEach((m) => drawMeasure(m));
    if (activeDrawing && activeDrawing.type !== "move-measure" && activeDrawing.type !== "move-endpoint") {
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
    // Äußerer Ring (leicht zu treffen)
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(22, 130, 213, 0.25)";
    ctx.fill();
    ctx.strokeStyle = "#1682d5";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Innerer Punkt
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#1682d5";
    ctx.lineWidth = 2;
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

  // ---------- Koordinaten ----------
  function pointFromEvent(e) {
    const wrap = canvasWrap.getBoundingClientRect();
    const totalScale = fitScale * viewScale;
    const cx = wrap.left + wrap.width / 2;
    const cy = wrap.top + wrap.height / 2;
    const sx = e.clientX - cx - viewOffsetX;
    const sy = e.clientY - cy - viewOffsetY;
    return {
      x: sx / totalScale + canvas.width / 2,
      y: sy / totalScale + canvas.height / 2
    };
  }

  function updateCrosshair(clientX, clientY) {
    if (!crosshairToggle.checked || !photoLoaded || multiTouchMode) {
      crosshairEl.hidden = true;
      return;
    }
    const wrap = canvasWrap.getBoundingClientRect();
    crosshairEl.hidden = false;
    crosshairEl.style.left = (clientX - wrap.left) + "px";
    crosshairEl.style.top = (clientY - wrap.top + CROSSHAIR_OFFSET_Y) + "px";
  }

  function hideCrosshair() {
    crosshairEl.hidden = true;
  }

  function pointWithCrosshair(e) {
    if (!crosshairToggle.checked) return pointFromEvent(e);
    return pointFromEvent({ clientX: e.clientX, clientY: e.clientY + CROSSHAIR_OFFSET_Y });
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

  function findSnap(p, excludeId) {
    if (!snapToggle.checked) return null;
    let best = null, bestDist = SNAP_DIST;
    measures.forEach((m) => {
      if (excludeId && m.id === excludeId) return;
      [{ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 }].forEach((c) => {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < bestDist) { bestDist = d; best = c; }
      });
    });
    return best;
  }

  function hitMeasure(p) {
    const tol = HANDLE_R + 14;
    // Zuerst ALLE Endpunkte (leichter greifbar)
    for (let i = measures.length - 1; i >= 0; i--) {
      const m = measures[i];
      if (dist(p, { x: m.x1, y: m.y1 }) < tol) return { measure: m, endpoint: 1 };
      if (dist(p, { x: m.x2, y: m.y2 }) < tol) return { measure: m, endpoint: 2 };
    }
    // Dann Liniensegmente
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
        version: 6,
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
    stopSpeech();
    editingMeasureId = measureId;
    const m = measures.find((x) => x.id === measureId);
    valueDialogInput.value = m ? (m.value || "") : "";
    valueDialogHint.textContent = SpeechAPI
      ? "Zahl tippen oder 🎤 antippen"
      : "Sprache nicht verfügbar – bitte tippen.";
    valueDialog.hidden = false;
    // Sprache SOFORT starten (User-Gesture darf nicht durch setTimeout unterbrochen werden)
    if (startMic) {
      speakNumber();
    }
    setTimeout(() => {
      try { valueDialogInput.focus(); } catch (_) {}
    }, 80);
  }
  function closeValueDialog() {
    stopSpeech();
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
    if (valueDialogMic.classList.contains("listening")) {
      stopSpeech();
      valueDialogHint.textContent = "Gestoppt – tippen oder nochmal 🎤.";
    } else {
      speakNumber();
    }
  });
  valueDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("valueDialogOk").click();
    if (e.key === "Escape") closeValueDialog();
  });

  // ---------- Pointer: 1 Finger = Werkzeug, 2 Finger = Zoom + Schieben ----------
  function onPointerDown(e) {
    if (!photoLoaded) return;
    e.preventDefault();
    canvasWrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Zweiter Finger → Multi-Touch: laufende Zeichnung abbrechen
    if (pointers.size >= 2) {
      multiTouchMode = true;
      activeDrawing = null;
      pointerStart = null;
      snapPoint = null;
      hideCrosshair();
      const pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      lastPinchMid = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
      draw();
      return;
    }

    // Ein Finger = Werkzeug
    multiTouchMode = false;
    updateCrosshair(e.clientX, e.clientY);
    let p = pointWithCrosshair(e);
    pointerStart = p;
    snapPoint = null;

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

    // --- Zwei Finger: Zoom + Pan ---
    if (pointers.size >= 2) {
      multiTouchMode = true;
      hideCrosshair();
      const pts = [...pointers.values()];
      const distNow = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };

      if (lastPinchDist > 0) {
        const factor = distNow / lastPinchDist;
        // Zoom um die Mitte der beiden Finger
        setZoom(viewScale * factor, mid.x, mid.y);
      }
      if (lastPinchMid) {
        // Pan = Verschiebung der Fingermitte
        viewOffsetX += mid.x - lastPinchMid.x;
        viewOffsetY += mid.y - lastPinchMid.y;
        applyViewTransform();
      }

      lastPinchDist = distNow;
      lastPinchMid = mid;
      return;
    }

    // --- Ein Finger: Werkzeug ---
    if (multiTouchMode) return; // nach Multi-Touch erst loslassen

    updateCrosshair(e.clientX, e.clientY);
    if (!pointerStart || !activeDrawing) return;

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

    if (pointers.size < 2) {
      lastPinchDist = 0;
      lastPinchMid = null;
    }
    if (pointers.size === 0) {
      hideCrosshair();
      // Multi-Touch beendet – keine Werkzeug-Aktion aus dem Rest-Finger
      if (multiTouchMode) {
        multiTouchMode = false;
        activeDrawing = null;
        pointerStart = null;
        snapPoint = null;
        return;
      }
    }

    if (multiTouchMode || pointers.size > 0) return;

    if (!activeDrawing) {
      pointerStart = null;
      snapPoint = null;
      return;
    }

    if (activeDrawing.type === "move-measure") {
      // Nur Doppel-Tipp öffnet den Wert-Dialog
      if (!activeDrawing.moved) {
        const now = Date.now();
        if (lastTapMeasureId === activeDrawing.id && (now - lastTapTime) < 450) {
          openValueDialog(activeDrawing.id, false);
          lastTapTime = 0;
          lastTapMeasureId = null;
        } else {
          lastTapTime = now;
          lastTapMeasureId = activeDrawing.id;
        }
      }
      activeDrawing = null;
      pointerStart = null;
      snapPoint = null;
      draw();
      renderMeasureList();
      return;
    }

    if (activeDrawing.type === "move-endpoint") {
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
      // Wert nur per Doppel-Tipp oder über die Maßliste
    } else {
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
  canvasWrap.addEventListener("pointerleave", (e) => {
    if (pointers.size === 0) hideCrosshair();
  });

  $("projectName").addEventListener("input", () => {
    if (photoLoaded) buttons.save.disabled = false;
  });

  setReady(false);
  loadProject(false);
})();
