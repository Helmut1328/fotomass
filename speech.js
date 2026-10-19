/* FotoMaß – Sprachmodul
 * - parseNumber(text): deutsche Zahlen aus Sprache/Text -> { value: "1200", unit: " cm" | null }
 * - parseCommand(text): "ok", "fertig", "abbrechen" …
 * - listen(handlers): startet die Spracherkennung
 * Reine Logik, ohne DOM -> auch in Node testbar.
 */
(function (root) {
  "use strict";
  const FM = (root.FM = root.FM || {});

  // ---------- Zahlwörter ----------
  const UNITS = {
    null: 0, ein: 1, eins: 1, eine: 1, einen: 1, zwei: 2, zwo: 2, drei: 3, vier: 4,
    fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12,
    dreizehn: 13, vierzehn: 14, fuenfzehn: 15, sechzehn: 16, siebzehn: 17,
    achtzehn: 18, neunzehn: 19,
    zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60,
    siebzig: 70, achtzig: 80, neunzig: 90
  };
  const SPECIAL = { hundert: "H", tausend: "T", und: "U" };
  // Längste Wörter zuerst, damit "dreizehn" nicht als "drei"+"zehn" gelesen wird
  const VOCAB = Object.keys(UNITS).concat(Object.keys(SPECIAL)).sort((a, b) => b.length - a.length);

  function norm(s) {
    return String(s || "").toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  }

  // Zerlegt auch zusammengesetzte Wörter: "zweitausendeinhundertvierunddreissig"
  function splitCompound(word) {
    const out = [];
    let rest = word;
    while (rest) {
      const hit = VOCAB.find((v) => rest.startsWith(v));
      if (!hit) return null;
      out.push(hit);
      rest = rest.slice(hit.length);
    }
    return out;
  }

  function evalItems(items) {
    let total = 0, current = 0, any = false;
    for (const it of items) {
      if (it === "und") continue;
      any = true;
      if (it === "hundert") current = (current || 1) * 100;
      else if (it === "tausend") { total += (current || 1) * 1000; current = 0; }
      else current += UNITS[it];
    }
    return any ? total + current : null;
  }

  // Wörter -> Liste aus Vokabel-Items (mehrere Wörter werden aneinandergehängt)
  function wordsToItems(text) {
    const words = norm(text).replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
    const items = [];
    for (const w of words) {
      const parts = splitCompound(w);
      if (parts) items.push(...parts);
    }
    return items;
  }

  function isSingleDigit(it) { return it in UNITS && UNITS[it] < 10 && it !== "ein" && it !== "eine" && it !== "einen"; }

  function wordsToNumberString(text) {
    const items = wordsToItems(text);
    if (!items.length) return "";
    // "eins zwei drei vier" -> 1234 (Ziffern einzeln gesprochen)
    if (items.length >= 2 && items.every(isSingleDigit)) return items.map((i) => UNITS[i]).join("");
    const v = evalItems(items);
    return v === null ? "" : String(v);
  }

  // ---------- Einheiten ----------
  function detectUnit(s) {
    if (/(milli\s?meter|\bmm\b)/.test(s)) return " mm";
    if (/(zenti\s?meter|centi\s?meter|\bcm\b)/.test(s)) return " cm";
    if (/(\bmeter|\bm\b)/.test(s)) return " m";
    return null;
  }
  function stripUnits(s) {
    return s.replace(/milli\s?meter\w*|zenti\s?meter\w*|centi\s?meter\w*|\bmeter\w*|\b(mm|cm|m)\b/g, " ");
  }

  // ---------- Hauptfunktion ----------
  function parseNumber(raw, opts) {
    const typed = !!(opts && opts.typed); // getippt: Punkt ist Dezimalzeichen, keine Tausendermarke
    if (!raw) return { value: "", unit: null };
    let s = String(raw).toLowerCase().trim();
    const unit = detectUnit(s);
    s = stripUnits(s);
    // "12 komma 5" / "12 punkt 5" -> "12,5"
    s = s.replace(/\s*\b(komma|punkt)\b\s*/g, ",");

    if (/\d/.test(s)) {
      // "1 234" -> "1234", dann Dezimalkomma -> Punkt
      s = s.replace(/(\d)\s+(?=\d)/g, "$1");
      // deutsche Tausenderpunkte: 1.234 oder 12.345.678
      if (!typed) s = s.replace(/\b[1-9]\d{0,2}(\.\d{3})+\b(?![,\d])/g, (m) => m.replace(/\./g, ""));
      s = s.replace(/,/g, ".");
      const m = s.match(/\d+(\.\d+)?/);
      return { value: m ? m[0] : "", unit };
    }

    // Wörter, evtl. mit Komma: "zwölf komma fünf"
    if (s.includes(",")) {
      const [left, right] = s.split(",", 2);
      const l = wordsToNumberString(left) || "0";
      const ritems = wordsToItems(right);
      let r = "";
      if (ritems.length && ritems.every(isSingleDigit)) r = ritems.map((i) => UNITS[i]).join("");
      else r = wordsToNumberString(right);
      return { value: r ? l + "." + r : l, unit };
    }
    return { value: wordsToNumberString(s), unit };
  }

  // ---------- Sprachbefehle ----------
  function parseCommand(raw) {
    const s = norm(raw).replace(/[^a-z\s]/g, " ").trim();
    if (!s) return null;
    if (/^(ok|okay|uebernehmen|uebernimm|fertig|weiter|speichern|bestaetigen|ja)$/.test(s)) return "confirm";
    if (/^(abbrechen|abbruch|stopp|stop|schliessen|nein)$/.test(s)) return "cancel";
    if (/^(loeschen|leeren|nochmal|noch einmal|von vorne)$/.test(s)) return "clear";
    return null;
  }

  // ---------- Spracherkennung ----------
  const Rec = root.SpeechRecognition || root.webkitSpeechRecognition;

  function status() {
    if (!Rec) return { ok: false, reason: "Sprache wird in diesem Browser nicht unterstützt. Bitte tippen oder die Diktier-Taste der Tastatur nutzen." };
    const secure = root.isSecureContext || ["localhost", "127.0.0.1"].includes(root.location && root.location.hostname);
    if (!secure) return { ok: false, reason: "Sprache braucht HTTPS (z. B. GitHub Pages)." };
    return { ok: true, standalone: !!(root.navigator && root.navigator.standalone) };
  }

  /* handlers: onStatus(text) onResult({value, unit, raw, final}) onCommand(cmd) onEnd()
   * Liefert { stop() } oder null, wenn nicht startbar. */
  function listen(h) {
    const st = status();
    if (!st.ok) { h.onStatus && h.onStatus(st.reason); h.onEnd && h.onEnd(); return null; }

    let rec;
    try { rec = new Rec(); } catch (_) {
      h.onStatus && h.onStatus("Sprache nicht startbar – bitte tippen.");
      h.onEnd && h.onEnd();
      return null;
    }
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    let ended = false, delivered = false, last = null, timer = null;
    const deliver = (res, final) => {
      if (final) delivered = true;
      h.onResult && h.onResult(Object.assign({ final }, res));
    };
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (!delivered && last && last.value) deliver(last, true); // iOS liefert manchmal kein isFinal
      h.onEnd && h.onEnd();
    };

    rec.onstart = () => h.onStatus && h.onStatus("Hört zu … Maß sagen, z. B. „zwölfhundert“ oder „120 Zentimeter“.");
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        let picked = null, firstRaw = "";
        for (let j = 0; j < r.length; j++) {
          const t = r[j].transcript || "";
          if (!firstRaw) firstRaw = t;
          const cmd = parseCommand(t);
          if (cmd && r.isFinal) { delivered = true; h.onCommand && h.onCommand(cmd); try { rec.stop(); } catch (_) {} return; }
          const p = parseNumber(t);
          if (p.value) { picked = Object.assign({ raw: t }, p); break; } // Alternativen sind nach Sicherheit sortiert
        }
        if (picked) {
          last = picked;
          deliver(picked, r.isFinal);
          if (r.isFinal) { try { rec.stop(); } catch (_) {} }
        } else if (h.onStatus) {
          h.onStatus("… „" + firstRaw + "“ (keine Zahl erkannt)");
        }
      }
    };
    rec.onerror = (ev) => {
      const e = (ev && ev.error) || "";
      const msg = {
        "not-allowed": "Mikrofon/Diktierfunktion nicht erlaubt – iPhone: Einstellungen › Datenschutz › Mikrofon und Spracherkennung, sowie Siri & Diktierfunktion aktivieren.",
        "service-not-allowed": "Spracherkennung nicht erlaubt – iPhone: Einstellungen › Allgemein › Tastatur › Diktierfunktion aktivieren.",
        "no-speech": "Nichts gehört – nochmal 🎤.",
        "audio-capture": "Kein Mikrofon gefunden.",
        "network": "Netzwerkfehler bei der Sprache – bitte tippen."
      }[e];
      if (e !== "aborted") h.onStatus && h.onStatus(msg || "Sprachfehler (" + e + ") – bitte tippen.");
    };
    rec.onend = end;

    timer = setTimeout(() => { try { rec.stop(); } catch (_) {} }, 10000);
    try { rec.start(); } catch (_) {
      h.onStatus && h.onStatus("Start fehlgeschlagen – kurz warten und nochmal 🎤.");
      clearTimeout(timer);
      ended = true;
      h.onEnd && h.onEnd();
      return null;
    }
    return {
      stop() {
        clearTimeout(timer);
        rec.onresult = null;
        ended = true;
        try { rec.abort(); } catch (_) {}
      }
    };
  }

  FM.speech = { parseNumber, parseCommand, listen, status };
  if (typeof module !== "undefined" && module.exports) module.exports = FM.speech;
})(typeof window !== "undefined" ? window : globalThis);
