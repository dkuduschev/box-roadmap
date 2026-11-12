/* core.js – gemeinsam für Roadmap und Drillplan-Seite:
   Inhalte laden, Fortschritt speichern (lokal + GitHub), kleine Helfer. */
(function () {
  "use strict";

  const LS_PROGRESS = "box-roadmap-progress-v2";
  const LS_GH = "box-roadmap-github-v1";
  const LS_OLD = "box-roadmap-video-status-v1"; // alte Version der Seite
  const PUSH_DELAY = 4000;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const pc = (id) => `var(--p-${id})`;

  /* ---------- Inhalte ---------- */
  let data = null;
  const idx = { topics: {}, pillars: {}, videos: [], videoById: {} };

  async function loadData() {
    const r = await fetch("data/roadmap.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("data/roadmap.json nicht gefunden (" + r.status + ")");
    data = await r.json();
    data.pillars.forEach((p) => (idx.pillars[p.id] = p));
    data.topics.forEach((t) => {
      idx.topics[t.id] = t;
      (t.videos || []).forEach((v) => {
        const vv = { ...v, topic: t };
        idx.videos.push(vv);
        idx.videoById[v.id] = vv;
      });
    });
    return data;
  }

  /* ---------- Fortschritt ---------- */
  const empty = () => ({ version: 1, updated: null, videos: {}, ratings: {} });
  let progress = empty();

  function readLocal() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PROGRESS) || "null");
      if (p && typeof p === "object") return { ...empty(), ...p };
    } catch (e) {}
    // Übernahme aus der alten Seite (nur Status)
    const out = empty();
    try {
      const old = JSON.parse(localStorage.getItem(LS_OLD) || "{}") || {};
      Object.entries(old).forEach(([id, s]) => (out.videos[id] = { status: s, t: 1 }));
    } catch (e) {}
    return out;
  }
  function saveLocal() {
    try { localStorage.setItem(LS_PROGRESS, JSON.stringify(progress)); } catch (e) {}
  }

  // Pro Eintrag gewinnt der neuere Zeitstempel. So kann man auf Handy und Laptop parallel arbeiten.
  function merge(a, b) {
    const out = empty();
    ["videos", "ratings"].forEach((k) => {
      const A = (a && a[k]) || {}, B = (b && b[k]) || {};
      new Set([...Object.keys(A), ...Object.keys(B)]).forEach((id) => {
        const x = A[id], y = B[id];
        out[k][id] = !x ? y : !y ? x : (y.t || 0) > (x.t || 0) ? y : x;
      });
    });
    const ua = (a && a.updated) || "", ub = (b && b.updated) || "";
    out.updated = ua > ub ? ua : ub || null;
    return out;
  }
  const same = (a, b) => JSON.stringify({ v: a.videos, r: a.ratings }) === JSON.stringify({ v: b.videos, r: b.ratings });

  const listeners = new Set();
  const emit = (type) => listeners.forEach((fn) => { try { fn(type); } catch (e) { console.error(e); } });

  function commit() {
    progress.updated = new Date().toISOString();
    saveLocal();
    schedulePush();
  }

  const statusOf = (vid) => (progress.videos[vid] && progress.videos[vid].status) || "idee";
  function video(vid) {
    const base = idx.videoById[vid];
    if (!base) return null;
    const p = progress.videos[vid] || {};
    return {
      ...base,
      hook: p.hook ?? base.hook ?? "",
      format: p.format || base.format,
      status: p.status || "idee",
      date: p.date || "",
      link: p.link || "",
      notes: p.notes || ""
    };
  }
  function setVideo(vid, patch) {
    progress.videos[vid] = { ...(progress.videos[vid] || {}), ...patch, t: Date.now() };
    commit();
  }
  const rating = (tid) => { const r = progress.ratings[tid]; return r && r.v ? r.v : null; };
  function setRating(tid, v) {
    progress.ratings[tid] = { v: v || null, t: Date.now() };
    commit();
  }

  /* ---------- GitHub-Sync ---------- */
  function guessRepo() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const owner = h.split(".")[0];
      const seg = location.pathname.split("/").filter(Boolean)[0];
      const repo = seg && !seg.includes(".") ? seg : h;
      return { owner, repo };
    }
    return { owner: "", repo: "" };
  }
  function ghCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(LS_GH) || "null");
      if (c && c.token && c.owner && c.repo) return { branch: "main", path: "data/progress.json", ...c };
    } catch (e) {}
    return null;
  }
  function ghSettings() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(LS_GH) || "{}") || {}; } catch (e) {}
    const g = guessRepo();
    return { owner: c.owner || g.owner, repo: c.repo || g.repo, branch: c.branch || "main", path: c.path || "data/progress.json", token: c.token || "" };
  }
  function setGh(c) {
    try {
      if (!c) localStorage.removeItem(LS_GH);
      else localStorage.setItem(LS_GH, JSON.stringify(c));
    } catch (e) {}
    sha = null;
  }

  const b64enc = (s) => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]); return btoa(bin); };
  const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const apiUrl = (c) => `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split("/").map(encodeURIComponent).join("/")}`;
  const hdr = (c) => ({ Authorization: "Bearer " + c.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

  async function ghError(r) {
    let msg = "";
    try { msg = (await r.json()).message || ""; } catch (e) {}
    const human = {
      401: "Token ungültig oder abgelaufen",
      403: "Token hat keine Schreibrechte für dieses Repo",
      404: "Repo oder Branch nicht gefunden (oder Token sieht das Repo nicht)"
    }[r.status];
    const err = new Error((human || "GitHub-Fehler " + r.status) + (msg && !human ? ": " + msg : ""));
    err.status = r.status;
    return err;
  }
  async function ghGet(c) {
    const r = await fetch(apiUrl(c) + "?ref=" + encodeURIComponent(c.branch) + "&_=" + Date.now(), { headers: hdr(c), cache: "no-store" });
    if (r.status === 404) {
      // Datei fehlt noch: prüfen, ob wenigstens das Repo erreichbar ist
      const rr = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers: hdr(c) });
      if (!rr.ok) throw await ghError(rr);
      return { sha: null, json: null };
    }
    if (!r.ok) throw await ghError(r);
    const j = await r.json();
    return { sha: j.sha, json: JSON.parse(b64dec(j.content || "") || "null") };
  }
  async function ghPut(c, obj, curSha) {
    const body = { message: "Fortschritt aktualisiert", content: b64enc(JSON.stringify(obj, null, 1) + "\n"), branch: c.branch };
    if (curSha) body.sha = curSha;
    const r = await fetch(apiUrl(c), { method: "PUT", headers: { ...hdr(c), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) { const e = new Error("conflict"); e.conflict = true; throw e; }
    if (!r.ok) throw await ghError(r);
    return (await r.json()).content.sha;
  }

  let sha = null, dirty = false, pushing = false, pushTimer = null;
  const sync = { state: "local", msg: "Nur auf diesem Gerät", at: null };
  function setSync(state, msg) {
    sync.state = state; sync.msg = msg;
    if (state === "ok") sync.at = new Date();
    emit("sync");
  }

  function schedulePush() {
    if (!ghCfg()) { setSync("local", "Nur auf diesem Gerät"); return; }
    dirty = true;
    setSync("pending", "Änderungen warten …");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY);
  }

  async function push() {
    const c = ghCfg();
    if (!c || !dirty) return;
    if (pushing) { clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); return; }
    pushing = true; dirty = false; clearTimeout(pushTimer);
    setSync("busy", "Speichere in GitHub …");
    try {
      for (let i = 0; ; i++) {
        try {
          if (sha === null) { const rem = await ghGet(c); sha = rem.sha; if (rem.json) absorb(rem.json); }
          sha = await ghPut(c, progress, sha);
          break;
        } catch (e) {
          if (!e.conflict || i >= 3) throw e;
          const rem = await ghGet(c); // jemand anders war schneller: zusammenführen, nochmal
          sha = rem.sha;
          if (rem.json) absorb(rem.json);
        }
      }
      setSync(dirty ? "pending" : "ok", dirty ? "Änderungen warten …" : "In GitHub gespeichert");
    } catch (e) {
      dirty = true;
      setSync("error", e.message || String(e));
    } finally {
      pushing = false;
      if (dirty) { clearTimeout(pushTimer); pushTimer = setTimeout(push, PUSH_DELAY); }
    }
  }

  // Remote-Stand einarbeiten; meldet "remote", wenn sich sichtbar etwas geändert hat
  function absorb(remote) {
    const merged = merge(progress, remote);
    const changed = !same(merged, progress);
    const localNewer = !same(merged, remote);
    progress = merged;
    saveLocal();
    if (changed) emit("remote");
    return localNewer;
  }

  async function pull() {
    const c = ghCfg();
    if (!c) return;
    setSync("busy", "Lade aus GitHub …");
    try {
      const rem = await ghGet(c);
      sha = rem.sha;
      const localNewer = rem.json ? absorb(rem.json) : true;
      if (localNewer) { dirty = true; await push(); }
      else setSync("ok", "In GitHub gespeichert");
    } catch (e) {
      setSync("error", e.message || String(e));
    }
  }

  async function initProgress() {
    progress = readLocal();
    // Öffentlicher Stand aus dem Repo (ohne Token lesbar, z. B. auf GitHub Pages)
    try {
      const r = await fetch("data/progress.json?_=" + Date.now(), { cache: "no-store" });
      if (r.ok) { const j = await r.json(); progress = merge(progress, j); saveLocal(); }
    } catch (e) {}
    if (ghCfg()) pull(); else setSync("local", "Nur auf diesem Gerät");

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && dirty) push();
      if (document.visibilityState === "visible" && ghCfg() && !pushing) pull();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === LS_PROGRESS) { progress = readLocal(); emit("remote"); }
    });
  }

  async function connect(c) {
    setGh(c);
    dirty = true;
    await pull();
    if (sync.state === "error") throw new Error(sync.msg);
  }
  function disconnect() { setGh(null); clearTimeout(pushTimer); dirty = false; setSync("local", "Nur auf diesem Gerät"); }

  /* ---------- Backup als Datei ---------- */
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportProgress() { download("progress.json", JSON.stringify(progress, null, 1) + "\n"); }
  function importProgress(json) {
    if (!json || typeof json !== "object" || !("videos" in json || "ratings" in json)) throw new Error("Das ist keine progress.json");
    // Import gilt als neuester Stand
    const now = Date.now();
    ["videos", "ratings"].forEach((k) => Object.values(json[k] || {}).forEach((e) => e && (e.t = now)));
    progress = merge(progress, json);
    commit();
    emit("remote");
  }

  /* ---------- Helfer für Drillpläne ---------- */
  function fmtDur(s) {
    if (!s) return "";
    if (s < 60) return s + " s";
    if (s % 60 === 0) return s / 60 + " min";
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " min";
  }
  function exLabel(e) {
    if (e.label) return e.label;
    const r = e.rounds || 1;
    const what = e.work ? fmtDur(e.work) : e.reps || "";
    if (!what) return "";
    let s = r + " × " + what;
    if (e.rest && r > 1) s += " · " + fmtDur(e.rest) + " Pause";
    return s;
  }
  const weekText = (n) => (n == null ? null : n >= 5 ? "täglich" : n + "×");

  window.Core = {
    esc, $, pc, loadData, idx, get data() { return data; },
    initProgress, get progress() { return progress; }, on: (fn) => listeners.add(fn),
    video, statusOf, setVideo, rating, setRating,
    sync, ghSettings, ghCfg, connect, disconnect, pull, push, merge,
    exportProgress, importProgress, download,
    fmtDur, exLabel, weekText,
    STATUS: [["idee", "Idee"], ["geplant", "Geplant"], ["gedreht", "Gedreht"], ["online", "Online"]]
  };
})();
