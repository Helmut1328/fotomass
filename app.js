(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("editorCanvas"), ctx = canvas.getContext("2d");
  const photoInput = $("photoInput"), emptyState = $("emptyState");
  let photo = new Image(), photoLoaded = false, tool = "select", selectedId = null;
  let measures = [], drawings = [], history = [], nextId = 1, pointerStart = null, activeDrawing = null;
  let photoData = null, projectName = "";

  const buttons = {
    add: $("addMeasure"), undo: $("undo"), export: $("exportImage"),
    clear: $("clearAll"), save: $("saveProject")
  };
  function remember() {
    history.push(JSON.stringify({ measures, drawings, selectedId }));
    if (history.length > 30) history.shift();
    buttons.undo.disabled = history.length === 0;
  }
  function setReady(ready) {
    Object.values(buttons).forEach(b => b.disabled = !ready);
    buttons.undo.disabled = history.length === 0;
  }
  function resizeCanvas() {
    if (!photoLoaded) return;
    const maxWidth = 1600, scale = Math.min(1, maxWidth / photo.naturalWidth);
    canvas.width = Math.round(photo.naturalWidth * scale);
    canvas.height = Math.round(photo.naturalHeight * scale);
    draw();
  }
  function draw() {
    if (!photoLoaded) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    drawings.forEach(d => drawShape(d));
    measures.forEach(m => drawMeasure(m));
    if (activeDrawing) drawShape(activeDrawing);
  }
  function drawMeasure(m) {
    const chosen = m.id === selectedId;
    ctx.save(); ctx.strokeStyle = m.color || "#ff3b30"; ctx.fillStyle = m.color || "#ff3b30";
    ctx.lineWidth = chosen ? 4 : 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke();
    const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), head = 10;
    [ [m.x1,m.y1,angle], [m.x2,m.y2,angle + Math.PI] ].forEach(([x,y,a]) => {
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x + head*Math.cos(a-.45), y + head*Math.sin(a-.45)); ctx.lineTo(x + head*Math.cos(a+.45), y + head*Math.sin(a+.45)); ctx.closePath(); ctx.fill();
    });
    const mx=(m.x1+m.x2)/2, my=(m.y1+m.y2)/2;
    const label = `${m.value || "?"}${m.unit || " mm"}`;
    ctx.font = "bold 17px system-ui"; const tw=ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillRect(mx-tw/2-5,my-25,tw+10,23);
    ctx.fillStyle = m.color || "#ff3b30"; ctx.textAlign="center"; ctx.fillText(label,mx,my-8);
    if (chosen) { ctx.setLineDash([5,4]); ctx.strokeStyle="#1682d5"; ctx.strokeRect(Math.min(m.x1,m.x2)-8,Math.min(m.y1,m.y2)-8,Math.abs(m.x2-m.x1)+16,Math.abs(m.y2-m.y1)+16); }
    ctx.restore();
  }
  function drawShape(d) {
    ctx.save(); ctx.strokeStyle=d.color || $("colorInput").value; ctx.fillStyle=d.color || $("colorInput").value; ctx.lineWidth=d.width || 4; ctx.lineCap="round"; ctx.lineJoin="round";
    if (d.type === "freehand") { if (!d.points || d.points.length < 2) { ctx.restore(); return; } ctx.beginPath(); ctx.moveTo(d.points[0].x,d.points[0].y); d.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); }
    else if (d.type === "line") { ctx.beginPath(); ctx.moveTo(d.x1,d.y1); ctx.lineTo(d.x2,d.y2); ctx.stroke(); }
    else if (d.type === "rect") { ctx.strokeRect(d.x1,d.y1,d.x2-d.x1,d.y2-d.y1); }
    else if (d.type === "text") { ctx.font="bold 22px system-ui"; ctx.fillText(d.text || "Notiz",d.x1,d.y1); }
    ctx.restore();
  }
  function renderMeasureList() {
    const list=$("measureList"); list.replaceChildren();
    if (!measures.length) { const p=document.createElement("p"); p.className="empty-list"; p.textContent="Noch keine Maßlinien angelegt."; list.append(p); return; }
    measures.forEach((m,index)=>{
      const row=document.createElement("div"); row.className="measure-item"+(m.id===selectedId?" selected":"");
      const title=document.createElement("button"); title.type="button"; title.className="secondary"; title.textContent=`Maß ${index+1}`; title.addEventListener("click",()=>{selectedId=m.id; setTool("select"); renderMeasureList(); draw();});
      const input=document.createElement("input"); input.type="number"; input.inputMode="decimal"; input.placeholder="Wert"; input.setAttribute("aria-label",`Wert für Maß ${index+1}`); input.value=m.value;
      input.addEventListener("change",()=>{remember(); m.value=input.value; draw();});
      const del=document.createElement("button"); del.type="button"; del.className="danger delete-measure"; del.textContent="✕"; del.setAttribute("aria-label",`Maß ${index+1} löschen`);
      del.addEventListener("click",()=>{remember(); measures=measures.filter(x=>x.id!==m.id); if(selectedId===m.id) selectedId=null; renderMeasureList(); draw();});
      row.append(title,input,del); list.append(row);
    });
  }
  function setTool(name) {
    tool=name;
    document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));
    canvas.style.cursor = tool==="select" ? "default" : "crosshair";
  }
  function pointFromEvent(e) {
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height};
  }
  function distanceToSegment(p,m) {
    const dx=m.x2-m.x1,dy=m.y2-m.y1, len=dx*dx+dy*dy;
    const t=len ? Math.max(0,Math.min(1,((p.x-m.x1)*dx+(p.y-m.y1)*dy)/len)) : 0;
    return Math.hypot(p.x-(m.x1+t*dx),p.y-(m.y1+t*dy));
  }
  function hitMeasure(p) { return [...measures].reverse().find(m=>distanceToSegment(p,m)<18); }

  photoInput.addEventListener("change", e=>{
    const file=e.target.files && e.target.files[0]; if(!file) return;
    if(!file.type.startsWith("image/")) { alert("Bitte wähle eine Bilddatei aus."); return; }
    const reader=new FileReader();
    reader.onload=()=>{ photoData=reader.result; photo=new Image(); photo.onload=()=>{
      photoLoaded=true; emptyState.hidden=true; canvas.style.display="block"; $("photoStatus").textContent=file.name;
      measures=[]; drawings=[]; history=[]; selectedId=null; resizeCanvas(); renderMeasureList(); setReady(true);
    }; photo.src=photoData; };
    reader.readAsDataURL(file);
  });

  buttons.add.addEventListener("click",()=>{
    if(!photoLoaded) return; remember();
    const w=canvas.width,h=canvas.height;
    const m={id:nextId++,x1:w*.2,y1:h*.5,x2:w*.8,y2:h*.5,value:"",unit:" mm",color:$("colorInput").value};
    measures.push(m); selectedId=m.id; renderMeasureList(); draw();
  });
  buttons.undo.addEventListener("click",()=>{
    const last=history.pop(); if(!last) return;
    const state=JSON.parse(last); measures=state.measures; drawings=state.drawings; selectedId=state.selectedId;
    renderMeasureList(); draw(); buttons.undo.disabled=history.length===0;
  });
  buttons.clear.addEventListener("click",()=>{
    if(!confirm("Alle Maßlinien und Zeichnungen löschen?")) return;
    remember(); measures=[]; drawings=[]; selectedId=null; renderMeasureList(); draw();
  });
  buttons.export.addEventListener("click",()=>{
    if(!photoLoaded) return;
    const a=document.createElement("a"); a.download=(($("projectName").value.trim()||"fotomass").replace(/[^\w\-äöüÄÖÜß]+/g,"_"))+".png";
    a.href=canvas.toDataURL("image/png"); a.click();
  });
  buttons.save.addEventListener("click",()=>{
    try {
      const payload={version:1,projectName:$("projectName").value,photoData,measures,drawings,nextId};
      localStorage.setItem("fotomass-project",JSON.stringify(payload));
      $("saveStatus").textContent="Projekt wurde auf diesem Gerät im Browser gespeichert.";
    } catch(err) { $("saveStatus").textContent="Speichern nicht möglich (möglicherweise zu wenig Gerätespeicher). Exportiere das Bild als PNG."; }
  });
  $("styleToggle").addEventListener("click",()=>{
    document.body.classList.toggle("site-bold");
    $("styleToggle").textContent=document.body.classList.contains("site-bold")?"Technischer Stil":"Baustellenstil";
  });
  $("colorInput").addEventListener("change",()=>{
    if(selectedId!==null) { const m=measures.find(x=>x.id===selectedId); if(m) {remember();m.color=$("colorInput").value;draw();} }
  });
  document.querySelectorAll(".tool").forEach(b=>b.addEventListener("click",()=>setTool(b.dataset.tool)));

  canvas.addEventListener("pointerdown",e=>{
    if(!photoLoaded) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const p=pointFromEvent(e); pointerStart=p;
    if(tool==="select") {
      const m=hitMeasure(p);
      if(m) { selectedId=m.id; remember(); activeDrawing={type:"move-measure",id:m.id,dx:p.x,dy:p.y,original:{...m}}; }
      else selectedId=null;
      renderMeasureList(); draw(); return;
    }
    if(tool==="eraser") {
      const m=hitMeasure(p);
      if(m) {remember(); measures=measures.filter(x=>x.id!==m.id); if(selectedId===m.id)selectedId=null;}
      else {
        const idx=drawings.findLastIndex ? drawings.findLastIndex(d=>Math.hypot((d.x1||0)-p.x,(d.y1||0)-p.y)<35) : -1;
        if(idx>=0){remember();drawings.splice(idx,1);}
      }
      renderMeasureList(); draw(); return;
    }
    if(tool==="text") {
      const txt=prompt("Welche Beschriftung soll hier stehen?","Schrank ergänzen");
      if(txt) {remember();drawings.push({id:nextId++,type:"text",x1:p.x,y1:p.y,text:txt,color:$("colorInput").value,width:Number($("widthInput").value)});draw();}
      return;
    }
    remember();
    activeDrawing={id:nextId++,type:tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:$("colorInput").value,width:Number($("widthInput").value),points:[p]};
  });
  canvas.addEventListener("pointermove",e=>{
    if(!pointerStart || !activeDrawing) return;
    const p=pointFromEvent(e);
    if(activeDrawing.type==="move-measure") {
      const m=measures.find(x=>x.id===activeDrawing.id); if(!m)return;
      const dx=p.x-activeDrawing.dx,dy=p.y-activeDrawing.dy;
      m.x1=activeDrawing.original.x1+dx;m.y1=activeDrawing.original.y1+dy;m.x2=activeDrawing.original.x2+dx;m.y2=activeDrawing.original.y2+dy;
      activeDrawing.dx=p.x;activeDrawing.dy=p.y;activeDrawing.original={...m}; draw(); return;
    }
    activeDrawing.x2=p.x; activeDrawing.y2=p.y;
    if(activeDrawing.type==="freehand") activeDrawing.points.push(p);
    draw();
  });
  function finishPointer() {
    if(activeDrawing && activeDrawing.type!=="move-measure") drawings.push(activeDrawing);
    activeDrawing=null;pointerStart=null;draw();renderMeasureList();
  }
  canvas.addEventListener("pointerup",finishPointer);
  canvas.addEventListener("pointercancel",finishPointer);
  $("projectName").addEventListener("input",()=>{buttons.save.disabled=!photoLoaded;});
  setReady(false);
})();