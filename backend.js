// 콘티를 읽고 쓰는 곳. 화면(app.js)은 api("/api/…") 하나로 부르고, 어디에 저장되는지는 여기서 정한다.
//   ServerBackend: 내 컴퓨터에서 server.py 로 켰을 때(엔의 작업실). 요청을 그대로 서버에 보낸다.
//   FolderBackend: 브라우저가 고른 폴더를 직접 읽고 쓴다(크롬·엣지·웨일 PC). 파일은 밖으로 나가지 않는다.
//   DemoBackend:   demo/ 의 예시 콘티. 고친 내용은 이 브라우저에만 남는다.
// 파일 주소는 "fs://<영상 폴더>/<경로>" 로 만들고 url() 이 실제로 열 수 있는 주소로 바꾼다.

export const KEEP_HISTORY = 30;
export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MEDIA = /\.(jpe?g|png|webp|gif|mp4|mov|webm|wav|mp3|m4a)$/i;
const SKIP = new Set(["node_modules", ".git", ".history", "__pycache__", "out", "_workspace", ".venv", "dist"]);
const CHARS_PER_SEC = 6.5; // 녹음 전 어림. 보통 빠르기 나레이션(분당 약 390자). 콘티에 charsPerSec 를 두면 그 값
const INTRO_SEC = 3.2;

export const DEFAULT_PATHS = { script: "script/{id}.json", timeline: "video/src/data/{id}-timeline.json", public: "video/public", stills: "" };
// 작업실에서 새로 만든 콘티는 폴더 하나에 모아 둔다
export const NEW_PATHS = { script: "script/{id}.json", timeline: "conti/{id}-timeline.json", public: "media", stills: "stills/{id}" };

export class ApiError extends Error {
  constructor(status, message, body = {}) { super(message); this.status = status; this.body = body; }
}

// ── 순수 계산(테스트가 부른다) ─────────────────────────

export function pathsOf(conti) {
  const id = conti.id || "";
  const p = { ...DEFAULT_PATHS, ...(conti.paths || {}) };
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v || "").replaceAll("{id}", id)]));
}

/** 대본 줄 + 타임라인 시각. 시각이 없으면 글자 수로 어림한다(server.py lines_of 와 같은 규칙). */
export function linesOf(script, timeline, cps = CHARS_PER_SEC) {
  const timed = new Map(((timeline || {}).lines || []).map((l) => [l.n, l]));
  const recorded = !(timeline || {}).estimated;
  const out = [];
  let t = 0;
  for (const l of script || []) {
    const tm = timed.get(l.n);
    if (l.introBefore && !tm) t += INTRO_SEC;
    let start, end;
    if (tm) { start = tm.start; end = tm.end; t = end; }
    else { const dur = Math.max(0.6, (l.display || "").length / cps); start = t; end = t + dur; t = end; }
    out.push({
      n: l.n, section: l.section || "", sectionTitle: l.sectionTitle || "", display: l.display || "",
      role: l.role || "narrator", voice: l.voice || "", start: +start.toFixed(3), end: +end.toFixed(3),
      timed: Boolean(tm) && recorded, introBefore: Boolean(l.introBefore),
    });
  }
  return { lines: out, duration: (timeline || {}).duration };
}

/** 붙여 넣은 대본 → 줄 목록. 빈 줄은 버린다. "학생:" "Q:" 로 시작하면 질문하는 사람 줄. */
export function scriptFromText(text) {
  const rows = String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return rows.map((s, i) => {
    const m = s.match(/^(학생|질문|Q)\s*[:：]\s*(.+)$/i);
    return m ? { n: i + 1, display: m[2], role: "viewer" } : { n: i + 1, display: s, role: "narrator" };
  });
}

export function newConti(id, title, script, shape = "wide", paths = NEW_PATHS) {
  return {
    conti: 1, id, title: title || "", shape, promise: "", thumb: "", paths: { ...paths }, bgm: [], lineEdits: {},
    cuts: script.map((l, i) => ({ id: `c${i + 1}`, from: l.n, kind: "grid", els: [], plan: "", memo: "", status: "" })),
  };
}

/** TTS 작업실이 내보낸 줄 조각 이름: "03_00m08.1s_몸을빠르게….wav" → { k: 3, start: 8.1 } */
export function parseTtsLine(name) {
  const m = String(name).match(/^(\d+)_(\d+)m(\d+(?:\.\d+)?)s_.*\.wav$/i);
  return m ? { k: +m[1], start: +m[2] * 60 + +m[3] } : null;
}

/** WAV 머리글에서 길이(초). 읽을 수 없으면 null. */
export function wavSeconds(buf) {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (v.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let o = 12, byteRate = 0;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(o + 16, true);
    if (id === "data") return byteRate ? size / byteRate : null;
    o += 8 + size + (size % 2);
  }
  return null;
}

/** TTS 작업실(server/textsplit.py)과 같은 규칙으로 한 줄을 조각으로 나눈다: 문장부호 뒤 띄어쓰기, 120자 넘으면 쉼표. */
export function splitLikeTts(line) {
  const out = [];
  for (let s of String(line || "").replace(/\*\*/g, "").trim().split(/(?<=[.?!])\s+/)) {
    s = s.trim();
    while (s.length > 120 && s.slice(0, 120).includes(",")) {
      const cut = s.lastIndexOf(",", 119) + 1;
      out.push(s.slice(0, cut));
      s = s.slice(cut).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

/** TTS 줄 조각들 → 대본 줄 시각. 대본 줄마다 TTS 가 나눌 조각 수만큼 순서대로 묶는다. */
export function timelineFromTts(parts, script) {
  const sorted = [...parts].sort((a, b) => a.k - b.k);
  const endOf = (p, i) => (p.seconds ? p.start + p.seconds : sorted[i + 1] ? sorted[i + 1].start : p.start + 2);
  const need = script.map((l) => Math.max(1, splitLikeTts(l.display).length));
  const total = need.reduce((a, b) => a + b, 0);
  const lines = [];
  let k = 0;
  script.forEach((l, i) => {
    if (k >= sorted.length) return;
    const a = k, b = Math.min(sorted.length, k + need[i]) - 1;
    lines.push({ n: l.n, start: +sorted[a].start.toFixed(3), end: +endOf(sorted[b], b).toFixed(3), file: sorted.slice(a, b + 1).map((p) => p.name).join("|") });
    k = b + 1;
  });
  const duration = lines.length ? lines.at(-1).end : 0;
  return { source: "TTS 작업실", lines, duration, mismatch: sorted.length !== total ? { tts: sorted.length, script: total } : null };
}

const query = (path) => {
  const u = new URL(path, "http://x");
  return [u.pathname, Object.fromEntries(u.searchParams)];
};
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const stamp = () => {
  const d = new Date(), z = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}-${z(d.getMilliseconds(), 3)}`;
};

// ── 서버(엔의 작업실) ─────────────────────────────────

export class ServerBackend {
  kind = "server";
  async call(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, j.error || `오류 ${r.status}`, j);
    return j;
  }
  url(u) { return u; }
}

// ── 공통: 파일 목록이 있는 저장소(폴더·예시) ──────────

class FileBackend {
  // 하위 클래스가 채운다: projects(), readText(proj, rel), writeText(proj, rel, text), list(proj), stat(proj, rel), fileUrl(proj, rel)
  urls = new Map();

  url(u) {
    if (!u || !u.startsWith("fs://")) return u;
    const rest = decodeURIComponent(u.slice(5));
    const k = rest.indexOf("/");
    return this.fileUrl(rest.slice(0, k), rest.slice(k + 1)) || "";
  }
  base(proj) { return `fs://${encodeURIComponent(proj)}/`; }

  async readJson(proj, rel, fallback = null) {
    try { return JSON.parse(await this.readText(proj, rel)); } catch (e) { if (e.name === "NotFoundError" || e.status === 404) return fallback; throw e; }
  }
  async writeJson(proj, rel, data) { await this.writeText(proj, rel, JSON.stringify(data, null, 1) + "\n"); }
  contiRel(vid) {
    if (!ID_RE.test(vid || "")) throw new ApiError(400, "영상 이름은 영문·숫자로 써 주세요.");
    return `conti/${vid}.json`;
  }

  async call(path, body) {
    const [p, q] = query(path);
    const post = body !== undefined;
    if (p === "/api/status") return { ok: true, kind: this.kind };
    if (p === "/api/videos") return { videos: await this.videos() };
    const proj = q.p;
    const known = (await this.projects()).includes(proj);
    // 예시에서는 「내 연습」 같은 새 묶음을 만들 수 있다(이 브라우저에만 저장)
    if (!known && !(p === "/api/create" && this.kind === "demo" && proj && !proj.includes("/"))) throw new ApiError(400, "영상 폴더를 찾을 수 없어요.");
    if (p === "/api/conti" && !post) return q.revOnly ? { rev: await this.rev(proj, this.contiRel(q.v)) } : this.load(proj, q.v);
    if (p === "/api/conti") return this.save(proj, q.v, body.conti, body.rev);
    if (p === "/api/new") return this.fromScript(proj, q.v, body.title);
    if (p === "/api/create") return this.create(proj, body);
    if (p === "/api/media") return { dir: q.dir, files: await this.media(proj, q.dir || "") };
    if (p === "/api/history") return { items: await this.history(proj, q.v) };
    if (p === "/api/restore") return this.restore(proj, q.v, body.stamp);
    if (p === "/api/timeline") return this.saveTimeline(proj, q.v, body);
    throw new ApiError(404, "없는 주소예요.");
  }

  async rev(proj, rel) {
    const s = await this.stat(proj, rel);
    return s ? `${s.mtime}-${s.size}` : "";
  }

  async videos() {
    const vids = [];
    for (const proj of await this.projects()) {
      const files = await this.list(proj);
      const have = new Set();
      for (const rel of files.filter((f) => /^conti\/[^/]+\.json$/.test(f) && !/-timeline\.json$/.test(f)).sort()) {
        const id = rel.slice(6, -5);
        if (!ID_RE.test(id)) continue;
        const c = (await this.readJson(proj, rel, {})) || {};
        const cuts = c.cuts || [];
        have.add(id);
        vids.push({ project: proj, id, title: c.title || "", shape: c.shape || "wide", cuts: cuts.length,
          fix: cuts.filter((k) => k.status === "fix").length, memo: cuts.filter((k) => (k.memo || "").trim()).length,
          edits: Object.keys(c.lineEdits || {}).length, exists: true });
      }
      for (const rel of files.filter((f) => /^script\/[^/]+\.json$/.test(f)).sort()) {
        const id = rel.slice(7, -5);
        if (!have.has(id) && ID_RE.test(id) && Array.isArray(await this.readJson(proj, rel, null))) vids.push({ project: proj, id, title: "", exists: false });
      }
    }
    return vids;
  }

  async load(proj, vid) {
    const rel = this.contiRel(vid);
    const conti = await this.readJson(proj, rel);
    if (!conti) throw new ApiError(404, `${proj}/conti/${vid}.json 이 없어요.`);
    await this.index(proj);
    const paths = pathsOf(conti);
    const script = paths.script ? await this.readJson(proj, paths.script, []) : [];
    const tl = paths.timeline ? await this.readJson(proj, paths.timeline, {}) : {};
    const { lines, duration } = linesOf(script, tl, conti.charsPerSec || CHARS_PER_SEC);
    const stills = {};
    if (paths.stills) {
      for (const f of await this.list(proj)) {
        if (!f.startsWith(paths.stills + "/")) continue;
        const m = f.slice(paths.stills.length + 1).match(/^L0*(\d+)\.(jpe?g|png)$/i);
        if (m) stills[+m[1]] = { url: this.fileUrl(proj, f) };
      }
    }
    const audio = tl && tl.audio ? this.fileUrl(proj, tl.audio) : "";
    return { project: proj, conti, rev: await this.rev(proj, rel), lines, duration, stills, paths, intro: null, audio, base: this.base(proj) };
  }

  async save(proj, vid, conti, rev) {
    const rel = this.contiRel(vid);
    const now = await this.rev(proj, rel);
    if (rev != null && now !== rev) throw new ApiError(409, "그사이 파일이 바뀌었어요.", { rev: now });
    if (!conti || !Array.isArray(conti.cuts)) throw new ApiError(400, "콘티 형식이 이상해요.");
    conti.id = vid;
    await this.backup(proj, vid);
    await this.writeJson(proj, rel, conti);
    return { ok: true, rev: await this.rev(proj, rel), saved: Date.now() / 1000 };
  }

  async backup(proj, vid) {
    const old = await this.readText(proj, this.contiRel(vid)).catch(() => null);
    if (old == null) return;
    await this.writeText(proj, `conti/.history/${vid}/${stamp()}.json`, old);
    const items = await this.history(proj, vid);
    for (const s of items.slice(KEEP_HISTORY)) await this.remove(proj, `conti/.history/${vid}/${s}.json`);
  }

  async history(proj, vid) {
    const pre = `conti/.history/${vid}/`;
    return (await this.list(proj, true)).filter((f) => f.startsWith(pre) && f.endsWith(".json")).map((f) => f.slice(pre.length, -5)).sort().reverse();
  }

  async restore(proj, vid, s) {
    if (!/^[0-9-]+$/.test(s || "")) throw new ApiError(400, "되돌릴 판이 이상해요.");
    const old = await this.readJson(proj, `conti/.history/${vid}/${s}.json`);
    if (!old) throw new ApiError(404, "그 판이 없어요.");
    await this.save(proj, vid, old, null);
    return this.load(proj, vid);
  }

  async fromScript(proj, vid, title) {
    const rel = this.contiRel(vid);
    if (await this.stat(proj, rel)) throw new ApiError(409, "이미 콘티가 있어요.");
    const script = await this.readJson(proj, `script/${vid}.json`);
    if (!Array.isArray(script)) throw new ApiError(404, `script/${vid}.json 이 없어요.`);
    await this.writeJson(proj, rel, newConti(vid, title, script, /^[SQ]/i.test(vid) ? "tall" : "wide", {}));
    return this.load(proj, vid);
  }

  async create(proj, { id, title, shape, text }) {
    const vid = id || (await this.freeId(proj));
    const rel = this.contiRel(vid);
    if (await this.stat(proj, rel)) throw new ApiError(409, "같은 이름의 콘티가 이미 있어요.");
    const script = scriptFromText(text);
    if (!script.length) throw new ApiError(400, "대본이 비어 있어요. 한 줄에 한 문장씩 붙여 넣어 주세요.");
    await this.writeJson(proj, `script/${vid}.json`, script);
    await this.writeJson(proj, rel, newConti(vid, title, script, shape === "tall" ? "tall" : "wide"));
    return { project: proj, id: vid };
  }

  async freeId(proj) {
    const have = new Set((await this.list(proj)).filter((f) => f.startsWith("conti/")).map((f) => f.slice(6, -5)));
    let k = 1;
    while (have.has(`V${k}`)) k++;
    return `V${k}`;
  }

  async saveTimeline(proj, vid, tl) {
    const conti = await this.readJson(proj, this.contiRel(vid));
    if (!conti) throw new ApiError(404, "콘티가 없어요.");
    const paths = pathsOf(conti);
    const rel = paths.timeline || `conti/${vid}-timeline.json`;
    await this.writeJson(proj, rel, { source: tl.source || "", audio: tl.audio || "", duration: tl.duration, lines: tl.lines });
    return this.load(proj, vid);
  }

  async media(proj, dir) {
    const pre = dir && dir !== "." ? dir.replace(/\/$/, "") + "/" : "";
    return (await this.list(proj)).filter((f) => f.startsWith(pre) && MEDIA.test(f)).map((f) => f.slice(pre.length)).sort();
  }
}

// ── 폴더(크롬·엣지·웨일) ──────────────────────────────

export const canPickFolder = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

export class FolderBackend extends FileBackend {
  kind = "folder";
  constructor(root) { super(); this.root = root; this.single = false; this.dirs = new Map(); this.files = new Map(); }

  get name() { return this.root.name; }

  static async open(root) {
    const b = new FolderBackend(root);
    await b.scan();
    return b;
  }

  async scan() {
    this.dirs.clear();
    const has = async (d) => { for await (const [n, h] of d.entries()) if (h.kind === "directory" && (n === "conti" || n === "script")) return true; return false; };
    if (await has(this.root)) { this.single = true; this.dirs.set(this.root.name, this.root); return; }
    for await (const [n, h] of this.root.entries()) {
      if (h.kind === "directory" && !n.startsWith(".") && !n.startsWith("_") && (await has(h))) this.dirs.set(n, h);
    }
    // 콘티가 하나도 없는 새 폴더면 그 폴더 자체를 영상 폴더로 쓴다
    if (!this.dirs.size) { this.single = true; this.dirs.set(this.root.name, this.root); }
  }

  async projects() { return [...this.dirs.keys()].sort(); }

  async walk(proj, hidden = false) {
    const out = new Map();
    const go = async (d, pre, depth) => {
      if (depth > 8 || out.size > 6000) return;
      for await (const [n, h] of d.entries()) {
        if (h.kind === "directory") {
          if (SKIP.has(n) && !(hidden && n === ".history")) continue;
          if (n.startsWith(".") && !(hidden && n === ".history")) continue;
          await go(h, pre + n + "/", depth + 1);
        } else if (!n.startsWith(".")) out.set(pre + n, h);
      }
    };
    await go(this.dirs.get(proj), "", 0);
    return out;
  }
  async list(proj, hidden = false) { return [...(await this.walk(proj, hidden)).keys()]; }

  async handle(proj, rel, create = false) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.some((s) => s === ".." || s === ".")) throw new ApiError(400, "폴더 밖 파일은 열 수 없어요.");
    let d = this.dirs.get(proj);
    for (const s of parts.slice(0, -1)) d = await d.getDirectoryHandle(s, { create });
    return d.getFileHandle(parts.at(-1), { create });
  }
  async readText(proj, rel) { return (await (await this.handle(proj, rel)).getFile()).text(); }
  async writeText(proj, rel, text) {
    const w = await (await this.handle(proj, rel, true)).createWritable();
    await w.write(text);
    await w.close();
  }
  async writeBlob(proj, rel, blob) {
    const w = await (await this.handle(proj, rel, true)).createWritable();
    await w.write(blob);
    await w.close();
  }
  async remove(proj, rel) {
    const parts = rel.split("/");
    let d = this.dirs.get(proj);
    for (const s of parts.slice(0, -1)) d = await d.getDirectoryHandle(s);
    await d.removeEntry(parts.at(-1));
  }
  async stat(proj, rel) {
    try { const f = await (await this.handle(proj, rel)).getFile(); return { mtime: f.lastModified, size: f.size }; }
    catch (e) { if (e.name === "NotFoundError" || e.name === "TypeError") return null; throw e; }
  }

  // 화면에 띄울 그림·영상은 미리 blob 주소로 만들어 둔다(주소를 바로 돌려줘야 해서)
  async index(proj) {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    for (const [rel, h] of await this.walk(proj)) {
      if (!MEDIA.test(rel)) continue;
      try { this.urls.set(`${proj}/${rel}`, URL.createObjectURL(await h.getFile())); } catch { /* 읽기 막힌 파일 */ }
    }
  }
  fileUrl(proj, rel) { return this.urls.get(`${proj}/${rel}`) || ""; }

  /** TTS 작업실 내보내기 폴더 → 이 콘티의 줄 시각. 소리 파일은 영상 폴더 audio/tts/ 에 복사한다. */
  async importTts(proj, vid, dir) {
    let lines = dir, narration = null;
    try { lines = await dir.getDirectoryHandle("lines"); } catch { /* lines 폴더를 바로 고른 경우 */ }
    try { narration = await (await dir.getFileHandle("narration.wav")).getFile(); } catch { /* 없음 */ }
    const parts = [];
    for await (const [n, h] of lines.entries()) {
      const p = h.kind === "file" && parseTtsLine(n);
      if (!p) continue;
      const f = await h.getFile();
      parts.push({ ...p, name: n, seconds: wavSeconds(await f.slice(0, 1 << 16).arrayBuffer()) });
    }
    if (!parts.length) throw new ApiError(400, "TTS 작업실 줄 조각(lines/03_00m08.1s_….wav)을 찾지 못했어요. 내보내기 폴더를 골라 주세요.");
    const conti = await this.readJson(proj, this.contiRel(vid));
    // 대사를 고친 줄은 고친 글로 내보냈으니 그 글로 조각 수를 센다
    const script = (await this.readJson(proj, pathsOf(conti).script, [])).map((l) => ({ ...l, display: conti.lineEdits?.[l.n]?.display ?? l.display }));
    const tl = timelineFromTts(parts, script);
    let audio = "";
    if (narration) {
      audio = `audio/tts/${vid}-narration.wav`;
      await this.writeBlob(proj, audio, narration);
    }
    const d = await this.call(`/api/timeline?p=${encodeURIComponent(proj)}&v=${encodeURIComponent(vid)}`, { ...tl, audio });
    return { data: d, mismatch: tl.mismatch, count: tl.lines.length };
  }
}

// ── 예시(demo/) ───────────────────────────────────────

export class DemoBackend extends FileBackend {
  kind = "demo";
  constructor(manifest, root = "demo/") { super(); this.m = manifest; this.root = root; this.key = "conti-demo-v1"; }
  static async open(root = "demo/") {
    const r = await fetch(root + "index.json");
    if (!r.ok) throw new ApiError(404, "예시 파일을 불러오지 못했어요.");
    return new DemoBackend(await r.json(), root);
  }
  get name() { return "예시"; }
  mem() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } }
  put(m) { try { localStorage.setItem(this.key, JSON.stringify(m)); } catch { /* 저장 안 되는 창: 이번만 쓴다 */ this._m = m; } }
  reset() { try { localStorage.removeItem(this.key); } catch { /* 없음 */ } this._m = null; }
  edits() { return this._m || this.mem(); }

  async projects() { return [...Object.keys(this.m.projects), ...Object.keys(this.edits().projects || {})].filter((v, i, a) => a.indexOf(v) === i); }
  async list(proj, hidden = false) {
    const own = Object.keys(((this.edits().files || {})[proj]) || {});
    const base = (this.m.projects[proj] || { files: [] }).files;
    return [...new Set([...base, ...own])].filter((f) => hidden || !f.includes("/.history/"));
  }
  async readText(proj, rel) {
    const own = ((this.edits().files || {})[proj] || {})[rel];
    if (own != null) return own.text;
    if (!(this.m.projects[proj] || { files: [] }).files.includes(rel)) throw new ApiError(404, "파일이 없어요.");
    const r = await fetch(this.root + enc(`${proj}/${rel}`));
    if (!r.ok) throw new ApiError(404, "파일이 없어요.");
    return r.text();
  }
  async writeText(proj, rel, text) {
    const m = this.edits();
    m.files ||= {}; m.files[proj] ||= {};
    m.files[proj][rel] = { text, mtime: Date.now() };
    if (!this.m.projects[proj]) { m.projects ||= {}; m.projects[proj] = true; }
    this.put(m);
  }
  async remove(proj, rel) { const m = this.edits(); if (m.files?.[proj]) delete m.files[proj][rel]; this.put(m); }
  async stat(proj, rel) {
    const own = ((this.edits().files || {})[proj] || {})[rel];
    if (own) return { mtime: own.mtime, size: own.text.length };
    return (this.m.projects[proj] || { files: [] }).files.includes(rel) ? { mtime: 0, size: 0 } : null;
  }
  async index() { /* 정적 파일이라 할 일 없음 */ }
  fileUrl(proj, rel) {
    return (this.m.projects[proj] || { files: [] }).files.includes(rel) ? this.root + enc(`${proj}/${rel}`) : "";
  }
}

// ── 고르기 ────────────────────────────────────────────

/** server.py 가 내주는 화면이면 서버를 쓴다. 아니면 null(시작 화면에서 고른다). */
export async function detectServer() {
  if (!/^(localhost|127\.0\.0\.1|100\.\d+\.\d+\.\d+)$/.test(location.hostname)) return null;
  try {
    const r = await fetch("/api/status");
    if (r.ok && (await r.json()).ok) return new ServerBackend();
  } catch { /* 정적 서버 */ }
  return null;
}

// 고른 폴더를 다음에 다시 열 수 있게 IndexedDB 에 둔다(폴더 안 파일은 저장하지 않는다)
const IDB = "conti-studio";
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export async function rememberFolder(handle) {
  try { const db = await idb(); db.transaction("kv", "readwrite").objectStore("kv").put(handle, "folder"); } catch { /* 사생활 보호 창 */ }
}
export async function recentFolder() {
  try {
    const db = await idb();
    return await new Promise((ok) => { const r = db.transaction("kv").objectStore("kv").get("folder"); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
  } catch { return null; }
}
export async function forgetFolder() {
  try { const db = await idb(); db.transaction("kv", "readwrite").objectStore("kv").delete("folder"); } catch { /* 없음 */ }
}
