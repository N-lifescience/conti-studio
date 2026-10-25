// 콘티 작업실 화면. 영상 폴더의 conti/<영상>.json 을 읽고 쓴다. 어디에 저장하는지는 backend.js 가 정한다.
// 컷 = 장면 하나 + 사람용 칸(id·plan·memo·status). 컷 하나는 시작 줄(from)부터 다음 컷 앞 줄까지.
import { EL, KIND, TEXT_EL, base, describe, elText } from "./describe.js?v=2";
import { DemoBackend, FolderBackend, canPickFolder, detectServer, forgetFolder, recentFolder, rememberFolder } from "./backend.js?v=2";

const $ = (s, el = document) => el.querySelector(s);
const S = {
  videos: [], cur: null, data: null, conti: null, rev: "",
  idx: new Map(), filter: "all", q: "",
  undo: [], redo: [], lastKey: "", lastAt: 0,
  dirty: false, saving: false, timer: 0, savedAt: 0, conflict: false,
  layout: new Set(), peek: new Map(), touched: new Set(), media: null,
};
let B = null; // 저장소(backend.js)
const SIZE = { wide: [1920, 1080], tall: [1080, 1920] };
const DEF = { label: 54, say: 96, card: 50, stamp: 72, tile: 74, type: 50, count: 130, x: 200, o: 200, q: 150 };
const FLOW = ["대본", "콘티 확인", "나레이션 녹음", "영상 만들기"];
const NOW = "콘티 확인";
const GUIDE = "https://raw.githubusercontent.com/N-lifescience/conti-studio/main/AI-GUIDE.md"; // AI가 읽는 글
const GUIDE_PAGE = "https://github.com/N-lifescience/conti-studio/blob/main/AI-GUIDE.md"; // 사람이 보는 쪽

// ── 작은 도구 ─────────────────────────────────────────

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {}
  // 아이폰에서 http://100.x 주소로 열면 navigator.clipboard 가 없다 → 옛 방식으로 복사
  const ta = h("textarea", { readonly: true, style: { position: "fixed", top: "0", opacity: "0" } }, t);
  document.body.append(ta);
  ta.select(); ta.setSelectionRange(0, t.length);
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}
const clock = (t) => {
  if (t == null || isNaN(t)) return "–";
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};
const api = (path, body) => B.call(path, body);
const F = (u) => (u ? B.url(u) : u); // fs://… 주소 → 열 수 있는 주소
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 안 되는 창 */ } },
};
const qs = () => `p=${encodeURIComponent(S.cur.project)}&v=${encodeURIComponent(S.cur.id)}`;
const plain = (t) => String(t ?? "").replace(/\*\*/g, "");
const recorded = () => S.data.lines.some((l) => l.timed); // 음성(타임라인)이 있나

// ── 경로 ─────────────────────────────────────────────

const pub = () => `${S.data.base}${S.data.paths.public.split("/").map(encodeURIComponent).join("/")}/`;
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const url = {
  bg: (v) => v && F(pub() + enc(/\.(jpe?g|png|webp)$/i.test(v) ? v : v.includes("/") ? `${v}.jpg` : `bg/${v}.jpg`)),
  src: (v) => v && F(pub() + enc(v)),
  who: (v) => v && F(pub() + enc(`chars/${v}.png`)),
  proj: (v) => v && F(S.data.base + enc(v)),
};

// ── 줄과 컷 ───────────────────────────────────────────

function lineText(l) {
  const e = S.conti.lineEdits?.[l.n];
  return e ? e.display : l.display;
}
function lineIndex(from) {
  const n = Math.floor(from);
  if (S.idx.has(n)) return S.idx.get(n);
  // 없는 줄(뺀 줄)이면 그다음 줄
  const lines = S.data.lines;
  const k = lines.findIndex((l) => l.n > n);
  return k < 0 ? lines.length - 1 : k;
}
function ranges() {
  const lines = S.data.lines, cuts = S.conti.cuts;
  const starts = cuts.map((c) => lineIndex(c.from));
  return cuts.map((c, i) => {
    const a = i === 0 ? 0 : starts[i];
    let b = i + 1 < cuts.length ? starts[i + 1] - 1 : lines.length - 1;
    if (i + 1 < cuts.length && starts[i + 1] === starts[i]) b = a; // 같은 줄 안에서 바뀌는 컷
    const ls = lines.slice(a, Math.max(a, b) + 1);
    const first = lines[starts[i]] || ls[0];
    const frac = c.from - Math.floor(c.from);
    const start = first ? first.start + frac * (first.end - first.start) : 0;
    const nx = cuts[i + 1];
    let end = ls.length ? ls[ls.length - 1].end : start;
    if (nx) {
      const nl = lines[starts[i + 1]];
      const nf = nx.from - Math.floor(nx.from);
      if (nl && nf > 0) end = nl.start + nf * (nl.end - nl.start);
      else if (nl) end = Math.min(end, nl.start) || end;
    }
    return { lines: ls, start, end, first: starts[i] };
  });
}

// ── 바꾸기·되돌리기·저장 ──────────────────────────────

function mutate(fn, key = "") {
  const now = Date.now();
  if (!(key && key === S.lastKey && now - S.lastAt < 1500)) {
    S.undo.push(JSON.stringify(S.conti));
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
  }
  S.lastKey = key; S.lastAt = now;
  fn();
  markDirty();
}
function markDirty() {
  S.dirty = true;
  $("#undo").disabled = !S.undo.length;
  showSave();
  clearTimeout(S.timer);
  S.timer = setTimeout(save, 1200);
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.conti));
  S.conti = JSON.parse(S.undo.pop());
  S.lastKey = "";
  renderAll();
  markDirty();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.conti));
  S.conti = JSON.parse(S.redo.pop());
  renderAll();
  markDirty();
}
async function save(force = false) {
  if (!S.dirty || S.saving || (S.conflict && !force)) return;
  S.saving = true; showSave();
  try {
    const r = await api(`/api/conti?${qs()}`, { conti: S.conti, rev: force ? null : S.rev });
    S.rev = r.rev; S.dirty = false; S.savedAt = Date.now(); S.conflict = false;
    hideBanner();
  } catch (e) {
    if (e.status === 409) {
      S.conflict = true;
      banner("그사이 이 콘티 파일이 바뀌었어요. AI가 고쳤을 수 있는데, 어느 쪽을 쓸까요?", [
        ["새로 불러오기", () => openVideo(S.cur, true)],
        ["내가 고친 걸로 덮어쓰기", () => save(true)],
      ]);
    } else banner(`저장하지 못했어요: ${e.message}`, [["다시 저장", () => save()]]);
  } finally {
    S.saving = false; showSave();
  }
}
function showSave() {
  const el = $("#save");
  el.className = "save";
  if (S.conflict) { el.textContent = "저장 멈춤"; el.classList.add("err"); }
  else if (S.saving) el.textContent = "저장 중…";
  else if (S.dirty) { el.textContent = "고친 내용 저장 대기"; el.classList.add("dirty"); }
  else if (S.savedAt) el.textContent = `저장함 ${new Date(S.savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  else el.textContent = S.data ? "저장된 상태" : "";
}
function banner(msg, actions = []) {
  const b = $("#banner");
  b.replaceChildren(h("p", {}, msg), ...actions.map(([t, f]) => h("button", { class: "btn small", onclick: f }, t)),
    h("button", { class: "btn small", onclick: hideBanner, "aria-label": "알림 닫기" }, "닫기"));
  b.classList.remove("hidden");
}
function hideBanner() { $("#banner").classList.add("hidden"); }

// ── 영상 고르기 ───────────────────────────────────────

async function loadVideos() {
  const { videos } = await api("/api/videos");
  S.videos = videos;
  const sel = $("#pick");
  sel.replaceChildren();
  const byProj = new Map();
  for (const v of videos) {
    if (!byProj.has(v.project)) byProj.set(v.project, []);
    byProj.get(v.project).push(v);
  }
  for (const [p, vs] of byProj) {
    const g = h("optgroup", { label: p });
    for (const v of vs) {
      const tag = v.exists ? `${v.id}${v.title ? " · " + v.title : ""} — 컷 ${v.cuts}${v.fix ? ` · 고쳐 주세요 ${v.fix}` : ""}` : `${v.id} — 콘티 새로 만들기`;
      g.append(h("option", { value: JSON.stringify({ project: v.project, id: v.id, exists: v.exists }) }, tag));
    }
    sel.append(g);
  }
  if (!videos.length) sel.append(h("option", { value: "{}" }, "콘티가 아직 없어요"));
  return videos;
}

async function openVideo(v, force = false) {
  if (!force && S.dirty) await save();
  if (!v.exists && v.exists !== undefined) {
    if (!confirm(`${v.project} / ${v.id} 대본으로 빈 콘티를 만들까요? 줄마다 컷이 하나씩 생겨요.`)) { syncPick(); return; }
    await api(`/api/new?p=${encodeURIComponent(v.project)}&v=${encodeURIComponent(v.id)}`, {});
    await loadVideos();
  }
  S.cur = { project: v.project, id: v.id };
  applyData(await api(`/api/conti?${qs()}`));
  S.undo = []; S.redo = []; S.dirty = false; S.conflict = false; S.touched.clear(); S.media = null; S.mediaCache = {};
  S.conti.cuts.forEach((c, i) => { if (!c.id) c.id = `c${i + 1}`; });
  $("#undo").disabled = true;
  store.set(`conti-last-${B.kind}`, S.cur);
  syncPick();
  hideBanner();
  renderAll();
  showSave();
}
function syncPick() {
  const sel = $("#pick");
  for (const o of sel.options) {
    const v = JSON.parse(o.value);
    if (S.cur && v.project === S.cur.project && v.id === S.cur.id) { sel.value = o.value; break; }
  }
}

// 다른 곳(Claude)이 파일을 고쳤으면, 내가 고치던 게 없을 때 조용히 다시 불러온다
async function watch() {
  if (!S.cur || S.dirty || S.saving || document.hidden) return;
  try {
    const { rev } = await api(`/api/conti?${qs()}&revOnly=1`);
    if (rev && rev !== S.rev) {
      const y = scrollY;
      await openVideo(S.cur, true);
      scrollTo(0, y);
      banner("콘티 파일이 바뀌어서 새로 불러왔어요.");
      setTimeout(hideBanner, 4000);
    }
  } catch { /* 서버가 잠깐 꺼짐 */ }
}

// ── 그리기 ────────────────────────────────────────────

function renderAll() {
  const main = $("#main");
  const R = ranges();
  const c = S.conti;
  const total = S.data.duration ?? (S.data.lines.at(-1)?.end || 0);
  const edits = Object.keys(c.lineEdits || {}).length;
  const fix = c.cuts.filter((k) => k.status === "fix").length;
  const memo = c.cuts.filter((k) => (k.memo || "").trim()).length;
  const ok = c.cuts.filter((k) => k.status === "ok").length;

  const head = h("section", { class: "promise", "aria-label": "표지와 목표" },
    h("button", { class: "thumb", title: "표지 그림 고르기", onclick: () => pick({ kind: "thumb", get: () => c.thumb, set: (v) => mutate(() => { c.thumb = v; }) }) },
      c.thumb && url.proj(c.thumb) ? h("img", { src: url.proj(c.thumb), alt: "표지 그림" }) : h("span", { class: "empty" }, "표지 그림(섬네일)을 눌러서 골라요.")),
    h("div", {},
      field("제목", "input", c.title, (v) => { c.title = v; }, "title"),
      field("이 영상의 목표 한 줄", "textarea", c.promise, (v) => { c.promise = v; }, "promise",
        "학생이 이 영상을 보고 알게 될 것을 한 줄로 적어요. 첫 5초 안에 그 내용을 보여 주는지 아래에서 확인해요."),
      h("div", { class: "stats" },
        h("span", {}, "컷 ", h("b", {}, c.cuts.length)),
        h("span", {}, "길이 ", h("b", {}, clock(total).replace(/\.\d$/, ""))),
        h("span", {}, "좋아요 ", h("b", {}, ok)),
        h("span", { class: fix ? "bad" : "" }, "고쳐 주세요 ", h("b", {}, fix)),
        h("span", { class: memo ? "warn" : "" }, "메모 ", h("b", {}, memo)),
        h("span", { class: edits ? "warn" : "" }, "대사 고침 ", h("b", {}, edits), "줄")),
      ttsBar(),
      first5(R)));

  const flow = h("ol", { class: "flow", "aria-label": "제작 순서" },
    FLOW.map((t) => h("li", { class: t === NOW ? "now" : "" }, t === NOW ? `${t} (지금 여기)` : t)));

  const filters = h("div", { class: "filters", role: "toolbar", "aria-label": "컷 거르기" },
    ...[["all", "전체"], ["fix", "고쳐 주세요"], ["memo", "메모 있는 컷"], ["edited", "대사 고친 컷"], ["empty", "화면 빈 컷"]]
      .map(([k, t]) => h("button", { class: "chip", "aria-pressed": String(S.filter === k), onclick: () => { S.filter = k; renderAll(); } }, t)),
    h("input", { type: "search", placeholder: "대사·글씨·메모에서 찾기", value: S.q, "aria-label": "찾기",
      oninput: (e) => { S.q = e.target.value; clearTimeout(S.qt); S.qt = setTimeout(() => { renderList(); }, 200); } }));

  const list = h("div", { id: "list" });
  main.replaceChildren(flow, head, filters, list);
  renderList(R);
}

function first5(R) {
  const items = [];
  for (let i = 0; i < R.length && R[i].start < 5; i++) items.push(i);
  if (!items.length) return null;
  return h("div", { class: "first5" },
    h("h3", {}, "첫 5초"),
    h("div", { class: "strip" }, items.map((i) => {
      const r = R[i], last = r.lines.at(-1);
      const st = last && S.data.stills[last.n];
      return h("button", { onclick: () => jump(S.conti.cuts[i].id), title: `컷 ${i + 1}로 가기` },
        st ? h("img", { src: F(st.url), alt: "", loading: "lazy" }) : null,
        h("span", {}, `${clock(r.start)} ${plain(r.lines.map(lineText).join(" ")).slice(0, 40)}`));
    })));
}

function field(label, type, value, set, key, hint) {
  const input = h(type, { value: type === "input" ? value || "" : null, rows: type === "textarea" ? 2 : null,
    oninput: (e) => mutate(() => set(e.target.value), key) });
  if (type === "textarea") input.value = value || "";
  return h("label", { class: "field" }, h("span", {}, label), input, hint ? h("p", { class: "hint" }, hint) : null);
}

function matches(cut, r) {
  const f = S.filter;
  if (f === "fix" && cut.status !== "fix") return false;
  if (f === "memo" && !(cut.memo || "").trim()) return false;
  if (f === "edited" && !r.lines.some((l) => S.conti.lineEdits?.[l.n])) return false;
  if (f === "empty" && ((cut.els || []).length || cut.kind !== "grid")) return false;
  if (S.q) {
    const hay = [cut.plan, cut.memo, cut.text, ...(cut.els || []).map((e) => e.text), ...r.lines.map(lineText)].join(" ").toLowerCase();
    if (!hay.includes(S.q.toLowerCase())) return false;
  }
  return true;
}

function renderList(R = ranges()) {
  const list = $("#list");
  if (!list) return;
  const frag = document.createDocumentFragment();
  let lastSec = null, shown = 0;
  S.conti.cuts.forEach((cut, i) => {
    const r = R[i];
    const sec = S.data.lines[r.first]?.section;
    if (!matches(cut, r)) return;
    if (r.lines[0]?.introBefore && S.data.intro) {
      frag.append(h("div", { class: "intro-slot" },
        h("video", { src: S.data.intro.url, poster: S.data.intro.poster, controls: true, preload: "metadata", playsinline: true, "aria-label": "채널 인트로 영상" }),
        h("div", {}, h("b", {}, `채널 인트로 ${S.data.intro.sec}초`), h("p", { class: "hint" }, "결론과 본론 사이에 들어가요. 바꾸고 싶으면 아래 컷 메모에 적어 주세요."))));
    }
    if (sec && sec !== lastSec) {
      const l = S.data.lines[r.first];
      frag.append(h("h2", { class: "section" }, l.sectionTitle || sec, h("small", {}, sec)));
      lastSec = sec;
    }
    frag.append(renderCut(cut, i, r));
    shown++;
  });
  if (!shown) frag.append(h("p", { class: "muted" }, "맞는 컷이 없어요."));
  list.replaceChildren(frag);
}

function rerenderCut(cut) {
  const old = document.getElementById(`cut-${cut.id}`);
  if (!old) return;
  const i = S.conti.cuts.indexOf(cut);
  old.replaceWith(renderCut(cut, i, ranges()[i]));
}

function renderCut(cut, i, r) {
  const shape = S.conti.shape === "tall" ? "tall" : "wide";
  // 화면을 아직 안 짠 컷(대본만 있을 때)은 미리보기 칸 없이 대사·메모만 보여 준다
  const bare = cut.kind === "grid" && !(cut.els || []).length && !r.lines.some((l) => S.data.stills[l.n]);
  const card = h("article", { class: `cut ${shape} ${bare ? "bare" : ""} ${cut.status || ""}`, id: `cut-${cut.id}`, "aria-label": `컷 ${i + 1}` });
  const stageBox = h("div", { class: "stage-wrap" });
  const drawStage = () => stageBox.replaceChildren(...stage(cut, r, drawStage));
  if (!bare) drawStage();
  card._drawStage = drawStage;

  const setStatus = (s) => mutate(() => { cut.status = cut.status === s ? "" : s; }) || rerenderCut(cut);
  const head = h("div", { class: "cut-head" },
    h("span", { class: "num" }, `컷 ${i + 1}`),
    h("span", { class: "time" }, `${clock(r.start)} – ${clock(r.end)} · ${Math.max(0, r.end - r.start).toFixed(1)}초`),
    S.data.audio && F(S.data.audio) ? h("button", { class: "btn ghost small", "aria-label": `컷 ${i + 1} 나레이션 듣기`, onclick: (e) => listen(r, e.currentTarget) }, "듣기") : null,
    h("div", { class: "status" },
      h("button", { class: cut.status === "ok" ? "on-ok" : "", "aria-pressed": String(cut.status === "ok"), onclick: () => setStatus("ok") }, "좋아요"),
      h("button", { class: cut.status === "fix" ? "on-fix" : "", "aria-pressed": String(cut.status === "fix"), onclick: () => setStatus("fix") }, "고쳐 주세요")));

  const memo = h("div", { class: "block memo" }, h("h4", {}, bare ? "원하는 화면이나 고칠 점 (AI에게)" : "AI에게 부탁할 것", h("a", { class: "dict", href: "terms.html", target: "_blank", rel: "noopener" }, "용어 사전")),
    ta(cut.memo, bare ? "예) 여기서는 실험 사진을 크게, 아래에 '용액이 노랗게' 글씨" : "예) 사진을 더 크게, 글씨는 빼 주세요", (v) => mutate(() => { cut.memo = v; }, `memo-${cut.id}`), "이 컷 메모"));
  if (bare) {
    const add = h("div", { class: "row-acts" },
      h("button", { class: "btn small", onclick: () => addMedia(cut, "img") }, "+ 그림 넣기"),
      h("button", { class: "btn small", onclick: () => addMedia(cut, "vid") }, "+ 영상 넣기"),
      h("button", { class: "btn small", onclick: () => { mutate(() => { (cut.els ||= []).push({ t: "label", text: plain(r.lines[0] ? lineText(r.lines[0]) : "새 글씨").slice(0, 20), pos: [SIZE[shape][0] / 2, SIZE[shape][1] * 0.18], color: "yellow" }); }); S.touched.add(cut.id); rerenderCut(cut); } }, "+ 글씨 넣기"));
    card.append(h("div", {}, head, linesBlock(cut, r, drawStage), memo, add));
    return card;
  }
  const body = h("div", {}, head,
    linesBlock(cut, r, drawStage),
    h("div", { class: "block" }, h("h4", {}, "지금 화면"), h("p", { class: "plan" }, cut.plan || describe(cut))),
    textsBlock(cut, drawStage),
    mediaBlock(cut, drawStage),
    memo,
    moreBlock(cut, i, r));
  card.append(stageBox, body);
  return card;
}

function ta(value, placeholder, onInput, label) {
  const t = h("textarea", { placeholder, rows: 2, "aria-label": label, oninput: (e) => onInput(e.target.value) });
  t.value = value || "";
  return t;
}

function linesBlock(cut, r, drawStage) {
  const box = h("div", { class: "lines" });
  r.lines.forEach((l, k) => {
    const edit = S.conti.lineEdits?.[l.n];
    const text = h("p", { class: `say-text${edit ? " edited" : ""}` }, plain(lineText(l)),
      edit ? h("span", { class: "badge" }, recorded() ? "다시 녹음" : "녹음 전 고침") : null,
      edit ? h("span", { class: "was" }, plain(l.display)) : null);
    const row = h("div", { class: "line", onmouseenter: () => peek(cut, l.n, drawStage) },
      h("span", { class: `who ${l.role === "viewer" ? "viewer" : ""}` }, l.role === "viewer" ? "질문" : "나레이션"),
      text,
      h("div", { class: "acts" },
        h("button", { class: "btn ghost small", title: "대사 고치기", "aria-label": `${l.n}번 줄 대사 고치기`, onclick: () => editLine(row, l, cut) }, "고치기"),
        k > 0 ? h("button", { class: "btn ghost small", title: "이 줄부터 새 컷", "aria-label": `${l.n}번 줄부터 새 컷`, onclick: () => splitAt(cut, l.n) }, "여기서 나누기") : null));
    row.addEventListener("focusin", () => peek(cut, l.n, drawStage));
    box.append(row);
  });
  return h("div", { class: "block" }, h("h4", {}, "대사"), box);
}

function editLine(row, l, cut) {
  const t = h("textarea", { "aria-label": "대사" });
  t.value = lineText(l);
  const done = (keep) => {
    if (keep) {
      const v = t.value.trim();
      mutate(() => {
        S.conti.lineEdits ||= {};
        if (!v || v === l.display) delete S.conti.lineEdits[l.n];
        else S.conti.lineEdits[l.n] = { display: v, was: l.display };
      });
    }
    rerenderCut(cut);
    renderStatsOnly();
  };
  const bar = h("div", { class: "row-acts" },
    h("button", { class: "btn small primary", onclick: () => done(true) }, "고친 대사 쓰기"),
    S.conti.lineEdits?.[l.n] ? h("button", { class: "btn small", onclick: () => { t.value = l.display; done(true); } }, "원래대로") : null,
    h("button", { class: "btn small", onclick: () => done(false) }, "그만두기"));
  row.children[1].replaceWith(h("div", {}, t, bar, h("p", { class: "hint" }, recorded() ? "고친 줄은 렌더 전에 음성을 다시 만들어요." : "아직 녹음 전이라 고친 대사로 바로 녹음해요.")));
  t.focus();
}

function textsBlock(cut, drawStage) {
  const rows = [];
  if (cut.kind === "burst") rows.push(textRow("강조 글자", cut.text, (v) => { cut.text = v; }, cut, drawStage, "text"));
  if (cut.kind === "doc" && cut.doc) {
    rows.push(textRow("자료 제목", cut.doc.ko || "", (v) => { cut.doc.ko = v; }, cut, drawStage, "dko"));
    if (cut.doc.ex) rows.push(textRow("발췌", cut.doc.ex.ko || "", (v) => { cut.doc.ex.ko = v; }, cut, drawStage, "dex"));
  }
  (cut.els || []).forEach((e, k) => {
    if (TEXT_EL[e.t]) rows.push(textRow(TEXT_EL[e.t], e.text, (v) => { e.text = v; }, cut, drawStage, `e${k}`));
  });
  if (!rows.length) return null;
  return h("div", { class: "block" }, h("h4", {}, "화면 글씨"), h("div", { class: "texts" }, rows),
    h("p", { class: "hint" }, "**두 별표** 사이 글자는 강조색으로 보이고, 줄을 바꾸면 화면에서도 줄이 바뀌어요."));
}
function textRow(label, value, set, cut, drawStage, key) {
  const id = `t-${cut.id}-${key}`;
  const t = h("textarea", { id, rows: 1, oninput: (e) => { mutate(() => set(e.target.value), `${cut.id}-${key}`); S.touched.add(cut.id); drawStage(); } });
  t.value = value || "";
  return h("div", { class: "trow" }, h("label", { for: id }, label), t);
}

function mediaBlock(cut, drawStage) {
  const chips = [];
  const chip = (label, thumb, name, kind, get, set) => h("button", {
    class: "mchip", title: `${label} 바꾸기`,
    onclick: () => pick({ kind, get, set: (v) => { mutate(() => set(v)); S.touched.add(cut.id); rerenderCut(cut); } }),
  }, thumb ? h("img", { src: thumb, alt: "", loading: "lazy" }) : h("span", { class: "noimg" }), h("span", {}, h("b", {}, label), base(name) || "없음"));
  if (cut.kind === "photo" || cut.kind === "archive") chips.push(chip("배경 사진", url.bg(cut.bg), cut.bg, "bg", () => cut.bg, (v) => { cut.bg = v; }));
  if (cut.kind === "mascot") chips.push(chip("캐릭터", url.who(cut.who), cut.who, "who", () => cut.who, (v) => { cut.who = v; }));
  (cut.els || []).forEach((e) => {
    if (e.t === "img") chips.push(chip(e.inset ? "끼운 사진" : "그림", url.src(e.src), e.src, "img", () => e.src, (v) => { e.src = v; }));
    if (e.t === "vid") chips.push(chip("영상 조각", null, e.src, "vid", () => e.src, (v) => { e.src = v; }));
    if (e.t === "tile" && e.img) chips.push(chip("칸 그림", url.src(e.img), e.img, "img", () => e.img, (v) => { e.img = v; }));
  });
  if (!chips.length) return null;
  return h("div", { class: "block" }, h("h4", {}, "그림"), h("div", { class: "media" }, chips));
}

function moreBlock(cut, i, r) {
  const els = (cut.els || []).map((e, k) => {
    const num = (label, getv, setv, step = 10) => h("label", {}, label, h("input", {
      type: "number", step, value: getv() ?? "", inputmode: "decimal",
      onchange: (ev) => { const v = ev.target.value === "" ? undefined : Number(ev.target.value); mutate(() => setv(v)); S.touched.add(cut.id); rerenderCut(cut); },
    }));
    const nums = [];
    if (e.pos) {
      nums.push(num("가로", () => e.pos[0], (v) => { e.pos[0] = v ?? 0; }));
      nums.push(num("세로", () => e.pos[1], (v) => { e.pos[1] = v ?? 0; }));
    }
    if ("h" in e && e.t !== "tile") nums.push(num("높이", () => e.h, (v) => { e.h = v; }));
    if (e.t === "vid") nums.push(num("영상 몇 초부터", () => e.from, (v) => { e.from = v; }, 0.1));
    if (DEF[e.t]) nums.push(num("크기", () => e.size ?? DEF[e.t], (v) => { e.size = v; }));
    nums.push(num("나올 때(줄)", () => e.at, (v) => { e.at = v; }, 0.05));
    return h("div", { class: "elrow" },
      h("div", {}, h("div", {}, elText(e)), h("div", { class: "nums" }, nums)),
      h("button", { class: "btn small", "aria-label": `${EL[e.t] || e.t} 빼기`, onclick: () => { mutate(() => cut.els.splice(k, 1)); S.touched.add(cut.id); rerenderCut(cut); } }, "빼기"));
  });
  const kinds = h("select", { onchange: (e) => { mutate(() => { cut.kind = e.target.value; }); rerenderCut(cut); } },
    Object.entries(KIND).map(([k, t]) => h("option", { value: k, selected: cut.kind === k }, t)));
  return h("details", { class: "more" },
    h("summary", {}, "세부 조정 (자리·크기·나오는 때)"),
    h("div", { class: "grid2" },
      h("label", { class: "field" }, h("span", {}, "화면 종류"), kinds),
      h("label", { class: "field" }, h("span", {}, "시작 줄"), h("input", { type: "number", step: 0.05, value: cut.from,
        onchange: (e) => { mutate(() => { cut.from = Number(e.target.value); S.conti.cuts.sort((a, b) => lineIndex(a.from) - lineIndex(b.from) || a.from - b.from); }); renderAll(); jump(cut.id); } }))),
    h("div", {}, els),
    h("div", { class: "row-acts" },
      h("button", { class: "btn small", onclick: () => { mutate(() => { (cut.els ||= []).push({ t: "label", text: "새 글씨", pos: SIZE[S.conti.shape === "tall" ? "tall" : "wide"].map((v) => Math.round(v / 2)), color: "yellow" }); }); S.touched.add(cut.id); rerenderCut(cut); } }, "+ 글씨 넣기"),
      h("button", { class: "btn small", onclick: () => addMedia(cut, "img") }, "+ 그림 넣기"),
      h("button", { class: "btn small", onclick: () => addMedia(cut, "vid") }, "+ 영상 넣기"),
      i > 0 ? h("button", { class: "btn small", onclick: () => mergeUp(cut) }, "앞 컷과 합치기") : null));
}

// ── 화면 미리보기 ─────────────────────────────────────

function peek(cut, n, drawStage) {
  if (!S.data.stills[n] || S.peek.get(cut.id) === n) return;
  S.peek.set(cut.id, n);
  drawStage();
}

function stage(cut, r, redraw) {
  const shape = S.conti.shape === "tall" ? "tall" : "wide";
  const [W, H] = SIZE[shape];
  const last = r.lines.at(-1);
  const n = S.peek.get(cut.id) ?? last?.n;
  const st = n != null ? S.data.stills[n] : null;
  const layout = S.layout.has(cut.id) || !st;
  const box = h("div", { class: "stage", role: "img", "aria-label": `컷 화면 미리보기: ${cut.plan || describe(cut)}` });

  if (st && !layout) {
    box.append(h("img", { class: "still", src: F(st.url), alt: "", loading: "lazy" }));
    if (S.touched.has(cut.id)) box.append(h("span", { class: "tag" }, "고치기 전 화면"));
  } else {
    if ((cut.kind === "photo" || cut.kind === "archive") && cut.bg) box.append(h("img", { class: "bg", src: url.bg(cut.bg), alt: "", style: { opacity: 0.55 } }));
    if (cut.kind === "dark" || cut.kind === "black") box.style.background = "#1b2430";
    if (cut.kind === "mascot" && cut.who) {
      const side = cut.side ?? (cut.who.startsWith("bun") ? "left" : "right");
      box.append(h("img", { src: url.who(cut.who), alt: "", style: { position: "absolute", bottom: "0", [side]: "3%", height: "78%" } }));
    }
    if (cut.kind === "burst") box.append(h("div", { class: "empty", style: { fontSize: "7cqw", fontWeight: 900 } }, plain(cut.text)));
    if (cut.kind === "doc" && cut.doc) box.append(h("div", { class: "empty", style: { fontSize: "3cqw", fontWeight: 800 } }, cut.doc.ko || cut.doc.title));
    if (!(cut.els || []).length && cut.kind === "grid") box.append(h("div", { class: "empty" }, "화면 비어 있음"));
    (cut.els || []).forEach((e, k) => { const el = elBox(e, W, H, cut); if (el) box.append(el); });
    if (st) box.append(h("span", { class: "tag" }, "배치 보기: 끌어서 옮겨요"));
  }
  const dots = r.lines.length > 1 && Object.keys(S.data.stills).length
    ? h("div", { class: "dots", "aria-label": "줄마다 화면" }, r.lines.map((l) => h("button", {
      "aria-pressed": String(l.n === n), title: `${l.n}번 줄 끝 화면`, onclick: () => { S.peek.set(cut.id, l.n); redraw(); },
    }, l.n)))
    : null;
  const bar = h("div", { class: "stage-bar" },
    st ? h("button", { class: "btn", onclick: () => { S.layout.has(cut.id) ? S.layout.delete(cut.id) : S.layout.add(cut.id); redraw(); } }, layout ? "완성 화면 보기" : "배치 보기") : h("span", {}, "아직 완성 화면이 없어서 배치만 보여요."),
    dots);
  return [box, bar];
}

function elBox(e, W, H, cut) {
  if (!e.pos && e.t !== "dia") return null;
  const pos = e.pos || [W / 2, H / 2];
  const pct = (v, d) => `${(v / d) * 100}%`;
  const cq = (px) => `${(px / W) * 100}cqw`;
  const st = { left: pct(pos[0], W), top: pct(pos[1], H) };
  let el;
  if (e.t === "img" || (e.t === "tile" && e.img)) {
    const src = e.t === "img" ? e.src : e.img;
    el = h("div", { class: "el media", style: { ...st, height: pct(e.h || e.h === 0 ? e.h : 400, H) } }, h("img", { src: url.src(src), alt: "" }));
    if (e.t === "tile") el.append(h("div", { style: { fontSize: cq(e.size ?? DEF.tile), background: "#fff" } }, plain(e.text)));
  } else if (e.t === "vid") {
    const src = url.src(e.src);
    el = h("div", { class: "el media", style: { ...st, height: pct(e.h || 600, H), aspectRatio: "16 / 9", fontSize: cq(36) } },
      src ? h("video", { src: `${src}#t=${Number(e.from) || 0}`, muted: true, playsinline: true, preload: "metadata", style: { height: "100%", width: "100%", objectFit: "cover" },
        onmouseenter: (ev) => ev.target.play().catch(() => {}), onmouseleave: (ev) => ev.target.pause() }) : `영상 ${base(e.src)}`);
  } else if (e.text != null) {
    el = h("div", { class: "el", style: { ...st, fontSize: cq(e.size ?? DEF[e.t] ?? 54), maxWidth: e.t === "say" ? cq(e.w ?? 1080) : null } }, plain(e.text));
  } else {
    const label = e.t === "dia" ? `도식 ${e.name}` : EL[e.t] || e.t;
    el = h("div", { class: "el", style: { ...st, fontSize: cq(30) } }, label);
  }
  el.tabIndex = 0;
  el.title = `${elText(e)} — 끌거나 화살표 키로 옮겨요`;
  if (e.pos) drag(el, e, W, H, cut);
  return el;
}

function drag(el, e, W, H, cut) {
  let sx, sy, ox, oy, rect;
  el.addEventListener("pointerdown", (ev) => {
    rect = el.parentElement.getBoundingClientRect();
    sx = ev.clientX; sy = ev.clientY; ox = e.pos[0]; oy = e.pos[1];
    el.setPointerCapture(ev.pointerId);
    el.classList.add("sel");
    mutate(() => {}, "");
    ev.preventDefault();
  });
  el.addEventListener("pointermove", (ev) => {
    if (!rect || !el.hasPointerCapture(ev.pointerId)) return;
    e.pos[0] = Math.round(ox + ((ev.clientX - sx) * W) / rect.width);
    e.pos[1] = Math.round(oy + ((ev.clientY - sy) * H) / rect.height);
    el.style.left = `${(e.pos[0] / W) * 100}%`;
    el.style.top = `${(e.pos[1] / H) * 100}%`;
  });
  el.addEventListener("pointerup", () => {
    el.classList.remove("sel");
    S.touched.add(cut.id);
    markDirty();
  });
  el.addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 50 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    mutate(() => { e.pos[0] += d[0]; e.pos[1] += d[1]; }, `move-${cut.id}`);
    S.touched.add(cut.id);
    el.style.left = `${(e.pos[0] / W) * 100}%`;
    el.style.top = `${(e.pos[1] / H) * 100}%`;
  });
}

// ── 컷 나누기·합치기 ─────────────────────────────────

function splitAt(cut, n) {
  const i = S.conti.cuts.indexOf(cut);
  const id = `c${Date.now().toString(36)}`;
  mutate(() => {
    S.conti.cuts.splice(i + 1, 0, { id, from: n, kind: "grid", els: [], plan: "", memo: "이 줄부터 새 화면으로 나눴어요. 무엇을 보여 줄지 적어 주세요.", status: "fix" });
  });
  renderAll();
  jump(id);
}
function mergeUp(cut) {
  const i = S.conti.cuts.indexOf(cut);
  if (i <= 0) return;
  if (!confirm("이 컷 화면을 지우고 앞 컷 화면을 이어서 쓸까요? 지워도 되돌리기로 살릴 수 있어요.")) return;
  const prev = S.conti.cuts[i - 1];
  mutate(() => {
    if ((cut.memo || "").trim()) prev.memo = [prev.memo, cut.memo].filter(Boolean).join("\n");
    S.conti.cuts.splice(i, 1);
  });
  renderAll();
  jump(prev.id);
}
function jump(id) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`cut-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1300);
  });
}
function renderStatsOnly() {
  const y = scrollY;
  renderAll();
  scrollTo(0, y);
}

// ── 그림 고르기 ───────────────────────────────────────

const pubDir = () => S.data.paths.public || "영상 폴더";
const PICK = {
  bg: { title: "배경 사진 고르기", hint: () => `${pubDir()} 폴더 안에 있는 사진이에요.`, ok: (f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith("chars"), val: (f) => (/\.jpe?g$/i.test(f) ? (f.startsWith("bg/") ? f.slice(3) : f).replace(/\.jpe?g$/i, "") : f), thumb: (f) => F(pub() + enc(f)) },
  who: { title: "캐릭터 고르기", hint: () => `${pubDir()}/chars 폴더 안에 있는 캐릭터 그림이에요.`, ok: (f) => /^chars\/[^/]+\.png$/i.test(f), val: (f) => f.slice(6, -4), thumb: (f) => F(pub() + enc(f)) },
  img: { title: "그림 고르기", hint: () => `${pubDir()} 폴더 안에 있는 그림이에요. 새 그림은 그 폴더에 넣고 이 창을 다시 열어요.`, ok: (f) => /\.(jpe?g|png|webp|gif)$/i.test(f), val: (f) => f, thumb: (f) => F(pub() + enc(f)) },
  vid: { title: "영상 고르기", hint: () => `${pubDir()} 폴더 안에 있는 영상이에요. 수업·활동 영상 파일을 그 폴더에 넣으면 여기 보여요.`, ok: (f) => /\.(mp4|mov|webm)$/i.test(f), val: (f) => f, thumb: null },
  thumb: { title: "표지 그림 고르기", hint: () => "영상 폴더 안에 있는 그림이에요.", ok: (f) => /\.(jpe?g|png|webp)$/i.test(f), val: (f) => f, thumb: (f) => F(S.data.base + enc(f)) },
};
async function pick({ kind, get, set }) {
  const P = PICK[kind];
  const dlg = $("#picker");
  $("#picker-title").textContent = P.title;
  $("#picker-hint").textContent = P.hint();
  const grid = $("#picker-grid");
  grid.replaceChildren(h("p", { class: "muted" }, "파일 목록을 읽는 중…"));
  dlg.showModal();
  const dir = kind === "thumb" ? "." : S.data.paths.public;
  S.mediaCache ||= {};
  const key = `${S.cur.project}|${dir}`;
  try {
    S.mediaCache[key] ||= (await api(`/api/media?p=${encodeURIComponent(S.cur.project)}&dir=${encodeURIComponent(dir)}`)).files;
  } catch (e) {
    grid.replaceChildren(h("p", {}, `목록을 못 읽었어요: ${e.message}`));
    return;
  }
  const files = S.mediaCache[key].filter(P.ok);
  const cur = get();
  const draw = () => {
    const q = $("#picker-q").value.trim().toLowerCase();
    const shown = files.filter((f) => !q || f.toLowerCase().includes(q)).slice(0, 300);
    grid.replaceChildren(...(shown.length ? shown.map((f) => h("button", {
      "aria-current": String(P.val(f) === cur), title: f,
      onclick: () => { set(P.val(f)); dlg.close(); },
    }, P.thumb ? h("img", { src: P.thumb(f), alt: "", loading: "lazy" }) : h("video", { src: F(pub() + enc(f)), muted: true, preload: "metadata" }), h("span", {}, f)))
      : [h("p", { class: "muted" }, files.length ? "맞는 파일이 없어요." : `${P.hint()} 아직 넣은 파일이 없어요.`)]));
  };
  $("#picker-q").value = "";
  $("#picker-q").oninput = draw;
  draw();
}

// ── Claude 에게 넘기기·지난 판 ───────────────────────

function handoff() {
  const c = S.conti, R = ranges();
  const out = [];
  c.cuts.forEach((cut, i) => {
    const r = R[i];
    const ls = r.lines.length ? `줄 ${r.lines[0].n}${r.lines.length > 1 ? `~${r.lines.at(-1).n}` : ""}` : "";
    const bits = [];
    if (cut.status === "fix") bits.push("고쳐 주세요");
    if ((cut.memo || "").trim()) bits.push(`메모: ${cut.memo.trim()}`);
    if (S.touched.has(cut.id)) bits.push("화면 값 직접 고침");
    if (bits.length) out.push(`· 컷 ${i + 1} (${ls}) ${bits.join(" / ")}`);
  });
  for (const [n, e] of Object.entries(c.lineEdits || {})) out.push(`· ${n}번 줄 대사: "${e.was}" → "${e.display}" ${recorded() ? "(다시 녹음)" : "(녹음 전)"}`);
  const where = B.kind === "folder" ? `「${B.single ? B.name : `${B.name}/${S.cur.project}`}」 폴더의 conti/${S.cur.id}.json 파일을` : `「${S.cur.project}」 ${S.cur.id} 콘티를`;
  const say = B.kind === "server"
    ? `콘티 작업실에서 「${S.cur.project}」 ${S.cur.id} 콘티를 고쳤어. 반영해 줘.`
    : `콘티 작업실에서 ${where} 고쳤어. 컷의 memo·status("fix")와 lineEdits(고친 대사)를 반영해서 영상을 다시 만들어 줘. 반영한 메모는 비우고 status 는 빈칸으로 돌려 줘. 콘티 형식과 만드는 법: ${GUIDE}`;
  const body = $("#info-body");
  $("#info-title").textContent = "AI에게 넘기기";
  body.replaceChildren(
    h("p", {}, B.kind === "demo"
      ? "예시라서 고친 내용은 이 브라우저에만 남아요. 내 폴더로 작업하면 쓰던 AI(Claude·Codex·Gemini 등)에게 아래 글을 그대로 보내면 돼요."
      : "고친 내용은 콘티 파일에 저장돼 있어요. 영상 폴더를 다루는 AI(Claude Code·Codex·Gemini CLI 등)에게 아래 글을 보내면 돼요."),
    h("div", { class: "row-acts" }, h("code", {}, say),
      h("button", { class: "btn small primary", onclick: async (e) => { e.target.textContent = (await copyText(say)) ? "복사했어요" : "복사가 막혔어요. 글을 직접 복사해 주세요"; } }, "복사")),
    h("div", { class: "handoff block" }, h("h4", {}, out.length ? `넘길 내용 ${out.length}가지` : "아직 고친 내용이 없어요"), out.length ? h("pre", {}, out.join("\n")) : null),
  );
  $("#info").showModal();
  if (S.dirty) save();
}

// ── 그림·영상 넣기 ────────────────────────────────────

function addMedia(cut, kind) {
  const shape = S.conti.shape === "tall" ? "tall" : "wide";
  const [W, H] = SIZE[shape];
  pick({ kind, get: () => "", set: (v) => {
    mutate(() => {
      const el = kind === "vid" ? { t: "vid", src: v, pos: [W / 2, H / 2], h: Math.round(H * 0.62), from: 0 } : { t: "img", src: v, pos: [W / 2, H / 2], h: Math.round(H * 0.6) };
      (cut.els ||= []).push(el);
    });
    S.touched.add(cut.id);
    rerenderCut(cut);
  } });
}

// ── TTS 작업실과 잇기 ─────────────────────────────────

function ttsBar() {
  if (B.kind === "server") return null;
  const timed = recorded();
  return h("div", { class: "tts", role: "group", "aria-label": "TTS 작업실과 잇기" },
    h("span", { class: "tts-label" }, timed ? "나레이션 시각 맞춤" : "나레이션 녹음 전"),
    h("button", { class: "btn small", onclick: exportLines }, "대사 내보내기"),
    B.kind === "folder" ? h("button", { class: "btn small", onclick: importTts }, "TTS 결과 불러오기") : null,
    h("a", { class: "dict", href: "https://github.com/N-lifescience/tts-studio", target: "_blank", rel: "noopener" }, "TTS 작업실이란?"));
}

function exportLines() {
  const text = S.data.lines.map((l) => plain(lineText(l))).join("\n");
  const body = $("#info-body");
  $("#info-title").textContent = "대사 내보내기";
  const file = () => {
    const a = h("a", { href: URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" })), download: `${S.cur.id}-대사.txt` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  body.replaceChildren(
    h("p", {}, `대사 ${S.data.lines.length}줄을 한 줄에 하나씩 모았어요. TTS 작업실 「② 대본」에 붙여 넣거나 파일로 불러오면 내 목소리로 녹음돼요.`),
    h("p", { class: "hint" }, "녹음이 끝나면 TTS 작업실 「④ 내보내기」 폴더를 「TTS 결과 불러오기」로 고르세요. 줄마다 실제 길이로 컷 시각이 맞춰져요."),
    h("pre", { class: "lines-out" }, text),
    h("div", { class: "row-acts" },
      h("button", { class: "btn small primary", onclick: async (e) => { e.target.textContent = (await copyText(text)) ? "복사했어요" : "복사가 막혔어요"; } }, "복사"),
      h("button", { class: "btn small", onclick: file }, "txt 파일로 받기")));
  $("#info").showModal();
}

async function importTts() {
  let dir;
  try { dir = await showDirectoryPicker({ id: "tts-export", mode: "read" }); } catch { return; }
  if (S.dirty) await save();
  try {
    const { data, mismatch, count } = await B.importTts(S.cur.project, S.cur.id, dir);
    applyData(data);
    renderAll();
    banner(mismatch
      ? `TTS 줄 ${mismatch.tts}개와 대본 줄 ${mismatch.script}개가 달라서 앞에서부터 ${count}줄만 맞췄어요. 대본을 TTS 작업실과 같게 맞춰 주세요.`
      : `나레이션 ${count}줄의 실제 길이로 컷 시각을 맞췄어요. 컷마다 「듣기」로 들어 볼 수 있어요.`);
  } catch (e) {
    banner(`TTS 결과를 불러오지 못했어요: ${e.message}`);
  }
}

let player = null;
function listen(r, btn) {
  if (player && !player.paused) { player.pause(); document.querySelectorAll(".cut-head .playing").forEach((b) => { b.classList.remove("playing"); b.textContent = "듣기"; }); if (player._btn === btn) return; }
  player ||= new Audio();
  const src = F(S.data.audio);
  if (player.src !== src) player.src = src;
  player._btn = btn;
  player.currentTime = r.start;
  btn.classList.add("playing"); btn.textContent = "멈춤";
  const stop = () => { if (player.currentTime >= r.end) { player.pause(); btn.classList.remove("playing"); btn.textContent = "듣기"; player.removeEventListener("timeupdate", stop); } };
  player.addEventListener("timeupdate", stop);
  player.play().catch(() => { btn.textContent = "듣기"; });
}

// ── 새 콘티(대본 붙여 넣기) ───────────────────────────

async function newConti() {
  if (B.kind === "server") return;
  const projects = [...new Set(S.videos.map((v) => v.project))];
  const project = B.kind === "demo" ? "내 연습" : S.cur?.project || projects[0] || B.name;
  const body = $("#info-body");
  $("#info-title").textContent = "새 콘티 만들기";
  const title = h("input", { id: "nc-title", placeholder: "예) 효모 발효 실험 활동 영상" });
  const text = h("textarea", { id: "nc-text", rows: 9, placeholder: "한 줄에 한 문장씩 붙여 넣어요.\n예)\n오늘은 효모가 설탕을 먹으면 무엇이 나오는지 알아볼 거예요.\n풍선이 점점 부풀어 올라요.\n학생: 풍선 속에는 무엇이 들어 있을까요?" });
  const shape = h("select", { id: "nc-shape" }, h("option", { value: "wide" }, "가로 16:9 (수업·발표 영상)"), h("option", { value: "tall" }, "세로 9:16 (쇼츠·릴스)"));
  const msg = h("p", { class: "hint", role: "status" });
  body.replaceChildren(
    h("p", {}, "대본을 붙여 넣으면 줄마다 컷이 하나씩 생겨요. 컷마다 그림·영상·글씨를 넣고 메모를 남긴 뒤 AI에게 넘기면 돼요."),
    h("label", { class: "field", for: "nc-title" }, h("span", {}, "제목"), title),
    h("label", { class: "field", for: "nc-shape" }, h("span", {}, "화면"), shape),
    h("label", { class: "field", for: "nc-text" }, h("span", {}, "대본"), text),
    h("p", { class: "hint" }, "「학생:」으로 시작하는 줄은 질문하는 목소리로 표시돼요. 그림·영상은 영상 폴더의 media 폴더에 넣으면 고를 수 있어요."),
    msg,
    h("div", { class: "row-acts" },
      h("button", { class: "btn primary", onclick: async () => {
        try {
          const r = await api(`/api/create?p=${encodeURIComponent(project)}`, { title: title.value.trim(), shape: shape.value, text: text.value });
          $("#info").close();
          await loadVideos();
          await openVideo({ project: r.project, id: r.id });
        } catch (e) { msg.textContent = e.message; }
      } }, "콘티 만들기"),
      h("button", { class: "btn", "data-close": true }, "그만두기")));
  $("#info").showModal();
  title.focus();
}

// ── 시작 화면 ─────────────────────────────────────────

function applyData(d) {
  S.data = d; S.conti = d.conti; S.rev = d.rev;
  S.idx = new Map(d.lines.map((l, i) => [l.n, i]));
}

function startScreen(note = "") {
  document.body.classList.add("start-mode");
  const ok = canPickFolder();
  const main = $("#main");
  main.replaceChildren(h("section", { class: "start" },
    h("h1", {}, "콘티 작업실"),
    h("p", { class: "lead" }, "수업 영상과 학생 활동 영상을 컷마다 눈으로 보며 고치고, AI에게 넘겨 완성해요."),
    note ? h("p", { class: "warnbox", role: "status" }, note) : null,
    h("div", { class: "start-acts" },
      h("button", { class: "btn primary big", disabled: !ok, onclick: openFolder }, "내 영상 폴더 열기"),
      h("button", { class: "btn big", onclick: openDemo }, "예시로 둘러보기")),
    ok ? h("p", { class: "hint", id: "recent" }) : h("p", { class: "hint" }, "폴더 열기는 PC의 크롬·엣지·웨일에서 돼요. 이 브라우저에서는 예시만 볼 수 있어요."),
    h("ol", { class: "steps" },
      h("li", {}, h("b", {}, "대본"), " 대본을 붙여 넣으면 줄마다 컷이 생겨요. AI가 만든 콘티 파일을 열어도 돼요."),
      h("li", {}, h("b", {}, "콘티 확인"), " 컷마다 그림·영상·화면 글씨를 보고 고치고, 고칠 점을 메모로 남겨요."),
      h("li", {}, h("b", {}, "나레이션 녹음"), " 대사를 TTS 작업실로 보내 내 목소리로 녹음하고, 그 결과로 컷 시각을 맞춰요."),
      h("li", {}, h("b", {}, "영상 만들기"), " 「AI에게 넘기기」의 글을 쓰던 AI에게 보내면 콘티대로 영상을 만들어요.")),
    h("p", { class: "privacy" }, "파일은 선생님 컴퓨터 밖으로 나가지 않아요. 이 페이지는 아무것도 서버로 보내지 않아요. ",
      h("a", { href: "privacy.html" }, "개인정보 안내"), " · ", h("a", { href: GUIDE_PAGE, target: "_blank", rel: "noopener" }, "AI용 안내(AI-GUIDE)"))));
  if (ok) recentFolder().then((hd) => {
    if (!hd || !$("#recent")) return;
    $("#recent").replaceChildren("지난번 폴더: ", h("button", { class: "btn small", onclick: () => openFolder(hd) }, `「${hd.name}」 다시 열기`),
      " ", h("button", { class: "btn small ghost", onclick: async () => { await forgetFolder(); $("#recent").replaceChildren(); } }, "잊기"));
  });
}

async function openFolder(hd) {
  try {
    if (!(hd && hd.kind === "directory")) hd = await showDirectoryPicker({ id: "conti-folder", mode: "readwrite" });
    if ((await hd.queryPermission({ mode: "readwrite" })) !== "granted" && (await hd.requestPermission({ mode: "readwrite" })) !== "granted") {
      return startScreen("폴더를 읽고 쓰도록 허락해야 열 수 있어요.");
    }
    B = await FolderBackend.open(hd);
    await rememberFolder(hd);
    await begin();
  } catch (e) {
    if (e.name === "AbortError") return;
    startScreen(`폴더를 열지 못했어요: ${e.message}`);
  }
}

async function openDemo() {
  try { B = await DemoBackend.open(); await begin(); } catch (e) { startScreen(e.message); }
}

async function begin() {
  document.body.classList.remove("start-mode");
  document.body.dataset.backend = B.kind;
  $("#where").textContent = B.kind === "folder" ? `폴더: ${B.name}` : B.kind === "demo" ? "예시 (이 브라우저에만 저장)" : "";
  $("#new").hidden = B.kind === "server";
  $("#home").hidden = B.kind === "server";
  const vids = await loadVideos();
  const last = store.get(`conti-last-${B.kind}`);
  const v = vids.find((x) => last && x.project === last.project && x.id === last.id && x.exists) || vids.find((x) => x.exists);
  if (v) await openVideo(v);
  else {
    $("#main").replaceChildren(h("section", { class: "start" },
      h("h2", {}, B.kind === "folder" ? `「${B.name}」에 콘티가 아직 없어요` : "콘티가 없어요"),
      h("p", {}, "대본을 붙여 넣어 새 콘티를 만들거나, AI에게 이 폴더에 콘티를 만들어 달라고 해요."),
      h("div", { class: "start-acts" }, h("button", { class: "btn primary big", onclick: newConti }, "새 콘티 만들기"))));
  }
}
async function showHistory() {
  const { items } = await api(`/api/history?${qs()}`);
  $("#info-title").textContent = "지난 판";
  const fmt = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`;
  $("#info-body").replaceChildren(
    h("p", {}, "저장할 때마다 바로 앞 판을 최근 60개까지 남겨요. 되돌려도 지금 판은 그대로 남아요."),
    items.length ? h("div", { class: "hist" }, h("ul", {}, items.map((s) => h("li", {}, h("span", {}, fmt(s)),
      h("button", { class: "btn small", onclick: async () => { if (!confirm(`${fmt(s)} 판으로 되돌릴까요?`)) return; await save(); await api(`/api/restore?${qs()}`, { stamp: s }); $("#info").close(); await openVideo(S.cur, true); } }, "이 판으로"))))) : h("p", { class: "muted" }, "아직 남은 판이 없어요."),
  );
  $("#info").showModal();
}

// ── 시작 ─────────────────────────────────────────────

document.addEventListener("click", (e) => { const d = e.target.closest("[data-close]"); if (d) d.closest("dialog").close(); });
$("#pick").addEventListener("change", (e) => { const v = JSON.parse(e.target.value); if (v.id) openVideo(v); });
$("#undo").addEventListener("click", undo);
$("#hist").addEventListener("click", () => S.cur && showHistory());
$("#handoff").addEventListener("click", () => S.cur && handoff());
$("#new").addEventListener("click", newConti);
$("#home").addEventListener("click", async () => {
  if (S.dirty) await save();
  if (B?.kind === "demo" && confirm("예시에서 고친 내용을 지우고 처음 상태로 돌릴까요? 「취소」를 누르면 지우지 않고 첫 화면으로 가요.")) B.reset();
  S.cur = null; S.data = null; B = null;
  $("#pick").replaceChildren();
  startScreen();
});
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const typing = e.target.closest("input, textarea, select");
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); clearTimeout(S.timer); save(); }
  else if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
});
addEventListener("beforeunload", (e) => { if (S.dirty) { save(); e.preventDefault(); } });
addEventListener("focus", watch);
document.addEventListener("visibilitychange", watch);
setInterval(watch, 8000);

(async () => {
  const theme = new URLSearchParams(location.search).get("theme"); // ?theme=light|dark 로 밝기 고정
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  try {
    B = await detectServer();
    if (B) return await begin();
    if (new URLSearchParams(location.search).has("demo")) return await openDemo();
    // 만든 사람 시험용: 내 컴퓨터(127.0.0.1)에서 ?opfs 로 열면 브라우저 안 저장 공간을 폴더처럼 쓴다(고르기 창 없이 폴더 모드 시험)
    if (location.hostname === "127.0.0.1" && new URLSearchParams(location.search).has("opfs")) {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("시험 폴더", { create: true });
      B = await FolderBackend.open(root);
      return await begin();
    }
    startScreen();
  } catch (e) {
    $("#main").replaceChildren(h("p", {}, `불러오지 못했어요: ${e.message}`));
  }
})();
