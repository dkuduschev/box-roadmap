/* app.js – Roadmap, Problem-Finder, Content-Plan */
(function () {
  "use strict";
  const { esc, $, pc, idx } = Core;
  const STATUS = Core.STATUS;
  const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const LS_UI = "box-roadmap-ui-v1";
  let D = null, symById = {};

  const ui = (() => { try { return JSON.parse(localStorage.getItem(LS_UI) || "{}") || {}; } catch (e) { return {}; } })();
  const saveUi = () => { try { localStorage.setItem(LS_UI, JSON.stringify({ view: state.view, cf: state.cf })); } catch (e) {} };
  const state = {
    sym: new Set(), q: "", view: ui.view === "content" ? "content" : "map", current: null, allSym: false,
    cf: { pillar: "alle", format: "alle", status: "alle", sort: "saeule", ...(ui.cf || {}) },
    openVid: null
  };

  const playIcon = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 0l9 5-9 5z"/></svg>';
  const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const linkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
  const timerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>';

  function lvlBar(v) {
    return `<span class="lvl${v ? "" : " none"}" aria-label="${v ? "Stand " + v + " von 5" : "Noch nicht eingeschätzt"}">${[1, 2, 3, 4, 5].map((i) => `<i class="${v && i <= v ? "on" : ""}"></i>`).join("")}</span>`;
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => (d ? d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(2, 4) : "");

  /* ---------- Kopf ---------- */
  function renderStats() {
    const vids = idx.videos.map((v) => Core.video(v.id));
    const online = vids.filter((v) => v.status === "online").length;
    const rated = D.topics.filter((t) => Core.rating(t.id)).length;
    $("stats").innerHTML = [[D.topics.length, "Themen"], [D.topics.filter((t) => t.drill).length, "Drillpläne"], [vids.length, "Video-Ideen"], [online, "online"], [rated + "/" + D.topics.length, "eingeschätzt"]]
      .map(([b, s]) => `<div class="stat"><b>${b}</b><small>${s}</small></div>`).join("");
  }
  function renderSync() {
    const b = $("syncbtn"), s = Core.sync;
    b.dataset.state = s.state;
    let txt = s.msg;
    if (s.state === "ok" && s.at) txt = "In GitHub gespeichert · " + s.at.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (s.state === "error") txt = "Speichern fehlgeschlagen";
    b.querySelector("span").textContent = txt;
    b.title = s.state === "error" ? s.msg : "Speichern einrichten";
  }

  /* ---------- Problem-Finder ---------- */
  function searchHits() {
    const q = state.q.trim().toLowerCase();
    if (!q) return null;
    return new Set(D.topics.filter((t) => [t.title, t.desc, ...t.keys, ...t.signs, idx.pillars[t.pillar].name].join(" ").toLowerCase().includes(q)).map((t) => t.id));
  }
  function symHits() {
    if (!state.sym.size) return null;
    const s = new Set();
    state.sym.forEach((id) => symById[id].topics.forEach((t) => s.add(t)));
    return s;
  }
  const hits = () => searchHits() || symHits();

  // Rangliste: Symptome (erstes Thema zählt am meisten) + schwache Selbsteinschätzung
  function ranking() {
    const sc = {};
    if (state.sym.size) {
      state.sym.forEach((id) => symById[id].topics.forEach((t, i) => (sc[t] = (sc[t] || 0) + ([3, 2, 1][i] || 1))));
      Object.keys(sc).forEach((t) => { const r = Core.rating(t); if (r) sc[t] += (5 - r) * 0.6; });
    } else {
      D.topics.forEach((t) => { const r = Core.rating(t.id); if (r && r <= 3) sc[t.id] = 5 - r; });
    }
    return Object.entries(sc)
      .map(([id, s]) => ({ t: idx.topics[id], s }))
      .sort((a, b) => b.s - a.s || (Core.rating(a.t.id) || 6) - (Core.rating(b.t.id) || 6) || a.t.stage - b.t.stage);
  }

  function combos(n, k, start = 0) {
    if (k === 0) return [[]];
    const out = [];
    for (let i = start; i < n; i++) combos(n, k - 1, i + 1).forEach((c) => out.push([i, ...c]));
    return out;
  }
  function weekPlan() {
    const top = ranking().filter((x) => x.t.drill).slice(0, 3);
    const base = [3, 2, 1];
    const items = top.map((x, i) => {
      const n = x.t.drill.perWeek;
      if (n == null) return { t: x.t, c: 0, text: x.t.drill.freq };
      if (n >= 5) return { t: x.t, c: 0, text: "täglich" };
      const c = Math.min(base[i], n);
      return { t: x.t, c, text: c + "×" };
    });
    const load = [0, 0, 0, 0, 0, 0, 0], days = DAYS.map(() => []);
    items.forEach((it) => {
      if (!it.c) return;
      let best = null;
      combos(6, it.c).forEach((pos) => {
        let cost = pos.reduce((a, p) => a + load[p] * 10, 0);
        for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] < 2) cost += 3;
        if (!best || cost < best.cost) best = { pos, cost };
      });
      best.pos.forEach((p) => { load[p]++; days[p].push(it.t); });
    });
    return { items, days };
  }

  function renderWeakest() {
    const el = $("weakest");
    const rated = D.topics.filter((t) => Core.rating(t.id)).sort((a, b) => Core.rating(a.id) - Core.rating(b.id) || a.stage - b.stage);
    if (!rated.length) {
      el.innerHTML = `<div class="fsec-h"><b>Deine schwächsten Themen</b></div><span class="hint">Öffne ein Thema und schätz dich ein (1–5). Dann siehst du hier, wo du am meisten rausholst.</span>`;
      return;
    }
    const weak = rated.filter((t) => Core.rating(t.id) <= 3).slice(0, 5);
    el.innerHTML = `<div class="fsec-h"><b>Deine schwächsten Themen</b><span class="hint">${rated.length} von ${D.topics.length} eingeschätzt</span></div>` +
      (weak.length
        ? `<div class="weak">${weak.map((t) => `<button class="weak-btn" style="--pc:${pc(t.pillar)}" data-node="${t.id}"><i></i>${esc(t.title)} ${lvlBar(Core.rating(t.id))}</button>`).join("")}</div>`
        : `<span class="hint">Alles, was du eingeschätzt hast, steht auf 4 oder 5. Stark. Schätz die restlichen Themen ein.</span>`);
  }

  function renderSymptoms() {
    const LIMIT = 10;
    const list = D.symptoms.filter((s, i) => state.allSym || i < LIMIT || state.sym.has(s.id));
    $("symptoms").innerHTML = list.map((s) => `<button class="chip" data-sym="${s.id}" aria-pressed="${state.sym.has(s.id)}">${esc(s.text)}</button>`).join("") +
      (D.symptoms.length > LIMIT ? `<button class="linkish" id="moresym">${state.allSym ? "Weniger zeigen" : "Alle " + D.symptoms.length + " Probleme zeigen"}</button>` : "");
  }

  function renderReco() {
    const r = $("reco");
    const sh = searchHits();
    const plan = weekPlan();
    const hasSearch = !!sh, hasSym = state.sym.size > 0;
    if (!hasSearch && !hasSym && !plan.items.length) { r.hidden = true; r.innerHTML = ""; return; }
    r.hidden = false;
    let html = "";
    if (hasSearch || hasSym) {
      const list = hasSearch ? [...sh].map((id) => idx.topics[id]) : ranking().map((x) => x.t);
      html += `<div class="reco-list"><span class="reco-label">${list.length ? (hasSearch ? "Treffer:" : "Hier ansetzen:") : "Nichts gefunden."}</span>` +
        list.map((t) => `<button class="reco-btn" style="--pc:${pc(t.pillar)}" data-node="${t.id}"><i></i>${esc(t.title)} <em>→ Thema</em></button>`).join("") +
        `<button class="linkish" id="clear">Auswahl zurücksetzen</button></div>`;
    }
    if (plan.items.length) {
      const why = hasSym ? `aus ${state.sym.size} ${state.sym.size === 1 ? "Problem" : "Problemen"}${D.topics.some((t) => Core.rating(t.id)) ? " und deiner Einschätzung" : ""}` : "aus deinen schwächsten Themen";
      html += `<div class="week">
        <div class="week-h"><h3>Diese Woche</h3><span class="hint">Vorschlag ${why}. Zusätzlich zum normalen Training.</span></div>
        <div class="week-items">${plan.items.map((it) => `<a class="wi" style="--pc:${pc(it.t.pillar)}" href="drill.html#${it.t.id}"><b>${esc(it.text)}</b><span><strong>${esc(it.t.title)}</strong><small>${esc(it.t.drill.dur)} · Drillplan öffnen</small></span></a>`).join("")}</div>
        <div class="days" aria-label="Wochenverteilung">${plan.days.map((ts, i) => `<div class="day"><small>${DAYS[i]}</small>${ts.map((t) => `<i style="--pc:${pc(t.pillar)}" title="${esc(t.title)}"></i><em>${esc(t.title)}</em>`).join("")}${i === 6 && !ts.length ? '<em style="color:var(--muted)">Ruhe</em>' : ""}</div>`).join("")}</div>
      </div>`;
    }
    r.innerHTML = html;
  }

  /* ---------- Ringkarte ---------- */
  function nodeBtn(t, h) {
    const cls = ["node"];
    if (h && h.has(t.id)) cls.push("hit");
    if (state.current === t.id) cls.push("active");
    return `<button class="${cls.join(" ")}" style="--pc:${pc(t.pillar)}" data-node="${t.id}">
      <span class="dot" aria-hidden="true"></span><span class="nt">${esc(t.title)}</span>
      <span class="nm">${lvlBar(Core.rating(t.id))}<span class="vcount" aria-label="${t.videos.length} Video-Ideen">${playIcon}${t.videos.length}</span></span></button>`;
  }
  function renderMap() {
    const h = hits(), m = $("map");
    m.classList.toggle("filtering", !!h);
    let html = '<div class="corner"></div>';
    D.pillars.forEach((p, pi) => {
      const rs = D.topics.filter((t) => t.pillar === p.id).map((t) => Core.rating(t.id)).filter(Boolean);
      const avg = rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1).replace(".", ",") : null;
      html += `<div class="colhead" style="--pc:${pc(p.id)};--o:${pi * 10}"><h3>${esc(p.name)}</h3><small>${esc(p.sub)}</small>${avg ? `<span class="avg">Ø ${avg} von 5</span>` : ""}</div>`;
    });
    D.stages.forEach((s) => {
      html += `<div class="rowhead"><span class="num">${s.n}</span><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></div>`;
      D.pillars.forEach((p, pi) => {
        const ts = D.topics.filter((t) => t.pillar === p.id && t.stage === s.n);
        html += `<div class="cell" style="--o:${pi * 10 + s.n}"><span class="cell-stage">Stufe ${s.n} · ${esc(s.name)}</span>${ts.map((t) => nodeBtn(t, h)).join("")}</div>`;
      });
    });
    m.innerHTML = html;
  }

  /* ---------- Content-Plan ---------- */
  function statusBtn(vid) {
    const s = Core.statusOf(vid), lab = STATUS.find((x) => x[0] === s)[1];
    return `<button class="status" style="--sc:var(--s-${s})" data-vid="${vid}" title="Antippen: Status weiterschalten"><i></i>${lab}</button>`;
  }
  function filtered() {
    const cf = state.cf;
    return idx.videos.map((v) => Core.video(v.id)).filter((v) =>
      (cf.pillar === "alle" || v.topic.pillar === cf.pillar) &&
      (cf.format === "alle" || v.format === cf.format) &&
      (cf.status === "alle" || v.status === cf.status));
  }
  function vsum(v) {
    const late = v.date && v.date < today() && v.status !== "online";
    return `<div class="vmain"><span class="vt">${esc(v.title)}</span><span class="vhook">${esc(v.hook)}</span></div>
      <button class="vn" data-node="${v.topic.id}">${esc(v.topic.title)}</button>
      <span class="fmt" title="${esc(D.formats[v.format] || "")}">${esc(v.format)}</span>
      <span class="vdate${late ? " late" : ""}" title="${late ? "Überfällig" : "Geplantes Datum"}">${v.date ? fmtDate(v.date) : "–"}${v.link ? `<a href="${esc(v.link)}" target="_blank" rel="noopener" aria-label="Video ansehen">${linkIcon}</a>` : ""}</span>
      ${statusBtn(v.id)}
      <button class="vtoggle" data-edit="${v.id}" aria-expanded="${state.openVid === v.id}" aria-label="Details bearbeiten">${chevron}</button>`;
  }
  function veditor(v) {
    const opt = (list, cur) => list.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
    return `<div class="vedit" data-vid="${v.id}">
      <label class="field wide">Hook – der erste Satz<textarea data-f="hook" rows="2" placeholder="Was sagst du in den ersten 3 Sekunden?">${esc(v.hook)}</textarea></label>
      <label class="field">Format<select data-f="format">${opt(Object.keys(D.formats).map((k) => [k, k]), v.format)}</select></label>
      <label class="field">Status<select data-f="status">${opt(STATUS, v.status)}</select></label>
      <label class="field half">Geplant für<input type="date" data-f="date" value="${esc(v.date)}"></label>
      <label class="field wide">Link zum fertigen Video<input type="url" data-f="link" value="${esc(v.link)}" placeholder="https://youtube.com/…" inputmode="url"></label>
      <label class="field wide">Notizen<textarea data-f="notes" rows="3" placeholder="Drehort, Shotlist, Musik, Ideen …">${esc(v.notes)}</textarea></label>
      <span class="saved">Wird automatisch gespeichert.</span>
    </div>`;
  }
  const vrow = (v) => `<div class="vrow${state.openVid === v.id ? " open" : ""}" data-row="${v.id}" style="--pc:${pc(v.topic.pillar)}"><div class="vsum">${vsum(v)}</div>${state.openVid === v.id ? veditor(v) : ""}</div>`;

  function renderContent() {
    const cf = state.cf, all = idx.videos.map((v) => Core.video(v.id)), list = filtered();
    const counts = Object.fromEntries(STATUS.map(([k]) => [k, all.filter((v) => v.status === k).length]));
    const sel = (name, opts) => `<select class="sel" data-cf="${name}" aria-label="${name}">${opts.map(([k, l]) => `<option value="${k}"${cf[name] === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    let html = `<div class="cbar">
      <label class="field">Säule${sel("pillar", [["alle", "Alle Säulen"], ...D.pillars.map((p) => [p.id, p.name])])}</label>
      <label class="field">Format${sel("format", [["alle", "Alle Formate"], ...Object.keys(D.formats).map((k) => [k, k])])}</label>
      <label class="field">Status${sel("status", [["alle", "Alle · " + all.length], ...STATUS.map(([k, l]) => [k, l + " · " + counts[k]])])}</label>
      <label class="field">Sortierung${sel("sort", [["saeule", "Nach Säule"], ["datum", "Nach Datum"]])}</label>
      <span class="grow"></span>
      <span class="count">${list.length} von ${all.length}</span>
      <button class="btn" id="csv"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/></svg>CSV</button>
    </div>`;
    if (cf.sort === "datum") {
      const sorted = [...list].sort((a, b) => (a.date || "9999") < (b.date || "9999") ? -1 : (a.date || "9999") > (b.date || "9999") ? 1 : 0);
      html += `<section class="cgroup" style="--pc:var(--ink)"><h3>Nach Datum<small>${sorted.length} Videos · ohne Datum am Ende</small></h3>` +
        (sorted.length ? sorted.map(vrow).join("") : `<div class="empty">Keine Videos für diese Filter.</div>`) + `</section>`;
    } else {
      D.pillars.forEach((p) => {
        const l = list.filter((v) => v.topic.pillar === p.id);
        if (!l.length) return;
        html += `<section class="cgroup" style="--pc:${pc(p.id)}"><h3>${esc(p.name)}<small>${l.length} ${l.length === 1 ? "Video" : "Videos"}</small></h3>` + l.map(vrow).join("") + `</section>`;
      });
      if (!list.length) html += `<section class="cgroup"><div class="empty">Keine Videos für diese Filter.</div></section>`;
    }
    html += `<p class="hint">Status antippen schaltet weiter: Idee → Geplant → Gedreht → Online. Pfeil rechts öffnet Hook, Datum, Link und Notizen. Neue Video-Ideen trägst du in <code>data/roadmap.json</code> ein.</p>`;
    $("content").innerHTML = html;
  }
  function refreshRow(vid) {
    const row = document.querySelector(`[data-row="${vid}"] .vsum`);
    if (row) row.innerHTML = vsum(Core.video(vid));
  }

  function csv() {
    const cols = ["ID", "Säule", "Stufe", "Thema", "Titel", "Hook", "Format", "Status", "Datum", "Link", "Notizen"];
    const q = (x) => { const s = String(x ?? ""); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = filtered().map((v) => [v.id, idx.pillars[v.topic.pillar].name, v.topic.stage, v.topic.title, v.title, v.hook, v.format, STATUS.find((s) => s[0] === v.status)[1], v.date, v.link, v.notes]);
    const text = "﻿" + [cols, ...rows].map((r) => r.map(q).join(";")).join("\r\n");
    Core.download("content-plan-" + today() + ".csv", text, "text/csv;charset=utf-8");
  }

  /* ---------- Panel ---------- */
  function rateBlock(t) {
    const v = Core.rating(t.id);
    return `<div class="rate" style="--pc:${pc(t.pillar)}">
      <div class="rate-h"><b>Wo stehst du gerade?</b>${v ? `<button class="linkish" data-rate-clear="${t.id}">zurücksetzen</button>` : ""}</div>
      <div class="rate-steps" role="radiogroup" aria-label="Selbsteinschätzung">${[1, 2, 3, 4, 5].map((i) => `<button role="radio" aria-checked="${v === i}" class="${v && i <= v ? "on" : ""}" data-rate="${t.id}" data-v="${i}" title="${esc(D.levels[i - 1])}">${i}<i></i></button>`).join("")}</div>
      <div class="rate-label${v ? "" : " none"}">${v ? v + " · " + esc(D.levels[v - 1]) : "Noch nicht eingeschätzt. 1 = neu für dich, 5 = klappt im Kampf."}</div>
    </div>`;
  }
  function openNode(id, push = true) {
    const t = idx.topics[id];
    if (!t) return;
    state.current = id;
    const p = idx.pillars[t.pillar], s = D.stages[t.stage - 1], d = t.drill;
    $("panel").style.setProperty("--pc", pc(t.pillar));
    $("pcrumb").innerHTML = `${esc(p.name)} <span>· Stufe ${s.n} ${esc(s.name)}</span>`;
    $("ptitle").textContent = t.title;
    let b = `<p>${esc(t.desc)}</p>${rateBlock(t)}
      <div class="sec"><h4>Worauf es ankommt</h4><ul class="ticks">${t.keys.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      ${t.variants && t.variants.length ? `<div class="sec"><h4>Varianten</h4><ul class="ticks vars">${t.variants.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="sec"><h4>Daran merkst du, dass es fehlt</h4><ul class="ticks signs">${t.signs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="sec"><h4>Drillplan</h4>`;
    if (d) {
      b += `<div class="drill"><div class="drill-head">${d.status !== "geprueft" ? '<span class="draft">Entwurf · von Daniel prüfen</span>' : ""}<b>${esc(d.goal)}</b>
        <div class="drill-meta"><span>Wie oft: <strong>${esc(d.freq)}</strong></span><span>Dauer: <strong>${esc(d.dur)}</strong></span></div></div>
        ${d.exercises.map((e, i) => `<div class="round"><span class="rn">${i + 1}</span><div><div class="rt"><span>${esc(e.name)}</span><span class="rf">${esc(Core.exLabel(e))}</span></div><p>${esc(e.note)}</p></div></div>`).join("")}
        <div class="check"><strong>Fortschritt prüfen:</strong> ${esc(d.check)}</div>
        <div class="drill-open"><a class="btn primary" href="drill.html#${t.id}">${timerIcon}Mit Timer öffnen</a><a class="btn" href="drill.html#${t.id}" data-print="1">Drucken</a></div></div>`;
    } else {
      b += `<div class="nodrill">Drillplan folgt.</div>`;
    }
    const pr = (D.protocols || []).filter((x) => (x.topics || []).includes(t.id));
    if (pr.length) b += `</div><div class="sec"><h4>Protokolle dazu</h4><div class="plist">${pr.map(protoCard).join("")}</div>`;
    b += `</div><div class="sec"><h4>Video-Ideen</h4><div class="vlist">${t.videos.map((v0) => {
      const v = Core.video(v0.id);
      return `<div class="vitem"><div><div>${esc(v.title)}</div>${v.hook ? `<div class="vhook">„${esc(v.hook)}“</div>` : ""}<span class="fmt" title="${esc(D.formats[v.format] || "")}">${esc(v.format)}</span> <button class="linkish" data-goto="${v.id}">bearbeiten</button></div>${statusBtn(v.id)}</div>`;
    }).join("")}</div></div>`;
    const keep = state.current === id && !$("panel").hidden ? $("pbody").scrollTop : 0;
    $("pbody").innerHTML = b;
    $("pbody").scrollTop = push ? 0 : keep;
    const wasHidden = $("panel").hidden;
    $("panel").hidden = false; $("scrim").hidden = false;
    if (push && location.hash !== "#" + id) location.hash = id;
    if (wasHidden) $("pclose").focus();
    renderMap();
  }
  function protoCard(x) {
    const d = Core.protoDrill(x), cmd = x.rounds.some((r) => r.cmd && r.cmd.length);
    return `<a class="pcard" href="drill.html#${esc(x.id)}" style="--pc:${pc(x.pillar)}"><b>${esc(x.title)}</b><span>${esc(x.goal || "")}</span><small>${d.rounds} Runden · ${esc(d.dur)}${x.setup ? " · " + esc(x.setup) : ""}${cmd ? " · mit Kommandos" : ""}</small></a>`;
  }
  function renderProtos() {
    const el = $("protos"), L = D.protocols || [];
    if (!el) return;
    el.hidden = state.view !== "map" || !L.length;
    el.innerHTML = `<div class="protos-h"><h2>Protokolle</h2><span class="hint">Komplette Einheiten, Runde für Runde. Mit Timer und Kommandos.</span></div><div class="plist">${L.map(protoCard).join("")}</div>`;
  }
  function closePanel() {
    $("panel").hidden = true; $("scrim").hidden = true;
    const last = state.current; state.current = null;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    renderMap();
    const el = document.querySelector(`#map [data-node="${last}"]`);
    if (el) el.focus();
  }

  function setView(v) {
    state.view = v; saveUi();
    $("v-map").setAttribute("aria-pressed", v === "map");
    $("v-content").setAttribute("aria-pressed", v === "content");
    $("map").hidden = v !== "map"; $("content").hidden = v !== "content";
    $("legend").hidden = v !== "map";
    renderProtos();
    if (v === "content") renderContent();
  }
  function renderFinder() { renderWeakest(); renderSymptoms(); renderReco(); }
  function rerender() {
    renderStats(); renderFinder(); renderMap();
    if (state.view === "content" && !document.activeElement.closest?.(".vedit")) renderContent();
    if (!$("panel").hidden && state.current) openNode(state.current, false);
  }

  /* ---------- Speichern-Dialog ---------- */
  function openSync() {
    const f = $("syncform"), c = Core.ghSettings();
    ["owner", "repo", "branch", "path", "token"].forEach((k) => (f.elements[k].value = c[k] || ""));
    const m = $("syncmsg");
    m.className = "msg" + (Core.sync.state === "error" ? " err" : Core.sync.state === "ok" ? " ok" : "");
    m.textContent = Core.ghCfg() ? (Core.sync.state === "error" ? Core.sync.msg : "Verbunden: " + c.owner + "/" + c.repo) : "";
    $("sdisconnect").hidden = !Core.ghCfg();
    $("syncdlg").showModal();
  }
  $("syncform").addEventListener("submit", async (e) => {
    const v = e.submitter && e.submitter.value;
    if (v !== "connect") return;
    e.preventDefault();
    const f = e.target, m = $("syncmsg");
    const c = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || "main", path: f.path.value.trim() || "data/progress.json", token: f.token.value.trim() };
    if (!c.token) { m.className = "msg err"; m.textContent = "Ohne Token kann die Seite nicht in GitHub schreiben."; return; }
    m.className = "msg"; m.textContent = "Verbinde …";
    try {
      await Core.connect(c);
      m.className = "msg ok"; m.textContent = "Läuft. Ab jetzt wird jede Änderung nach ein paar Sekunden in GitHub gespeichert.";
      $("sdisconnect").hidden = false;
      rerender();
    } catch (err) {
      m.className = "msg err"; m.textContent = err.message;
    }
  });
  $("sdisconnect").addEventListener("click", () => { Core.disconnect(); $("syncmsg").className = "msg"; $("syncmsg").textContent = "Getrennt. Dein Stand bleibt auf diesem Gerät."; $("sdisconnect").hidden = true; });
  $("sexport").addEventListener("click", Core.exportProgress);
  $("simport").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const m = $("syncmsg");
    try { Core.importProgress(JSON.parse(await file.text())); m.className = "msg ok"; m.textContent = "Importiert und mit deinem Stand zusammengeführt."; }
    catch (err) { m.className = "msg err"; m.textContent = "Import fehlgeschlagen: " + err.message; }
    e.target.value = "";
  });

  /* ---------- Events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a[data-print]");
    if (!t) return;
    if (t.dataset.print) { e.preventDefault(); location.href = t.getAttribute("href").replace("#", "?print=1#"); return; }
    if (t.dataset.node) { openNode(t.dataset.node); return; }
    if (t.dataset.sym) {
      const id = t.dataset.sym;
      state.sym.has(id) ? state.sym.delete(id) : state.sym.add(id);
      state.q = ""; $("q").value = "";
      renderFinder(); renderMap(); return;
    }
    if (t.dataset.rate) { Core.setRating(t.dataset.rate, +t.dataset.v); rerender(); return; }
    if (t.dataset.rateClear) { Core.setRating(t.dataset.rateClear, null); rerender(); return; }
    if (t.dataset.vid && t.classList.contains("status")) {
      const vid = t.dataset.vid, cur = STATUS.findIndex((x) => x[0] === Core.statusOf(vid));
      Core.setVideo(vid, { status: STATUS[(cur + 1) % STATUS.length][0] });
      renderStats();
      if (state.view === "content") renderContent();
      if (!$("panel").hidden && state.current) openNode(state.current, false);
      return;
    }
    if (t.dataset.edit) { state.openVid = state.openVid === t.dataset.edit ? null : t.dataset.edit; renderContent(); return; }
    if (t.dataset.goto) {
      const vid = t.dataset.goto;
      state.openVid = vid; state.cf = { ...state.cf, pillar: "alle", format: "alle", status: "alle" };
      closePanel(); setView("content");
      const row = document.querySelector(`[data-row="${vid}"]`);
      if (row) { row.scrollIntoView({ block: "center" }); const f = row.querySelector("textarea"); if (f) f.focus({ preventScroll: true }); }
      return;
    }
    if (t.id === "csv") { csv(); return; }
    if (t.id === "moresym") { state.allSym = !state.allSym; renderSymptoms(); return; }
    if (t.id === "clear") { state.sym.clear(); state.q = ""; $("q").value = ""; renderFinder(); renderMap(); return; }
    if (t.id === "v-map") setView("map");
    if (t.id === "v-content") setView("content");
    if (t.id === "pclose") closePanel();
    if (t.id === "syncbtn") openSync();
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-cf]");
    if (s) { state.cf[s.dataset.cf] = s.value; saveUi(); renderContent(); return; }
    const f = e.target.closest(".vedit [data-f]");
    if (f && (f.tagName === "SELECT" || f.type === "date")) {
      const vid = f.closest(".vedit").dataset.vid;
      Core.setVideo(vid, { [f.dataset.f]: f.value });
      refreshRow(vid); renderStats();
    }
  });
  document.addEventListener("input", (e) => {
    const f = e.target.closest(".vedit [data-f]");
    if (!f || f.tagName === "SELECT" || f.type === "date") return;
    const vid = f.closest(".vedit").dataset.vid;
    Core.setVideo(vid, { [f.dataset.f]: f.value });
    refreshRow(vid);
  });
  $("scrim").addEventListener("click", closePanel);
  $("q").addEventListener("input", (e) => { state.q = e.target.value; renderReco(); renderMap(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("panel").hidden && !$("syncdlg").open) closePanel(); });
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h && idx.topics[h]) openNode(h, false);
    else if (!$("panel").hidden && !h) closePanel();
  }
  window.addEventListener("hashchange", fromHash);

  Core.on((type) => { if (type === "sync") renderSync(); if (type === "remote") rerender(); });

  (async function init() {
    try {
      D = await Core.loadData();
    } catch (err) {
      $("map").innerHTML = `<div class="empty">Die Daten konnten nicht geladen werden: ${esc(err.message)}.<br>Die Seite muss über einen Webserver laufen (z. B. GitHub Pages), nicht per Doppelklick. Lokal: im Ordner <code>python3 -m http.server</code> starten und <code>http://localhost:8000</code> öffnen.</div>`;
      return;
    }
    D.symptoms.forEach((s) => (symById[s.id] = s));
    await Core.initProgress();
    renderSync();
    setView(state.view);
    rerender();
    fromHash();
  })();
})();
