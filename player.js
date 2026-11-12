// The recording player: data/meta.json lists gzipped chunks of frames. A frame is
// [key, turn, cursor row, cursor col, changes], changes = [[row, text, colours], ...]; each chunk's first frame holds
// the whole screen, so any chunk can be shown on its own.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const KEYNAMES = { 27: "Esc", 13: "↵", 10: "↵", 32: "␣", 8: "⌫", 127: "Del", 9: "Tab" };
  const keyName = (k) => KEYNAMES[k] ?? (k < 32 ? "^" + String.fromCharCode(k + 64)
    : k >= 128 ? "M-" + String.fromCharCode(k - 128) : String.fromCharCode(k));
  const fmt = (n) => n.toLocaleString("en-US");

  let meta = null, pos = 0, screen = null, screenAt = -1, playing = false, last = 0, acc = 0;
  const chunks = new Map();   // index -> frames (or a pending promise)

  async function loadChunk(ci) {
    if (chunks.has(ci)) return chunks.get(ci);
    const p = (async () => {
      const res = await fetch("data/" + meta.chunks[ci].file);
      if (!res.ok) throw new Error("could not load " + meta.chunks[ci].file);
      let bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {   // still gzipped (the server did not decode it)
        const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(ds).arrayBuffer());
      }
      const frames = JSON.parse(new TextDecoder().decode(bytes));
      chunks.set(ci, frames);
      return frames;
    })();
    chunks.set(ci, p);
    return p;
  }
  const chunkOf = (i) => Math.floor(i / meta.chunk);
  const frameAt = (i) => { const c = chunks.get(chunkOf(i)); return Array.isArray(c) ? c[i - chunkOf(i) * meta.chunk] : null; };

  function buildScreen(i) {   // the screen at frame i, from its chunk's start (or onward from the current one)
    const ci = chunkOf(i), c0 = ci * meta.chunk;
    let from = c0;
    if (screen && screenAt >= c0 && screenAt <= i && chunkOf(screenAt) === ci) from = screenAt + 1;
    else screen = Array.from({ length: 24 }, () => [" ".repeat(80), "0".repeat(80)]);
    for (let j = from; j <= i; j++) for (const [r, t, col] of frameAt(j)[4]) screen[r] = [t, col];
    screenAt = i;
  }

  function render() {
    const f = frameAt(pos);
    if (!f) return;
    buildScreen(pos);
    const cr = f[2], cc = f[3];
    let html = "";
    screen.forEach(([text, col], r) => {
      let run = "", rc = null;
      const flush = () => { if (run) html += `<span class="c${rc}">${esc(run)}</span>`; run = ""; };
      for (let c = 0; c < text.length; c++) {
        if (r === cr && c === cc) { flush(); html += `<span class="c${col[c]} cur">${esc(text[c])}</span>`; continue; }
        if (col[c] !== rc) { flush(); rc = col[c]; }
        run += text[c];
      }
      flush(); html += "\n";
    });
    $("tty").innerHTML = html;
    const caps = [];
    for (let j = pos; j >= 0 && caps.length < 28; j--) {
      const g = frameAt(j);
      if (!g) break;
      if (g[0] != null) caps.push(`<span class="cap${j === pos ? " now" : ""}">${esc(keyName(g[0]))}</span>`);
    }
    $("keys").innerHTML = caps.reverse().join("");
    $("seek").value = pos;
    $("pos").textContent = `Turn ${fmt(f[1])} · screen ${fmt(pos + 1)} of ${fmt(meta.frames)}`;
    let m = -1;
    meta.milestones.forEach((x, k) => { if (x.frame <= pos) m = k; });
    document.querySelectorAll("#milestones button").forEach((b, k) => b.classList.toggle("on", k === m));
  }

  async function go(i) {
    pos = Math.max(0, Math.min(meta.frames - 1, i));
    const ci = chunkOf(pos);
    if (!Array.isArray(chunks.get(ci))) {
      $("pos").textContent = "Loading…";
      await loadChunk(ci);
    }
    render();
    if (ci + 1 < meta.chunks.length && pos - ci * meta.chunk > meta.chunk * 0.6) loadChunk(ci + 1).catch(() => {});
  }

  function setPlaying(p) {
    playing = p;
    $("play").textContent = p ? "[ ❚❚ pause ]" : "[ ▶ play ]";
    $("play").setAttribute("aria-label", p ? "Pause" : "Play");
    if (p) { last = performance.now(); acc = 0; requestAnimationFrame(tick); }
  }
  function tick(now) {
    if (!playing) return;
    acc += (now - last) / 1000 * Number($("speed").value);
    last = now;
    const n = Math.floor(acc);
    if (n > 0) {
      acc -= n;
      const next = Math.min(meta.frames - 1, pos + n);
      if (!Array.isArray(chunks.get(chunkOf(next)))) {   // wait for the next chunk without skipping
        loadChunk(chunkOf(next)).then(() => { last = performance.now(); requestAnimationFrame(tick); });
        return;
      }
      pos = next;
      render();
      if (pos - chunkOf(pos) * meta.chunk > meta.chunk * 0.6 && chunkOf(pos) + 1 < meta.chunks.length) loadChunk(chunkOf(pos) + 1).catch(() => {});
      if (pos >= meta.frames - 1) { setPlaying(false); return; }
    }
    requestAnimationFrame(tick);
  }

  function milestoneStep(dir) {
    const ms = meta.milestones.map((m) => m.frame);
    const target = dir > 0 ? ms.find((f) => f > pos) : [...ms].reverse().find((f) => f < pos);
    if (target != null) go(target);
  }

  async function init() {
    try {
      meta = await (await fetch("data/meta.json")).json();
    } catch (e) {
      $("tty").textContent = "Could not load the recording. (Opened as a local file? Serve the folder over HTTP.)";
      return;
    }
    $("seek").max = meta.frames - 1;
    $("ticks").innerHTML = meta.milestones.map((m) => `<i style="left:${(m.frame / (meta.frames - 1)) * 100}%"></i>`).join("");
    $("milestones").innerHTML = meta.milestones.map((m, k) =>
      `<li><button data-k="${k}"><span class="t">T ${fmt(m.turn)}</span><span>${esc(m.label)}</span></button></li>`).join("");
    document.querySelectorAll("#milestones button").forEach((b) => b.onclick = () => {
      const f = meta.milestones[+b.dataset.k].frame;
      history.replaceState(null, "", "#f=" + f);
      go(f);
      $("tty").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    $("play").onclick = () => setPlaying(!playing);
    $("back").onclick = () => { setPlaying(false); go(pos - 1); };
    $("fwd").onclick = () => { setPlaying(false); go(pos + 1); };
    let seekTimer = null;
    $("seek").oninput = () => { clearTimeout(seekTimer); const v = +$("seek").value; seekTimer = setTimeout(() => go(v), 60); };
    document.addEventListener("keydown", (e) => {
      const tag = e.target.tagName;
      if (tag === "SELECT" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (tag === "INPUT" && e.key.startsWith("Arrow")) return;   // the slider moves itself
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;   // the button's own click
      if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); go(pos + (e.shiftKey ? 100 : 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); go(pos - (e.shiftKey ? 100 : 1)); }
      else if (e.key === "]") milestoneStep(1);
      else if (e.key === "[") milestoneStep(-1);
    });
    const h = /^#f=(\d+)$/.exec(location.hash);
    await go(h ? +h[1] : 0);
    window.addEventListener("hashchange", () => { const m = /^#f=(\d+)$/.exec(location.hash); if (m) go(+m[1]); });
  }
  init();
})();
