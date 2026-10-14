(() => {
  "use strict";

  // ---------- DOM-Helfer ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $("editorCanvas");
  const ctx = canvas.getContext("2d");
  const photoInput = $("photoInput");
  const emptyState = $("emptyState");
  const unitSelect = $("unitSelect");
  const colorInput = $("colorInput");
  const widthInput = $("widthInput");
  const textDialog = $("textDialog");
  const textDialogInput = $("textDialogInput");

  // ---------- Zustand ----------
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
  let activeDrawing = null; // laufende Zeichnung oder Move-Aktion
  let pendingTextPoint = null;

  const buttons = {
    undo: $("undo"),
    export: $("exportImage"),
    clear: $("clearAll"),
    save: $("saveProject"),
    load: $("loadProject")
  };

  const HANDLE_R = 14;       // Radius der Endpunkt-Handles (Canvas-Pixel)
  const HIT_TOLERANCE = 22;  // Treffer-Toleranz für Linien

  // ---------- History ----------
  function remember() {
    history.push(JSON.stringify({
      measures: structuredClone ? structuredClone(measures) : JSON.parse(JSON.stringify(measures)),
      drawings: structuredClone ? structuredClone(drawings) : JSON.parse(JSON.stringify(drawings)),
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

  // ---------- Canvas Größe ----------
  function resizeCanvas() {
    if (!photoLoaded) return;
    const maxWidth = 1800;
    const scale = Math.min(1, maxWidth / photo.naturalWidth);
    canvas.width = Math.round(photo.naturalWidth * scale);
    canvas.height = Math.round(photo.naturalHeight * scale);
    draw();
  }

  // ---------- Zeichnen ----------
  function draw() {
    if (!photoLoaded) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    drawings.forEach((d) => drawShape(d));
    measures.forEach((m) => drawMeasure(m));
    if (activeDrawing && activeDrawing.type !== "move-measure" && activeDrawing.type !== "move-endpoint") {
      drawShape(activeDrawing);
    }
  }

  function drawMeasure(m) {
    const chosen = m.id === selectedId;
    const color = m.color || "#ff3b30";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = chosen ? 4 : 3;
    ctx.lineCap = "round";

    // Linie
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();

    // Pfeilspitzen
    const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const head = 11;
    [
      [m.x1, m.y1, angle],
      [m.x2, m.y2, angle + Math.PI]
    ].forEach(([x, y, a]) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + head * Math.cos(a - 0.45), y + head * Math.sin(a - 0.45));
      ctx.lineTo(x + head * Math.cos(a + 0.45), y + head * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
    });

    // Beschriftung
    const mx = (m.x1 + m.x2) / 2;
    const my = (m.y1 + m.y2) / 2;
    const label = `${m.value || "?"}${m.unit || " mm"}`;
    ctx.font = "bold 17px system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.fillRect(mx - tw / 2 - 5, my - 26, tw + 10, 24);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my - 14);

    // Auswahlrahmen + Endpunkt-Handles
    if (chosen) {
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

      // Handles
      drawHandle(m.x1, m.y1);
      drawHandle(m.x2, m.y2);
    }
    ctx.restore();
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
      for (let i = 1; i < d.points.length; i++) {
        ctx.lineTo(d.points[i].x, d.points[i].y);
      }
      ctx.stroke();
    } else if (d.type === "line" || d.type === "measure") {
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
    } else if (d.type === "rect") {
      ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
    } else if (d.type === "text") {
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(d.text || "Notiz", d.x1, d.y1);
    }
    ctx.restore();
  }

  // ---------- Maßliste ----------
  function renderMeasureList() {
    const list = $("measureList");
    list.replaceChildren();

    if (!measures.length) {
      const p = document.createElement("p");
      p.className = "empty-list";
      p.textContent = "Noch keine Maßlinien angelegt.";
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
      input.type = "number";
      input.inputMode = "decimal";
      input.step = "any";
      input.placeholder = "Wert";
      input.setAttribute("aria-label", `Wert für Maß ${index + 1}`);
      input.value = m.value ?? "";
      input.addEventListener("change", () => {
        remember();
        m.value = input.value;
        draw();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "danger delete-measure";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Maß ${index + 1} löschen`);
      del.addEventListener("click", () => {
        remember();
        measures = measures.filter((x) => x.id !== m.id);
        if (selectedId === m.id) selectedId = null;
        renderMeasureList();
        draw();
      });

      row.append(title, input, del);
      list.append(row);
    });
  }

  // ---------- Werkzeug ----------
  function setTool(name) {
    tool = name;
    document.querySelectorAll(".tool").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === tool);
    });
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
  }

  // ---------- Koordinaten ----------
  function pointFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height)
    };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function distanceToSegment(p, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / len2)) : 0;
    return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
  }

  // ---------- Hit-Tests ----------
  function hitMeasure(p) {
    // Zuerst Endpunkte der ausgewählten Maßlinie prüfen
    if (selectedId !== null) {
      const m = measures.find((x) => x.id === selectedId);
      if (m) {
        if (dist(p, { x: m.x1, y: m.y1 }) < HANDLE_R + 6) return { measure: m, endpoint: 1 };
        if (dist(p, { x: m.x2, y: m.y2 }) < HANDLE_R + 6) return { measure: m, endpoint: 2 };
      }
    }
    // Dann Segmente (von oben nach unten)
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
          if (distanceToSegment(p, d.points[j].x, d.points[j].y, d.points[j + 1].x, d.points[j + 1].y) < HIT_TOLERANCE) {
            return i;
          }
        }
      } else if (d.type === "line") {
        if (distanceToSegment(p, d.x1, d.y1, d.x2, d.y2) < HIT_TOLERANCE) return i;
      } else if (d.type === "rect") {
        const x1 = Math.min(d.x1, d.x2);
        const y1 = Math.min(d.y1, d.y2);
        const x2 = Math.max(d.x1, d.x2);
        const y2 = Math.max(d.y1, d.y2);
        // Rand treffen
        const nearBorder =
          (p.x >= x1 - 8 && p.x <= x2 + 8 && Math.abs(p.y - y1) < 12) ||
          (p.x >= x1 - 8 && p.x <= x2 + 8 && Math.abs(p.y - y2) < 12) ||
          (p.y >= y1 - 8 && p.y <= y2 + 8 && Math.abs(p.x - x1) < 12) ||
          (p.y >= y1 - 8 && p.y <= y2 + 8 && Math.abs(p.x - x2) < 12);
        if (nearBorder) return i;
      } else if (d.type === "text") {
        // grobe Text-Bounding-Box
        ctx.font = "bold 22px system-ui, sans-serif";
        const tw = ctx.measureText(d.text || "Notiz").width;
        if (p.x >= d.x1 - 4 && p.x <= d.x1 + tw + 4 && p.y >= d.y1 - 24 && p.y <= d.y1 + 6) {
          return i;
        }
      }
    }
    return -1;
  }

  // ---------- Foto laden ----------
  photoInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Bitte wähle eine Bilddatei aus.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoData = reader.result;
      photo = new Image();
      photo.onload = () => {
        photoLoaded = true;
        emptyState.hidden = true;
        canvas.style.display = "block";
        $("photoStatus").textContent = file.name;
        measures = [];
        drawings = [];
        history = [];
        selectedId = null;
        nextId = 1;
        resizeCanvas();
        renderMeasureList();
        setReady(true);
        $("saveStatus").textContent = "Foto geladen. Du kannst jetzt Maße und Zeichnungen anlegen.";
      };
      photo.onerror = () => alert("Bild konnte nicht geladen werden.");
      photo.src = photoData;
    };
    reader.readAsDataURL(file);
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
    renderMeasureList();
    draw();
  });

  buttons.export.addEventListener("click", () => {
    if (!photoLoaded) return;
    const name = ($("projectName").value.trim() || "fotomass")
      .replace(/[^\w\-äöüÄÖÜß]+/g, "_");
    const a = document.createElement("a");
    a.download = name + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  });

  buttons.save.addEventListener("click", () => {
    if (!photoLoaded) return;
    try {
      const payload = {
        version: 2,
        projectName: $("projectName").value,
        photoData,
        measures,
        drawings,
        nextId,
        unit: unitSelect.value,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem("fotomass-project", JSON.stringify(payload));
      $("saveStatus").textContent = "Projekt gespeichert (" + new Date().toLocaleString("de-DE") + ").";
    } catch (err) {
      $("saveStatus").textContent =
        "Speichern fehlgeschlagen (zu wenig Speicherplatz?). Bitte Bild als PNG exportieren.";
    }
  });

  buttons.load.addEventListener("click", () => {
    loadProject(true);
  });

  function loadProject(showFeedback) {
    try {
      const raw = localStorage.getItem("fotomass-project");
      if (!raw) {
        if (showFeedback) $("saveStatus").textContent = "Kein gespeichertes Projekt gefunden.";
        return;
      }
      const data = JSON.parse(raw);
      if (!data.photoData) {
        if (showFeedback) $("saveStatus").textContent = "Gespeicherte Daten unvollständig.";
        return;
      }
      photoData = data.photoData;
      photo = new Image();
      photo.onload = () => {
        photoLoaded = true;
        emptyState.hidden = true;
        canvas.style.display = "block";
        $("photoStatus").textContent = "Gespeichertes Projekt";
        $("projectName").value = data.projectName || "";
        measures = data.measures || [];
        drawings = data.drawings || [];
        nextId = data.nextId || 1;
        selectedId = null;
        history = [];
        if (data.unit) unitSelect.value = data.unit;
        resizeCanvas();
        renderMeasureList();
        setReady(true);
        if (showFeedback) {
          const when = data.savedAt ? new Date(data.savedAt).toLocaleString("de-DE") : "";
          $("saveStatus").textContent = "Projekt geladen" + (when ? " (gespeichert: " + when + ")" : "") + ".";
        }
      };
      photo.onerror = () => {
        if (showFeedback) $("saveStatus").textContent = "Foto aus Speicher konnte nicht geladen werden.";
      };
      photo.src = photoData;
    } catch (err) {
      if (showFeedback) $("saveStatus").textContent = "Laden fehlgeschlagen.";
    }
  }

  // Stil umschalten
  $("styleToggle").addEventListener("click", () => {
    document.body.classList.toggle("site-bold");
    $("styleToggle").textContent = document.body.classList.contains("site-bold")
      ? "Technischer Stil"
      : "Baustellenstil";
  });

  // Farbe der ausgewählten Maßlinie ändern
  colorInput.addEventListener("change", () => {
    if (selectedId === null) return;
    const m = measures.find((x) => x.id === selectedId);
    if (m) {
      remember();
      m.color = colorInput.value;
      draw();
    }
  });

  // Einheit der ausgewählten Maßlinie ändern
  unitSelect.addEventListener("change", () => {
    if (selectedId === null) return;
    const m = measures.find((x) => x.id === selectedId);
    if (m) {
      remember();
      m.unit = unitSelect.value;
      draw();
      renderMeasureList();
    }
  });

  // Werkzeug-Buttons
  document.querySelectorAll(".tool").forEach((b) => {
    b.addEventListener("click", () => setTool(b.dataset.tool));
  });

  // ---------- Text-Dialog ----------
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
        id: nextId++,
        type: "text",
        x1: pendingTextPoint.x,
        y1: pendingTextPoint.y,
        text: txt,
        color: colorInput.value,
        width: Number(widthInput.value)
      });
      draw();
    }
    closeTextDialog();
  });
  textDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("textDialogOk").click();
    if (e.key === "Escape") closeTextDialog();
  });

  // ---------- Pointer-Events ----------
  canvas.addEventListener("pointerdown", (e) => {
    if (!photoLoaded) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    pointerStart = p;

    // --- Auswählen / Verschieben ---
    if (tool === "select") {
      const hit = hitMeasure(p);
      if (hit) {
        selectedId = hit.measure.id;
        remember();
        if (hit.endpoint === 1 || hit.endpoint === 2) {
          activeDrawing = {
            type: "move-endpoint",
            id: hit.measure.id,
            endpoint: hit.endpoint,
            startX: p.x,
            startY: p.y
          };
        } else {
          activeDrawing = {
            type: "move-measure",
            id: hit.measure.id,
            dx: p.x,
            dy: p.y,
            original: { x1: hit.measure.x1, y1: hit.measure.y1, x2: hit.measure.x2, y2: hit.measure.y2 }
          };
        }
      } else {
        selectedId = null;
      }
      renderMeasureList();
      draw();
      return;
    }

    // --- Radierer ---
    if (tool === "eraser") {
      const hit = hitMeasure(p);
      if (hit) {
        remember();
        measures = measures.filter((x) => x.id !== hit.measure.id);
        if (selectedId === hit.measure.id) selectedId = null;
      } else {
        const idx = hitDrawing(p);
        if (idx >= 0) {
          remember();
          drawings.splice(idx, 1);
        }
      }
      renderMeasureList();
      draw();
      return;
    }

    // --- Text ---
    if (tool === "text") {
      openTextDialog(p);
      return;
    }

    // --- Neue Form / Maßlinie beginnen ---
    remember();
    const common = {
      id: nextId++,
      type: tool,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      color: colorInput.value,
      width: Number(widthInput.value),
      points: tool === "freehand" ? [p] : undefined
    };

    if (tool === "measure") {
      common.value = "";
      common.unit = unitSelect.value;
    }

    activeDrawing = common;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerStart || !activeDrawing) return;
    const p = pointFromEvent(e);

    if (activeDrawing.type === "move-measure") {
      const m = measures.find((x) => x.id === activeDrawing.id);
      if (!m) return;
      const dx = p.x - activeDrawing.dx;
      const dy = p.y - activeDrawing.dy;
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
      if (activeDrawing.endpoint === 1) {
        m.x1 = p.x;
        m.y1 = p.y;
      } else {
        m.x2 = p.x;
        m.y2 = p.y;
      }
      draw();
      return;
    }

    // Zeichnung fortsetzen
    activeDrawing.x2 = p.x;
    activeDrawing.y2 = p.y;
    if (activeDrawing.type === "freehand") {
      activeDrawing.points.push(p);
    }
    draw();
  });

  function finishPointer() {
    if (!activeDrawing) {
      pointerStart = null;
      return;
    }

    if (activeDrawing.type === "move-measure" || activeDrawing.type === "move-endpoint") {
      // fertig verschoben
      activeDrawing = null;
      pointerStart = null;
      draw();
      renderMeasureList();
      return;
    }

    // Zu kurze Linien verwerfen
    if (
      (activeDrawing.type === "line" || activeDrawing.type === "measure") &&
      dist({ x: activeDrawing.x1, y: activeDrawing.y1 }, { x: activeDrawing.x2, y: activeDrawing.y2 }) < 8
    ) {
      activeDrawing = null;
      pointerStart = null;
      draw();
      return;
    }

    if (activeDrawing.type === "measure") {
      measures.push({
        id: activeDrawing.id,
        x1: activeDrawing.x1,
        y1: activeDrawing.y1,
        x2: activeDrawing.x2,
        y2: activeDrawing.y2,
        value: "",
        unit: activeDrawing.unit || unitSelect.value,
        color: activeDrawing.color
      });
      selectedId = activeDrawing.id;
    } else {
      drawings.push(activeDrawing);
    }

    activeDrawing = null;
    pointerStart = null;
    draw();
    renderMeasureList();
  }

  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);

  // Projektname ändert nichts am disabled-Status außer beim Speichern
  $("projectName").addEventListener("input", () => {
    if (photoLoaded) buttons.save.disabled = false;
  });

  // Beim Start: gespeichertes Projekt versuchen zu laden
  setReady(false);
  loadProject(false);
})();
