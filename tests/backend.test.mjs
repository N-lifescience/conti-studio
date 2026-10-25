// node --test tests/  — 브라우저 없이 저장 규칙을 시험한다. 폴더는 메모리 속 가짜(File System Access API 흉내)다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiError, DemoBackend, FolderBackend, linesOf, parseTtsLine, scriptFromText, splitLikeTts, timelineFromTts, wavSeconds,
} from "../backend.js";

// ── 가짜 폴더 ──────────────────────────────────────────
let clock = 1_000;
class FakeFile {
  constructor(name) { this.kind = "file"; this.name = name; this.data = new Uint8Array(); this.mtime = clock++; }
  async getFile() { return new File([this.data], this.name, { lastModified: this.mtime }); }
  async createWritable() {
    const chunks = [];
    return {
      write: async (x) => { chunks.push(typeof x === "string" ? new TextEncoder().encode(x) : new Uint8Array(await new Blob([x]).arrayBuffer())); },
      close: async () => { const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } this.data = all; this.mtime = clock++; },
    };
  }
}
class FakeDir {
  constructor(name) { this.kind = "directory"; this.name = name; this.kids = new Map(); }
  async *entries() { for (const e of this.kids) yield e; }
  async getDirectoryHandle(n, { create } = {}) {
    let d = this.kids.get(n);
    if (!d) { if (!create) throw Object.assign(new Error("없음"), { name: "NotFoundError" }); d = new FakeDir(n); this.kids.set(n, d); }
    if (d.kind !== "directory") throw Object.assign(new Error("파일임"), { name: "TypeMismatchError" });
    return d;
  }
  async getFileHandle(n, { create } = {}) {
    let f = this.kids.get(n);
    if (!f) { if (!create) throw Object.assign(new Error("없음"), { name: "NotFoundError" }); f = new FakeFile(n); this.kids.set(n, f); }
    return f;
  }
  async removeEntry(n) { this.kids.delete(n); }
}
async function put(dir, rel, content) {
  const parts = rel.split("/");
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
  await w.write(content);
  await w.close();
}
async function text(dir, rel) {
  const parts = rel.split("/");
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return (await (await d.getFileHandle(parts.at(-1))).getFile()).text();
}
function wav(seconds, rate = 48000) {
  const bytes = Math.round(seconds * rate * 2);
  const b = new ArrayBuffer(44 + bytes), v = new DataView(b);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + bytes, true); s(8, "WAVE");
  s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, bytes, true);
  return new Uint8Array(b);
}

// ── 계산 ───────────────────────────────────────────────

test("붙여 넣은 대본: 빈 줄은 버리고 '학생:' 줄은 질문", () => {
  const s = scriptFromText("첫 문장이에요.\n\n  학생: 왜 그럴까요?  \n마지막.");
  assert.deepEqual(s.map((l) => [l.n, l.role, l.display]), [[1, "narrator", "첫 문장이에요."], [2, "viewer", "왜 그럴까요?"], [3, "narrator", "마지막."]]);
});

test("TTS 줄 조각 이름에서 순서와 시작 시각", () => {
  assert.deepEqual(parseTtsLine("03_00m08.1s_몸을빠르게.wav"), { k: 3, start: 8.1 });
  assert.deepEqual(parseTtsLine("12_01m02.5s_x.wav"), { k: 12, start: 62.5 });
  assert.equal(parseTtsLine("narration.wav"), null);
});

test("WAV 머리글에서 길이", () => {
  assert.equal(wavSeconds(wav(2.5).buffer), 2.5);
  assert.equal(wavSeconds(new ArrayBuffer(8)), null);
});

test("TTS 시각을 대본 줄에 순서대로 맞추고, 줄 수가 다르면 알린다", () => {
  const script = [{ n: 1 }, { n: 2 }, { n: 5 }];
  const t = timelineFromTts([{ k: 2, start: 2.1, seconds: 1.5, name: "b" }, { k: 1, start: 0, seconds: 2, name: "a" }], script);
  assert.deepEqual(t.lines, [{ n: 1, start: 0, end: 2, file: "a" }, { n: 2, start: 2.1, end: 3.6, file: "b" }]);
  assert.deepEqual(t.mismatch, { tts: 2, script: 3 });
});

test("두 문장짜리 줄은 TTS 조각 두 개를 묶는다(textsplit.py 와 같은 규칙)", () => {
  assert.deepEqual(splitLikeTts("풍선이 부풀었어요. 왜 그럴까요? **이산화 탄소**"), ["풍선이 부풀었어요.", "왜 그럴까요?", "이산화 탄소"]);
  assert.equal(splitLikeTts("기다려요… 조금만").length, 1);
  const long = `${"가".repeat(70)}, ${"나".repeat(70)}`;
  assert.equal(splitLikeTts(long).length, 2);
  const script = [{ n: 1, display: "하나예요. 둘이에요." }, { n: 2, display: "셋." }];
  const parts = [{ k: 1, start: 0, seconds: 1, name: "01" }, { k: 2, start: 1.2, seconds: 1, name: "02" }, { k: 3, start: 2.5, seconds: 0.8, name: "03" }];
  const t = timelineFromTts(parts, script);
  assert.deepEqual(t.lines.map((l) => [l.n, l.start, l.end, l.file]), [[1, 0, 2.2, "01|02"], [2, 2.5, 3.3, "03"]]);
  assert.equal(t.mismatch, null);
});

test("녹음 전에는 글자 수로 어림하고, 타임라인이 있으면 그 시각", () => {
  const script = [{ n: 1, display: "가".repeat(13) }, { n: 2, display: "나" }];
  const est = linesOf(script, {}, 6.5);
  assert.equal(est.lines[0].end, 2);
  assert.equal(est.lines[1].start, 2);
  assert.equal(est.lines[0].timed, false);
  const real = linesOf(script, { lines: [{ n: 1, start: 0, end: 3 }] }, 6.5);
  assert.equal(real.lines[0].timed, true);
  assert.equal(real.lines[1].start, 3);
});

// ── 폴더 ───────────────────────────────────────────────

test("빈 폴더: 그 폴더가 영상 폴더가 되고, 대본으로 콘티를 만든다", async () => {
  const root = new FakeDir("효모 실험");
  const b = await FolderBackend.open(root);
  assert.equal(b.single, true);
  const r = await b.call("/api/create?p=" + encodeURIComponent("효모 실험"), { title: "효모", shape: "wide", text: "하나\n둘\n셋" });
  assert.deepEqual(r, { project: "효모 실험", id: "V1" });
  const conti = JSON.parse(await text(root, "conti/V1.json"));
  assert.equal(conti.cuts.length, 3);
  assert.equal(conti.paths.public, "media");
  const { videos } = await b.call("/api/videos");
  assert.equal(videos.length, 1);
  assert.equal(videos[0].cuts, 3);
  const again = await b.call("/api/create?p=" + encodeURIComponent("효모 실험"), { text: "넷" });
  assert.equal(again.id, "V2");
});

test("여러 영상 폴더를 담은 폴더: 콘티가 있는 하위 폴더만 목록에", async () => {
  const root = new FakeDir("수업 영상");
  await put(root, "1반 발표/conti/A.json", JSON.stringify({ id: "A", cuts: [] }));
  await put(root, "2반 발표/script/B.json", JSON.stringify([{ n: 1, display: "안녕" }]));
  await put(root, "자료/그림.png", "x");
  const b = await FolderBackend.open(root);
  assert.deepEqual(await b.projects(), ["1반 발표", "2반 발표"]);
  const { videos } = await b.call("/api/videos");
  assert.deepEqual(videos.map((v) => [v.project, v.id, v.exists]), [["1반 발표", "A", true], ["2반 발표", "B", false]]);
  const d = await b.call(`/api/new?p=${encodeURIComponent("2반 발표")}&v=B`, {});
  assert.equal(d.conti.cuts.length, 1);
});

test("저장: 그사이 파일이 바뀌면 409, 덮어쓰기 전 판은 지난 판에 남고 되돌릴 수 있다", async () => {
  const root = new FakeDir("p");
  const b = await FolderBackend.open(root);
  await b.call("/api/create?p=p", { text: "하나\n둘" });
  const q = "?p=p&v=V1";
  const d = await b.call("/api/conti" + q);
  d.conti.cuts[0].memo = "사진 크게";
  const s1 = await b.call("/api/conti" + q, { conti: d.conti, rev: d.rev });
  assert.ok(s1.ok);
  await assert.rejects(b.call("/api/conti" + q, { conti: d.conti, rev: d.rev }), (e) => e instanceof ApiError && e.status === 409);
  const { items } = await b.call("/api/history" + q);
  assert.equal(items.length, 1);
  const back = await b.call("/api/restore" + q, { stamp: items[0] });
  assert.equal(back.conti.cuts[0].memo, "");
});

test("폴더 밖 경로와 이상한 이름은 막는다", async () => {
  const root = new FakeDir("p");
  const b = await FolderBackend.open(root);
  await assert.rejects(b.call("/api/conti?p=p&v=../x"), (e) => e.status === 400);
  await assert.rejects(b.readText("p", "../secret.txt"), (e) => e.status === 400);
  await assert.rejects(b.call("/api/videos?x=1").then(() => b.call("/api/conti?p=없는폴더&v=A")), (e) => e.status === 400);
});

test("TTS 결과 불러오기: 줄 시각을 쓰고 나레이션을 영상 폴더로 복사한다", async () => {
  const root = new FakeDir("p");
  const b = await FolderBackend.open(root);
  await b.call("/api/create?p=p", { text: "하나\n둘" });
  const tts = new FakeDir("export");
  await put(tts, "narration.wav", wav(4));
  await put(tts, "lines/01_00m00.0s_하나.wav", wav(1.5));
  await put(tts, "lines/02_00m01.8s_둘.wav", wav(2));
  globalThis.URL.createObjectURL ??= () => "blob:x";
  const r = await b.importTts("p", "V1", tts);
  assert.equal(r.count, 2);
  assert.equal(r.mismatch, null);
  const tl = JSON.parse(await text(root, "conti/V1-timeline.json"));
  assert.deepEqual(tl.lines.map((l) => [l.n, l.start, l.end]), [[1, 0, 1.5], [2, 1.8, 3.8]]);
  assert.equal(tl.audio, "audio/tts/V1-narration.wav");
  const copied = await (await (await (await root.getDirectoryHandle("audio")).getDirectoryHandle("tts")).getFileHandle("V1-narration.wav")).getFile();
  assert.equal(copied.size, wav(4).length);
  assert.equal(r.data.lines[1].timed, true);
});

// ── 예시 ───────────────────────────────────────────────

test("예시: 고친 내용은 브라우저 저장소에만, 처음으로 돌릴 수 있다", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const files = {
    "ex/conti/S1.json": JSON.stringify({ id: "S1", paths: { script: "script/{id}.json", timeline: "", public: "media", stills: "" }, cuts: [{ id: "c1", from: 1 }] }),
    "ex/script/S1.json": JSON.stringify([{ n: 1, display: "안녕" }]),
  };
  globalThis.fetch = async (u) => {
    const k = decodeURIComponent(String(u).replace(/^demo\//, ""));
    return k in files ? new Response(files[k]) : new Response("", { status: 404 });
  };
  const b = new DemoBackend({ projects: { ex: { files: ["conti/S1.json", "script/S1.json"] } } });
  const d = await b.call("/api/conti?p=ex&v=S1");
  d.conti.cuts[0].memo = "크게";
  await b.call("/api/conti?p=ex&v=S1", { conti: d.conti, rev: d.rev });
  assert.equal((await b.call("/api/conti?p=ex&v=S1")).conti.cuts[0].memo, "크게");
  const mine = await b.call("/api/create?p=" + encodeURIComponent("내 연습"), { text: "하나" });
  assert.equal(mine.project, "내 연습");
  assert.ok((await b.projects()).includes("내 연습"));
  b.reset();
  assert.equal((await b.call("/api/conti?p=ex&v=S1")).conti.cuts[0].memo, undefined);
});
