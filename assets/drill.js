/* drill.js – Drillplan mit Rundentimer (drill.html#themen-id) */
(function () {
  "use strict";
  const { esc, $, pc, idx } = Core;
  const LS_OPT = "box-roadmap-timer-v1";
  const opt = { sound: true, warn: true, vibrate: true, react: true, voice: true, pace: "plan" };
  // Abstand zwischen zwei Kommandos in Sekunden (von–bis, zufällig)
  const PACE = { ruhig: [8, 15], mittel: [5, 10], schnell: [3, 6] };
  const PACE_TXT = { plan: "Wie im Plan", ruhig: "Ruhig 8–15 s", mittel: "Mittel 5–10 s", schnell: "Schnell 3–6 s" };
  try { Object.assign(opt, JSON.parse(localStorage.getItem(LS_OPT) || "{}")); } catch (e) {}
  const saveOpt = () => { try { localStorage.setItem(LS_OPT, JSON.stringify(opt)); } catch (e) {} };

  let D, topic, drill, proto = null, segs = [];
  const T = { i: 0, running: false, started: false, endAt: 0, left: 0, manualStart: 0, manualAcc: 0, done: false, warned: false, lastBeep: null, nextCmd: 0, lastCmd: null };
  let cmdTimer = null;
  let tickTimer = null;

  const ICON = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 5v14M19 5l-9 7 9 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M18 5v14M5 5l9 7-9 7z"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>'
  };

  /* ---------- Ton, Vibration, Bildschirm an ---------- */
  let ctx = null;
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain || 0.5, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(start); o.stop(start + dur + 0.05);
  }
  function bell(n) { // Ringglocke
    if (!opt.sound || !audio()) return;
    const t0 = ctx.currentTime;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * 0.42;
      tone(880, t, 1.2, "sine", 0.55); tone(1760, t, 0.7, "sine", 0.22); tone(2637, t, 0.35, "triangle", 0.08);
    }
  }
  function beep(high) { if (opt.sound && audio()) tone(high ? 1320 : 990, ctx.currentTime, 0.13, "square", 0.12); }
  function clap() { // 10-Sekunden-Warnung wie das Klopfen am Ring
    if (!opt.sound || !audio()) return;
    const t = ctx.currentTime;
    [0, 0.14].forEach((d) => tone(2200, t + d, 0.05, "square", 0.25));
  }
  function chime() { // Signal für ein Kommando, wenn die Sprache aus ist
    if (!opt.sound || !audio()) return;
    const t = ctx.currentTime;
    tone(1568, t, 0.09, "triangle", 0.35); tone(2093, t + 0.09, 0.16, "triangle", 0.35);
  }

  /* ---------- Sprachansage ---------- */
  const synth = window.speechSynthesis || null;
  let deVoice = null;
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    deVoice = vs.find((v) => /^de(-|_)DE/i.test(v.lang) && v.localService) || vs.find((v) => /^de/i.test(v.lang)) || null;
  }
  if (synth) { pickVoice(); synth.addEventListener?.("voiceschanged", pickVoice); }
  const canSpeak = () => !!synth && opt.voice && opt.sound;
  function say(text, silent) {
    if (!synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE"; if (deVoice) u.voice = deVoice;
      u.rate = 1.1; u.volume = silent ? 0 : 1;
      synth.speak(u);
    } catch (e) {}
  }

  const vib = (p) => { if (opt.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };

  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => (wake = null)); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && T.running) keepAwake(true); });

  /* ---------- Ablauf aus dem Drillplan bauen ---------- */
  function build(d) {
    const out = [], ex = d.exercises;
    let g = 0;
    ex.forEach((e, i) => {
      const R = e.rounds || 1, timed = e.work > 0;
      for (let r = 1; r <= R; r++) {
        out.push({ type: timed ? "work" : "manual", dur: timed ? e.work : 0, ex: i, r, R, g: ++g, cmd: e.cmd && e.cmd.length ? e.cmd : null });
        const lastRound = r === R, lastEx = i === ex.length - 1;
        if (lastRound && lastEx) continue;
        if (!lastRound) { if (e.rest > 0) out.push({ type: "rest", dur: e.rest, ex: i, r, R }); }
        else {
          const nxt = ex[i + 1];
          const rest = e.rest > 0 ? e.rest : nxt.work > 0 && timed ? 15 : 0;
          if (rest) out.push({ type: "rest", dur: rest, ex: i, r, R, sw: true });
        }
      }
    });
    if (out[0] && out[0].type === "work") out.unshift({ type: "prep", dur: 10, ex: 0, r: 0, R: ex[0].rounds || 1 });
    return out;
  }

  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const cur = () => segs[T.i];
  const exOf = (s) => drill.exercises[s.ex];

  function setSeg(i) {
    T.i = Math.max(0, Math.min(segs.length - 1, i));
    const s = cur();
    T.left = s.dur * 1000; T.warned = false; T.lastBeep = null; T.done = false; T.nextCmd = 0; T.lastCmd = null;
    showCmd(null);
    T.manualAcc = 0; T.manualStart = performance.now();
    if (T.running && s.dur) T.endAt = performance.now() + T.left;
  }

  function finishSeg() {
    const s = cur();
    if (s.type === "work" || s.type === "manual") { bell(s.type === "work" ? 3 : 1); vib([300, 120, 300, 120, 300]); }
    else { bell(1); vib(500); }
    if (T.i >= segs.length - 1) {
      T.running = false; T.done = true; keepAwake(false);
      setTimeout(() => bell(3), 1400);
      render(); return;
    }
    setSeg(T.i + 1);
    render();
  }

  function tick() {
    if (!T.running) return;
    const s = cur(), now = performance.now();
    if (s.dur) {
      T.left = T.endAt - now;
      const sec = Math.ceil(T.left / 1000);
      if (s.type === "work" && opt.warn && !T.warned && s.dur > 20 && sec <= 10) { T.warned = true; clap(); }
      if ((s.type === "rest" || s.type === "prep") && sec <= 3 && sec >= 1 && T.lastBeep !== sec) { T.lastBeep = sec; beep(false); }
      if (T.left <= 0) { finishSeg(); return; }
      if (s.type === "work" && s.cmd && opt.react) {
        if (!T.nextCmd) schedCmd(now);
        else if (now >= T.nextCmd) {
          if (T.left > 4000) fireCmd(s);
          schedCmd(now);
        }
      }
    }
    renderClock();
  }

  /* ---------- Kommandos (Reaktions-Modus) ---------- */
  function paceOf(s) {
    const k = opt.pace === "plan" ? exOf(s).pace || "mittel" : opt.pace;
    return PACE[k] || PACE.mittel;
  }
  function schedCmd(now) {
    const [a, b] = paceOf(cur());
    T.nextCmd = now + (a + Math.random() * (b - a)) * 1000;
  }
  function fireCmd(s) {
    const c = s.cmd;
    let w = c[Math.floor(Math.random() * c.length)];
    for (let k = 0; c.length > 1 && w === T.lastCmd && k < 6; k++) w = c[Math.floor(Math.random() * c.length)];
    T.lastCmd = w;
    if (canSpeak()) say(w); else chime();
    vib(90);
    showCmd(w, true);
  }
  function showCmd(w, fresh) {
    const el = $("tcmd");
    if (!el) return;
    const s = cur();
    el.hidden = !(s && s.type === "work" && s.cmd && opt.react);
    if (el.hidden) return;
    el.textContent = w || "Kommandos: " + s.cmd.join(" · ");
    el.classList.toggle("idle", !w);
    if (fresh) {
      el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
      clearTimeout(cmdTimer); cmdTimer = setTimeout(() => el.classList.remove("on"), 1600);
    }
  }

  function start() {
    audio();
    if (T.done) { T.running = false; T.started = false; setSeg(0); }
    T.running = true; T.started = true; T.nextCmd = 0;
    if (canSpeak() && segs.some((x) => x.cmd)) say(" ", true); // iPhone gibt die Sprache nur nach einem Tipp frei
    const s = cur();
    if (s.dur) T.endAt = performance.now() + T.left;
    else T.manualStart = performance.now();
    if (s.type === "work" && T.left === s.dur * 1000) bell(1);
    keepAwake(true);
    clearInterval(tickTimer); tickTimer = setInterval(tick, 200);
    render();
  }
  function pause() {
    T.running = false;
    const s = cur();
    if (s.dur) T.left = Math.max(0, T.endAt - performance.now());
    else T.manualAcc += performance.now() - T.manualStart;
    keepAwake(false);
    render();
  }
  function mainAction() {
    const s = cur();
    if (T.done) { start(); return; }
    if (s.type === "manual" && T.running) { finishSeg(); return; }
    T.running ? pause() : start();
  }
  function go(delta) {
    const s = cur();
    // Zurück: wenn schon >3 s gelaufen, erst an den Anfang des Abschnitts
    if (delta < 0 && s.dur && s.dur * 1000 - T.left > 3000) { setSeg(T.i); render(); return; }
    if (T.i + delta < 0 || T.i + delta >= segs.length) return;
    setSeg(T.i + delta);
    render();
  }
  function jumpEx(n) {
    const i = segs.findIndex((s) => s.ex === n && s.type !== "rest" && s.type !== "prep");
    if (i < 0) return;
    const wasRunning = T.running;
    if (wasRunning) pause();
    setSeg(i > 0 && segs[i - 1].type === "prep" ? i - 1 : i);
    render();
    $("timer").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Darstellung ---------- */
  function nextText() {
    const n = segs[T.i + 1];
    if (!n) return "Danach: geschafft";
    if (n.type === "rest") return "Danach: " + Core.fmtDur(n.dur) + " Pause";
    const e = exOf(n);
    if (proto) return "Danach: Runde " + n.g + " von " + drill.rounds;
    if (n.ex !== cur().ex || cur().type === "prep") return "Danach: " + e.name + (n.R > 1 ? " · " + (n.type === "manual" ? "Satz" : "Runde") + " " + n.r + "/" + n.R : "");
    return "Danach: " + (n.type === "manual" ? "Satz " : "Runde ") + n.r + " von " + n.R;
  }
  function phaseText(s) {
    const e = exOf(s);
    if (T.done) return "Geschafft";
    if (s.type === "prep") return "Fertig machen";
    if (s.type === "rest") return s.sw ? "Pause · Übungswechsel" : "Pause";
    if (s.type === "manual") return s.R > 1 ? "Satz " + s.r + " von " + s.R : e.reps ? "Satz" : "Aufgabe";
    if (proto) return "Runde " + s.g + " von " + drill.rounds;
    return "Runde " + s.r + " von " + s.R;
  }
  function renderClock() {
    const s = cur(), el = $("tclock");
    if (!el) return;
    if (T.done) { el.innerHTML = "✓<small>Stark gemacht. Jetzt den Check unten nicht vergessen.</small>"; el.classList.remove("warn"); $("tbar").style.width = "100%"; return; }
    if (s.dur) {
      el.innerHTML = mmss(T.left) + (T.started ? "" : s.type === "prep" ? "<small>Tippe Start. Vorher kommen 10 s zum Fertigmachen.</small>" : "<small>Tippe Start.</small>");
      el.classList.toggle("warn", s.type === "work" && T.left <= 10000 && s.dur > 20);
      $("tbar").style.width = (100 * (1 - T.left / (s.dur * 1000))).toFixed(1) + "%";
    } else {
      const ms = T.manualAcc + (T.running ? performance.now() - T.manualStart : 0);
      const e = exOf(s);
      el.innerHTML = (e.reps ? esc(e.reps) : mmss(ms)) + `<small>${T.running ? (e.reps ? "läuft seit " + mmss(ms) + " · tippe Fertig, wenn der Satz durch ist" : "Tippe Erledigt, wenn du durch bist") : "Ohne Uhr: in deinem Tempo"}</small>`;
      el.classList.remove("warn");
      $("tbar").style.width = "0%";
    }
  }
  function render() {
    const s = cur(), e = exOf(s), tm = $("timer");
    tm.dataset.phase = T.done ? "done" : s.type;
    $("tphase").textContent = phaseText(s);
    $("tpos").textContent = proto ? proto.setup || "" : "Übung " + (s.ex + 1) + "/" + drill.exercises.length;
    $("tex").textContent = s.type === "rest" && s.sw ? "Gleich: " + drill.exercises[s.ex + 1].name : e.name;
    $("tnote").textContent = s.type === "rest" && s.sw ? drill.exercises[s.ex + 1].note : e.note;
    $("tnext").textContent = T.done ? "" : nextText();
    const main = $("tmain");
    main.textContent = T.done ? "Nochmal" : s.type === "manual" && T.running ? (e.reps ? "Satz fertig" : "Erledigt") : T.running ? "Pause" : T.started ? "Weiter" : "Start";
    $("tprev").disabled = T.i === 0 && (!s.dur || T.left === s.dur * 1000);
    $("tnextb").disabled = T.i >= segs.length - 1 || T.done;
    document.querySelectorAll(".ex").forEach((el) => {
      const n = +el.dataset.ex;
      el.classList.toggle("cur", !T.done && n === s.ex);
      el.classList.toggle("done", T.done || n < s.ex);
    });
    showCmd(T.running ? T.lastCmd : null);
    renderClock();
  }

  const exNote = (e) => esc(e.note) + (e.cmd && e.cmd.length ? `${e.note ? "<br>" : ""}<span class="cmds">Auf Kommando: ${e.cmd.map(esc).join(" · ")}</span>` : "");

  function page() {
    const p = idx.pillars[topic.pillar];
    const stage = proto ? null : D.stages[topic.stage - 1];
    const hasCmd = segs.some((s) => s.cmd);
    const timed = segs.reduce((a, s) => a + (s.dur || 0), 0);
    const hasManual = segs.some((s) => s.type === "manual");
    document.title = topic.title + (proto ? " · Protokoll" : " · Drillplan");
    document.documentElement.style.setProperty("--pc", pc(topic.pillar));
    const protoGroup = (D.protocols || []).length ? `<optgroup label="Protokolle">${D.protocols.map((x) => `<option value="${x.id}"${proto && x.id === proto.id ? " selected" : ""}>${esc(x.title)}</option>`).join("")}</optgroup>` : "";
    const groups = protoGroup + D.pillars.map((pp) => `<optgroup label="${esc(pp.name)}">${D.topics.filter((t) => t.pillar === pp.id && t.drill).map((t) => `<option value="${t.id}"${t.id === topic.id ? " selected" : ""}>${esc(t.title)}</option>`).join("")}</optgroup>`).join("");
    $("app").innerHTML = `
      <nav class="dnav">
        <a class="back" href="./${proto ? "" : "#" + topic.id}">${ICON.back}Roadmap</a>
        <div class="acts"><select class="sel" id="jump" aria-label="Anderen Drillplan öffnen">${groups}</select><button class="btn small" id="print">${ICON.print}Drucken</button></div>
      </nav>
      <header class="dhead">
        <div class="crumb">${esc(p.name)} <span>· ${proto ? "Protokoll" + (proto.setup ? " · " + esc(proto.setup) : "") : "Stufe " + stage.n + " " + esc(stage.name)}</span></div>
        <h1>${esc(topic.title)}</h1>
        <p class="goal">${esc(drill.goal)}</p>
        <div class="dmeta">${drill.status !== "geprueft" ? '<span class="draft">Entwurf · von Daniel prüfen</span>' : ""}<span>Wie oft: <strong>${esc(drill.freq)}</strong></span><span>Dauer: <strong>${esc(drill.dur)}</strong></span>${timed ? `<span>Timer: <strong>${Math.round(timed / 60)} min${hasManual ? " + Sätze" : ""}</strong></span>` : ""}</div>
      </header>
      <section class="timer" id="timer" aria-label="Rundentimer">
        <div class="t-top"><span class="t-phase" id="tphase"></span><span class="t-pos" id="tpos"></span></div>
        <div><div class="t-ex" id="tex"></div><p class="t-note" id="tnote"></p></div>
        <div class="t-cmd" id="tcmd" aria-live="assertive" hidden></div>
        <div class="t-clock" id="tclock" role="timer" aria-live="off"></div>
        <div class="t-bar"><i id="tbar"></i></div>
        <div class="t-next" id="tnext" aria-live="polite"></div>
        <div class="t-ctrl">
          <button id="tprev" aria-label="Zurück">${ICON.prev}</button>
          <button class="main" id="tmain">Start</button>
          <button id="tnextb" aria-label="Weiter zum nächsten Abschnitt">${ICON.next}</button>
        </div>
        <div class="t-opts">
          <button class="chip" data-opt="sound" aria-pressed="${opt.sound}">Ton</button>
          <button class="chip" data-opt="warn" aria-pressed="${opt.warn}">10-s-Warnung</button>
          <button class="chip" data-opt="vibrate" aria-pressed="${opt.vibrate}">Vibration</button>
          ${hasCmd ? `<button class="chip" data-opt="react" aria-pressed="${opt.react}">Kommandos</button><button class="chip" data-opt="voice" aria-pressed="${opt.voice}"${synth ? "" : " disabled"}>Sprache</button>` : ""}
        </div>
        ${hasCmd ? `<div class="t-pace" role="group" aria-label="Takt der Kommandos"><span>Takt</span>${Object.keys(PACE_TXT).map((k) => `<button class="chip" data-pace="${k}" aria-pressed="${opt.pace === k}">${PACE_TXT[k]}</button>`).join("")}</div>` : ""}
        <p class="t-tip">Glocke: 3× bei Rundenende, 1× wenn es wieder losgeht. Der Bildschirm bleibt an, solange der Timer läuft. Am iPhone den Lautlos-Schalter aus.${hasCmd ? " Runden mit Kommando: Die App sagt zufällig eine Aktion an, du setzt sie sofort um. Den Abstand stellst du über den Takt ein." : ""}</p>
      </section>
      <section class="exlist" aria-label="Übungen">
        ${drill.exercises.map((e, i) => `<button class="ex" data-ex="${i}"><span class="n">${esc(e.rn || i + 1)}</span><span><span class="h"><span>${esc(e.name)}</span><span class="f">${esc(Core.exLabel(e))}</span></span>${e.note || e.cmd ? `<p>${exNote(e)}</p>` : ""}</span><span class="boxes" aria-hidden="true">${Array.from({ length: Math.min(e.rounds || 1, 8) }, () => "<i></i>").join("")}</span></button>`).join("")}
      </section>
      <div class="dcheck"><strong>Fortschritt prüfen:</strong> ${esc(drill.check)}</div>
      <p class="dfoot">Tippe auf eine Übung, um dort einzusteigen. Tastatur: Leertaste Start/Pause, Pfeiltasten vor und zurück.</p>
      <div class="pfoot"><span>Box-Roadmap · ${proto ? "Protokoll" : "Drillplan"} ${esc(topic.title)}</span><span>Gedruckt am ${new Date().toLocaleDateString("de-DE")}</span></div>`;
  }

  function load() {
    const id = decodeURIComponent(location.hash.slice(1)) || new URLSearchParams(location.search).get("id");
    if (T.running) pause();
    if (synth) synth.cancel();
    proto = idx.protocols[id] || null;
    if (proto) { topic = proto; drill = Core.protoDrill(proto); }
    else {
      topic = idx.topics[id] && idx.topics[id].drill ? idx.topics[id] : D.topics.find((x) => x.drill);
      drill = topic.drill;
    }
    segs = build(drill);
    Object.assign(T, { running: false, started: false, done: false });
    setSeg(0);
    page();
    render();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "tmain") mainAction();
    else if (b.id === "tprev") go(-1);
    else if (b.id === "tnextb") go(1);
    else if (b.id === "print") window.print();
    else if (b.dataset.opt) {
      const k = b.dataset.opt;
      opt[k] = !opt[k]; saveOpt(); b.setAttribute("aria-pressed", opt[k]);
      if (k === "sound" && opt.sound) beep(true);
      if (k === "voice" && canSpeak()) say("Sprache an");
      if (k === "voice" && !opt.voice && synth) synth.cancel();
      if (k === "react") { T.nextCmd = 0; showCmd(null); }
    }
    else if (b.dataset.pace) {
      opt.pace = b.dataset.pace; saveOpt(); T.nextCmd = 0;
      document.querySelectorAll("[data-pace]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.pace === opt.pace));
    }
    else if (b.dataset.ex) jumpEx(+b.dataset.ex);
  });
  document.addEventListener("change", (e) => { if (e.target.id === "jump") location.hash = e.target.value; });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("select, input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); mainAction(); }
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });
  window.addEventListener("hashchange", load);

  (async function init() {
    try { D = await Core.loadData(); }
    catch (err) { $("app").innerHTML = `<div class="empty">Daten nicht gefunden: ${esc(err.message)}</div>`; return; }
    load();
    const q = new URLSearchParams(location.search);
    if (q.get("print")) {
      history.replaceState(null, "", location.pathname + location.hash);
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 300));
    }
  })();
})();
