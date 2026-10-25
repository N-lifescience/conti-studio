// 영상 용어 사전 화면. 카드마다 작은 16:9 화면에서 그 용어의 움직임을 되풀이해 보여 준다.
// 예시는 화면에 보일 때만 만들고 돌린다(IntersectionObserver). 모든 움직임은 Web Animations API.
import { CATS, SOURCES, TIERS, TERMS, FEELS } from "./terms-data.js";

const D = 3200; // 예시 한 바퀴 기본 길이(ms)
const NS = "http://www.w3.org/2000/svg";
const EO = "cubic-bezier(.16,1,.3,1)"; // 강한 이즈 아웃
const EI = "cubic-bezier(.7,0,.84,0)"; // 이즈 인
const EIO = "cubic-bezier(.65,0,.35,1)"; // 이즈 인 아웃
const OS = "cubic-bezier(.34,1.7,.64,1)"; // 오버슈트

// ── 예시를 만드는 도구 ─────────────────────────────

let BAG = null; // 지금 만드는 예시의 애니메이션과 시계

function A(n, frames, o = {}) {
  const a = n.animate(frames, { duration: o.d ?? D, iterations: Infinity, easing: o.e ?? "linear", direction: o.dir ?? "normal", fill: "both" });
  a.pause();
  BAG.anims.push(a);
  return a;
}
// K([offset, {속성}, 다음 칸까지의 이징], …)
const K = (...rows) => rows.map(([offset, p, easing]) => (easing ? { offset, ...p, easing } : { offset, ...p }));
// 숫자만 바꿔 쓰는 짧은 키프레임: F("opacity", [[0, 0], [.2, 1, EO], …])
const F = (prop, rows, fmt = (v) => v) => rows.map(([offset, v, easing]) => (easing ? { offset, [prop]: fmt(v), easing } : { offset, [prop]: fmt(v) }));
const op = (rows) => F("opacity", rows);
const tf = (rows) => F("transform", rows);

function o(p, cls = "", css = "", text) {
  const n = document.createElement("div");
  n.className = "o" + (cls ? " " + cls : "");
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  p.append(n);
  return n;
}
function div(p, cls = "", text, tag = "div") {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  p.append(n);
  return n;
}
const lab = (p, text, css) => o(p, "lab", css, text);
const tx = (p, text, css) => o(p, "tx", css, text);

function svg(p, css = "") {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 160 90");
  s.setAttribute("class", "o");
  s.style.cssText = "left:0;top:0;width:100%;height:100%;overflow:visible;" + css;
  p.append(s);
  return s;
}
function sv(p, tag, at = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in at) n.setAttribute(k, at[k]);
  p.append(n);
  return n;
}

// 시계: 예시가 도는 동안 매 프레임 fn(진행 0~1)을 부른다(숫자 글씨처럼 애니메이션으로 못 하는 것).
function tick(p, fn, d = D) {
  const clock = A(o(p, "", "width:0;height:0"), [{ opacity: 0 }, { opacity: 0 }], { d });
  BAG.ticks.push({ clock, d, fn });
}

function rnd(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 흔들림 키프레임: n번 무작위로 옮겼다가 처음 자리로
function jitter(seed, n, amp, rotAmp = 0, scale = 1, from = 0, to = 1) {
  const r = rnd(seed);
  const rows = [[0, `translate(0cqw,0cqw) rotate(0deg) scale(${scale})`]];
  if (from > 0) rows.push([from, `translate(0cqw,0cqw) rotate(0deg) scale(${scale})`]);
  for (let i = 1; i < n; i++) {
    const t = from + ((to - from) * i) / n;
    rows.push([t, `translate(${((r() * 2 - 1) * amp).toFixed(2)}cqw,${((r() * 2 - 1) * amp * 0.7).toFixed(2)}cqw) rotate(${((r() * 2 - 1) * rotAmp).toFixed(2)}deg) scale(${scale})`, "ease-in-out"]);
  }
  rows.push([to, `translate(0cqw,0cqw) rotate(0deg) scale(${scale})`]);
  if (to < 1) rows.push([1, `translate(0cqw,0cqw) rotate(0deg) scale(${scale})`]);
  return tf(rows);
}

// 동글이 캐릭터
function sub(p, x, y, w, c = "#f5c84c") {
  const n = o(p, "sub", `left:${x}%;top:${y}%;width:${w}cqw;--c:${c}`);
  const ears = [o(n, "ear l"), o(n, "ear r")];
  const bd = o(n, "bd");
  const eyes = [o(n, "eye l"), o(n, "eye r")];
  o(n, "blush l");
  o(n, "blush r");
  return { n, ears, eyes, bd };
}
// 사람 모양. cx = 가운데(cqw), foot = 발 높이(cqw), H = 키(cqw)
function fig(p, cx, foot, H) {
  const n = o(p, "fig", `left:${cx - H * 0.22}cqw;top:${foot - H}cqw;width:${H * 0.44}cqw;height:${H}cqw`);
  o(n, "leg l"); o(n, "leg r"); o(n, "arm l"); o(n, "arm r"); o(n, "torso");
  const head = o(n, "head");
  o(head, "fe l"); o(head, "fe r");
  return n;
}
// 하늘, 먼 산, 나무, 땅, 캐릭터, 앞 풀. 층마다 화면 크기 틀(lw)에 담아 따로 움직인다.
function world(p, { withSub = true } = {}) {
  const cam = o(p, "cam");
  const W = { cam };
  W.sky = o(cam, "lw");
  const sky = o(W.sky, "w-sky");
  o(sky, "sun", "left:58%;top:34%");
  o(sky, "cloud", "left:36%;top:30%");
  o(sky, "cloud", "left:47%;top:38%;scale:.7");
  o(sky, "cloud", "left:70%;top:31%;scale:.8");
  W.far = o(cam, "lw"); o(W.far, "w-far");
  W.mid = o(cam, "lw"); o(W.mid, "w-mid");
  W.ground = o(cam, "lw"); o(W.ground, "w-ground");
  W.sl = o(cam, "lw");
  if (withSub) W.subj = sub(W.sl, 50, 66, 22);
  W.near = o(cam, "lw"); o(W.near, "w-near");
  W.layers = [W.sky, W.far, W.mid, W.ground, W.sl, W.near];
  return W;
}
function ab(p) {
  return { a: o(p, "pa"), b: o(p, "pb") };
}
// 안 보이는 동안 한순간에 바꾸기
const step = (rows) => {
  const out = [];
  rows.forEach(([t, v], i) => {
    if (i > 0) out.push([Math.max(0, t - 0.001), rows[i - 1][1]]);
    out.push([t, v]);
  });
  if (out[0][0] !== 0) out.unshift([0, rows[0][1]]);
  if (out[out.length - 1][0] !== 1) out.push([1, out[out.length - 1][1]]);
  return out;
};
const show = (rows) => op(step(rows)); // [[0,1],[.5,0]] → .5에서 툭 사라짐

const DEMOS = {};
const def = (id, fn) => (DEMOS[id] = fn);

// ── 움직임의 결 ───────────────────────────────────

def("easing", (s) => {
  [["리니어", "linear"], ["이즈 인", "cubic-bezier(.55,0,1,.45)"], ["이즈 아웃", "cubic-bezier(0,.55,.45,1)"], ["이즈 인 아웃", EIO]].forEach(([name, e], i) => {
    const y = 16 + i * 22.5;
    o(s, "track", `left:36%;right:6%;top:${y}%`);
    lab(s, name, `left:3%;top:${y}%;translate:0 -50%`);
    A(o(s, "ball", `left:36%;top:${y}%`), tf([[0, "translateX(0cqw)", e], [0.6, "translateX(52cqw)"], [1, "translateX(52cqw)"]]));
  });
});

def("overshoot", (s) => {
  o(s, "vline", "left:72%;top:8%;bottom:8%");
  lab(s, "목표", "left:72%;top:3%;translate:-50% 0;font-size:clamp(10px,2.6cqw,13px)");
  [["오버슈트 없음", EO, 33], ["오버슈트", OS, 72]].forEach(([name, e, y]) => {
    lab(s, name, `left:4%;top:${y - 17}%`);
    const c = o(s, "chipbox", `left:20%;top:${y}%`);
    A(c, K([0, { transform: "translateX(0cqw)", opacity: 1 }, e], [0.45, { transform: "translateX(52cqw)", opacity: 1 }], [0.88, { transform: "translateX(52cqw)", opacity: 1 }], [0.95, { transform: "translateX(52cqw)", opacity: 0 }], [1, { transform: "translateX(0cqw)", opacity: 0 }]));
  });
});

def("stagger", (s) => {
  const colors = ["#ffd84d", "#ff9f43", "#ff6b6b", "#5fb8ff", "#7ee08a"];
  colors.forEach((c, i) => {
    const st = 0.08 + i * 0.07;
    A(o(s, "dot", `left:${18 + i * 16}%;top:46%;background:${c}`), tf([[0, "scale(0)"], [st, "scale(0)", OS], [st + 0.14, "scale(1)"], [0.82, "scale(1)", EI], [0.92, "scale(0)"], [1, "scale(0)"]]));
  });
  lab(s, "0.1초 간격으로 차례로", "left:50%;top:80%;translate:-50% 0");
});

def("bounce", (s) => {
  o(s, "ground-line", "top:84%");
  const sh = o(s, "shadow", "left:50%;top:84%");
  const b = o(s, "ball big", "left:50%;top:84%;translate:-50% -100%;background:#ff9f43");
  const ys = [[0, -36, EI], [0.2, 0, EO], [0.34, -18, EI], [0.45, 0, EO], [0.53, -8, EI], [0.59, 0, EO], [0.63, -2.5, EI], [0.66, 0], [0.88, 0], [0.94, -36], [1, -36]];
  A(b, K(...ys.map(([t, y, e]) => [t, { transform: `translateY(${y}cqw)`, opacity: t >= 0.94 ? 0 : 1 }, e])));
  A(sh, K(...ys.map(([t, y, e]) => [t, { transform: `scale(${(1 + y / 60).toFixed(2)})`, opacity: t >= 0.94 ? 0 : 1 }, e])));
});

def("anticipation", (s) => {
  const ar = o(s, "arrowshape", "left:24%;top:50%");
  const P = (x, sx, sy, a = 1) => ({ transform: `translateX(${x}cqw) scale(${sx},${sy})`, opacity: a });
  A(ar, K([0, P(0, 1, 1)], [0.16, P(0, 1, 1), EIO], [0.42, P(-7, 0.78, 1.12)], [0.5, P(-7, 0.78, 1.12), "cubic-bezier(.5,0,.15,1)"], [0.6, P(54, 1.25, 0.9)], [0.68, P(54, 1, 1)], [0.88, P(54, 1, 1)], [0.95, P(54, 1, 1, 0)], [1, P(0, 1, 1, 0)]));
  A(lab(s, "뒤로 살짝 당기고", "left:6%;top:14%"), op([[0, 0], [0.18, 0], [0.24, 1], [0.5, 1], [0.56, 0], [1, 0]]));
  A(lab(s, "쏘기!", "left:70%;top:14%"), op([[0, 0], [0.56, 0], [0.6, 1], [0.86, 1], [0.92, 0], [1, 0]]));
});

def("squash", (s) => {
  o(s, "ground-line", "top:86%");
  const sh = o(s, "shadow", "left:50%;top:86%");
  const b = o(s, "ball big", "left:50%;top:86%;translate:-50% -100%;transform-origin:50% 100%;background:#ff6b6b;width:12cqw");
  const rows = [[0, -34, 1, 1, EI], [0.4, -3, 0.8, 1.25], [0.46, 0, 1.42, 0.64, EO], [0.56, -4, 0.85, 1.2, EO], [1, -34, 1, 1]];
  A(b, K(...rows.map(([t, y, sx, sy, e]) => [t, { transform: `translateY(${y}cqw) scale(${sx},${sy})` }, e])), { d: 1400 });
  A(sh, K(...rows.map(([t, y, sx, , e]) => [t, { transform: `scale(${((1 + y / 50) * sx).toFixed(2)},1)` }, e])), { d: 1400 });
  lab(s, "떨어질 땐 길쭉, 닿으면 납작", "left:50%;top:6%;translate:-50% 0");
});

def("followthrough", (s) => {
  o(s, "ph-sky", "inset:0");
  o(s, "ground-line", "top:80%;background:rgb(0 0 0 / .2)");
  const c = sub(s, 50, 62, 26);
  A(c.n, K([0, { transform: "translateX(-62cqw)", opacity: 1 }, "cubic-bezier(.25,.8,.35,1)"], [0.3, { transform: "translateX(0cqw)", opacity: 1 }], [0.86, { transform: "translateX(0cqw)", opacity: 1 }], [0.94, { transform: "translateX(0cqw)", opacity: 0 }], [1, { transform: "translateX(-62cqw)", opacity: 0 }]));
  c.ears.forEach((e, i) => {
    const d = i * 0.03;
    A(e, tf([[0, "rotate(-30deg)"], [0.28 + d, "rotate(-30deg)", "ease-out"], [0.37 + d, "rotate(28deg)", "ease-in-out"], [0.46 + d, "rotate(-15deg)", "ease-in-out"], [0.55 + d, "rotate(7deg)", "ease-in-out"], [0.63 + d, "rotate(0deg)"], [1, "rotate(0deg)"]]));
  });
  lab(s, "몸은 멈춰도 더듬이는 조금 더", "left:50%;top:86%;translate:-50% 0");
});

def("secondary", (s) => {
  o(s, "ph-sea", "inset:0");
  const c = sub(s, 50, 56, 28);
  A(c.n, tf([[0, "translateX(-10cqw) rotate(-3deg)", "ease-in-out"], [1, "translateX(10cqw) rotate(3deg)"]]), { dir: "alternate" });
  c.eyes.forEach((e) => A(e, tf([[0, "scaleY(1)"], [0.3, "scaleY(1)"], [0.33, "scaleY(.1)"], [0.36, "scaleY(1)"], [0.42, "scaleY(1)"], [0.45, "scaleY(.1)"], [0.48, "scaleY(1)"], [1, "scaleY(1)"]])));
  lab(s, "주 동작: 좌우로 흔들기", "left:4%;top:6%");
  lab(s, "2차 동작: 눈 깜빡", "left:4%;top:20%;background:rgb(255 216 77 / .9);color:#1d1f1c");
});

def("hold", (s) => {
  const c = o(s, "card2", "left:50%;top:44%;width:44cqw;height:20cqw;background:#ffd84d;font-size:9cqw", "3주");
  A(c, tf([[0, "translateX(-75cqw)", EO], [0.22, "translateX(0cqw)"], [0.7, "translateX(0cqw)", EI], [0.84, "translateX(75cqw)"], [1, "translateX(75cqw)"]]));
  const bar = o(s, "", "left:28%;width:44%;top:72%;height:1.4cqw;border-radius:99px;background:#fff;transform-origin:0 50%");
  A(bar, K([0, { transform: "scaleX(0)", opacity: 0 }], [0.22, { transform: "scaleX(0)", opacity: 1 }], [0.7, { transform: "scaleX(1)", opacity: 1 }], [0.74, { transform: "scaleX(1)", opacity: 0 }], [1, { transform: "scaleX(0)", opacity: 0 }]));
  A(lab(s, "홀드: 읽을 시간 1.5초", "left:50%;top:80%;translate:-50% 0"), op([[0, 0], [0.22, 0], [0.26, 1], [0.7, 1], [0.74, 0], [1, 0]]));
});

def("arcs", (s) => {
  const g = svg(s);
  sv(g, "path", { d: "M 32 22 L 128 22", stroke: "rgb(255 255 255 / .35)", "stroke-width": 0.8, "stroke-dasharray": "2 2", fill: "none" });
  sv(g, "path", { d: "M 32 74 Q 80 16 128 74", stroke: "rgb(255 216 77 / .5)", "stroke-width": 0.8, "stroke-dasharray": "2 2", fill: "none" });
  lab(s, "직선", "left:3%;top:24%;translate:0 -50%");
  lab(s, "곡선", "left:3%;top:82%;translate:0 -50%;background:rgb(255 216 77 / .9);color:#1d1f1c");
  const X = [[0, "translateX(0cqw)"], [0.1, "translateX(0cqw)", "linear"], [0.7, "translateX(60cqw)"], [1, "translateX(60cqw)"]];
  A(o(s, "ball", "left:20%;top:24.4%;background:#c9ced6"), tf(X));
  const outer = o(s, "", "left:20%;top:82.2%;width:0;height:0");
  A(outer, tf(X));
  A(o(outer, "ball", "left:0;top:0"), tf([[0, "translateY(0cqw)"], [0.1, "translateY(0cqw)", "cubic-bezier(.33,.66,.66,1)"], [0.4, "translateY(-26cqw)", "cubic-bezier(.33,0,.66,.33)"], [0.7, "translateY(0cqw)"], [1, "translateY(0cqw)"]]));
});

def("exaggeration", (s) => {
  o(s, "ph-sky", "inset:0");
  const a = sub(s, 28, 60, 24), b = sub(s, 72, 60, 24, "#ff9f43");
  lab(s, "보통", "left:28%;top:6%;translate:-50% 0");
  lab(s, "과장", "left:72%;top:6%;translate:-50% 0;background:#e0453a");
  A(a.n, tf([[0, "scale(1)"], [0.3, "scale(1)", EO], [0.4, "scale(1.08)"], [0.8, "scale(1.08)", EIO], [0.9, "scale(1)"], [1, "scale(1)"]]));
  a.eyes.forEach((e) => A(e, tf([[0, "scale(1)"], [0.3, "scale(1)", EO], [0.4, "scale(1.15)"], [0.8, "scale(1.15)"], [0.9, "scale(1)"], [1, "scale(1)"]])));
  A(b.n, tf([[0, "translateY(0cqw) scale(1,1)"], [0.27, "translateY(0cqw) scale(1.15,.8)", EO], [0.38, "translateY(-9cqw) scale(1.25,1.4)", EI], [0.5, "translateY(0cqw) scale(1.4,1.15)", OS], [0.8, "translateY(0cqw) scale(1.3,1.3)", EIO], [0.9, "translateY(0cqw) scale(1,1)"], [1, "translateY(0cqw) scale(1,1)"]]));
  b.eyes.forEach((e) => A(e, tf([[0, "scale(1)"], [0.3, "scale(1)", OS], [0.42, "scale(1.9)"], [0.8, "scale(1.9)"], [0.9, "scale(1)"], [1, "scale(1)"]])));
  b.ears.forEach((e, i) => A(e, tf([[0, "rotate(0deg)"], [0.3, "rotate(0deg)", OS], [0.42, `rotate(${i ? 26 : -26}deg)`], [0.8, `rotate(${i ? 26 : -26}deg)`], [0.9, "rotate(0deg)"], [1, "rotate(0deg)"]])));
});

def("loop", (s) => {
  o(s, "ph-sea", "inset:0");
  const j = sub(s, 40, 52, 26, "#ff9ec7");
  A(j.n, tf([[0, "translateY(-4cqw) rotate(-3deg)", "ease-in-out"], [1, "translateY(4cqw) rotate(3deg)"]]), { d: 1600, dir: "alternate" });
  A(o(s, "gear", "left:80%;top:32%"), tf([[0, "rotate(0deg)"], [1, "rotate(360deg)"]]), { d: 4000 });
  lab(s, "끝과 처음이 이어져 계속 되풀이", "left:50%;top:84%;translate:-50% 0");
});

// ── 애프터이펙트 도구 ────────────────────────────

def("keyframe", (s) => {
  o(s, "ball big", "left:22%;top:36%;background:transparent;border:0.5cqw dashed rgb(255 255 255 / .45)");
  o(s, "ball big", "left:78%;top:36%;background:transparent;border:0.5cqw dashed rgb(255 255 255 / .45)");
  A(o(s, "ball big", "left:22%;top:36%"), tf([[0, "translateX(0cqw)"], [0.2, "translateX(0cqw)", EIO], [0.7, "translateX(56cqw)"], [1, "translateX(56cqw)"]]));
  o(s, "tl", "left:6%;right:6%;top:68%;height:24%");
  [[23.6, 0.2, "키프레임 1"], [67.6, 0.7, "키프레임 2"]].forEach(([x, t, name]) => {
    A(o(s, "kf", `left:${x}%;top:83%`), tf([[0, "scale(1)"], [t - 0.01, "scale(1)"], [t + 0.01, "scale(1.7)"], [t + 0.06, "scale(1)"], [1, "scale(1)"]]));
    lab(s, name, `left:${x}%;top:70%;translate:-50% 0;font-size:clamp(10px,2.5cqw,13px);background:transparent;padding:0`);
  });
  A(o(s, "playhead", "left:6%;top:66%;height:28%"), tf([[0, "translateX(0cqw)"], [1, "translateX(88cqw)"]]));
});

def("precomp", (s) => {
  o(s, "ph-room", "inset:0");
  const g = o(s, "", "left:50%;top:50%;width:52cqw;height:26cqw;translate:-50% -50%");
  o(g, "dot", "left:18%;top:50%;background:#5fb8ff;width:11cqw");
  o(g, "sq", "left:48%;top:50%;width:11cqw;background:#ff9f43");
  o(g, "card2", "left:80%;top:50%;width:15cqw;height:8cqw;background:#fff;font-size:4cqw;box-shadow:0 0 0 .3cqw #1d1f1c", "이름표");
  const box = o(g, "dash", "inset:-8%;border-color:#1d1f1c");
  lab(box, "프리컴프 = 한 덩어리", "left:0;top:-3.4cqw;translate:0 -50%");
  A(box, op([[0, 0], [0.18, 0], [0.26, 1], [0.9, 1], [0.96, 0], [1, 0]]));
  A(g, tf([[0, "translateX(0cqw) rotate(0deg) scale(1)"], [0.32, "translateX(0cqw) rotate(0deg) scale(1)", EIO], [0.6, "translateX(14cqw) rotate(-10deg) scale(.78)"], [0.78, "translateX(14cqw) rotate(-10deg) scale(.78)", EIO], [1, "translateX(0cqw) rotate(0deg) scale(1)"]]));
});

def("mask", (s) => {
  o(s, "ph-cells", "inset:0;filter:grayscale(1) brightness(.45)");
  const top = o(s, "ph-cells", "inset:0");
  A(top, K([0, { clipPath: "circle(17% at 26% 36%)" }, EIO], [0.33, { clipPath: "circle(17% at 58% 66%)" }, EIO], [0.66, { clipPath: "circle(26% at 72% 40%)" }, EIO], [1, { clipPath: "circle(17% at 26% 36%)" }]));
  lab(s, "모양 안만 보여요", "left:4%;top:6%");
});

def("trackmatte", (s) => {
  const sea = o(s, "ph-sea", "inset:0");
  A(sea, op([[0, 1], [0.25, 1, EIO], [0.42, 0], [0.86, 0, EIO], [1, 1]]));
  const t = tx(s, "바다", "left:50%;top:50%;font-size:30cqw;color:transparent;-webkit-text-stroke:.4cqw #fff;background:linear-gradient(105deg,#7fd3ff 0 20%,#1e7fb5 20% 40%,#5cc2f0 40% 60%,#135784 60% 80%,#7fd3ff 80%) 0 0/60cqw 100%;-webkit-background-clip:text;background-clip:text;text-shadow:none");
  A(t, F("backgroundPosition", [[0, "0cqw 0"], [1, "60cqw 0"]]), { d: 2400 });
  A(lab(s, "글자 모양 안에만 바다 영상", "left:50%;top:86%;translate:-50% 0"), op([[0, 0], [0.4, 0], [0.46, 1], [0.86, 1], [0.9, 0], [1, 0]]));
});

def("graph", (s) => {
  const g = svg(s);
  const x0 = 12.8, x1 = 89.6, y0 = 77.4, y1 = 12.6;
  sv(g, "path", { d: `M ${x0} ${y1 - 4} L ${x0} ${y0} L ${x1 + 4} ${y0}`, stroke: "rgb(255 255 255 / .55)", "stroke-width": 0.7, fill: "none" });
  sv(g, "path", { d: `M ${x0} ${y0} C ${x0 + 0.65 * (x1 - x0)} ${y0} ${x0 + 0.35 * (x1 - x0)} ${y1} ${x1} ${y1}`, stroke: "#ffd84d", "stroke-width": 1.2, fill: "none" });
  lab(s, "시간", "left:48%;top:90%;translate:-50% -50%;background:transparent;padding:0");
  lab(s, "값", "left:3%;top:12%;background:transparent;padding:0");
  const win = [[0, 0], [0.1, 0, "linear"], [0.7, 1], [1, 1]];
  const outer = o(s, "", "left:8%;top:86%;width:0;height:0");
  A(outer, tf(win.map(([t, v, e]) => [t, `translateX(${v * 48}cqw)`, e])));
  A(o(outer, "ball", "left:0;top:0;width:3.2cqw;background:#fff"), tf(win.map(([t, v]) => [t, `translateY(${-v * 40.5}cqw)`, t === 0.1 ? EIO : undefined])));
  o(s, "track", "left:78%;top:14%;height:72%;width:2px;translate:-50% 0");
  A(o(s, "ball big", "left:78%;top:86%;width:8cqw"), tf(win.map(([t, v]) => [t, `translateY(${-v * 40.5}cqw)`, t === 0.1 ? EIO : undefined])));
  lab(s, "가파른 곳이 빠른 곳", "left:61%;top:4%");
});

def("parenting", (s) => {
  o(s, "ph-night", "inset:0");
  const R = (a, b) => [[0, `translateX(-14cqw) rotate(${a}deg)`], [0.5, `translateX(14cqw) rotate(${(a + b) / 2}deg)`], [1, `translateX(-14cqw) rotate(${b}deg)`]];
  const par = o(s, "dot", "left:50%;top:54%;width:20cqw;background:#5fb8ff");
  A(par, tf(R(0, 360)), { d: 4000, e: "ease-in-out" });
  o(par, "", "left:50%;top:50%;width:70%;height:.5cqw;background:rgb(255 255 255 / .6);transform-origin:0 50%;translate:0 -50%");
  const kid = o(par, "dot", "left:120%;top:50%;width:8cqw;background:#ffd84d");
  const t1 = tx(par, "부모", "left:50%;top:50%;font-size:4.2cqw");
  const t2 = tx(kid, "자식", "left:50%;top:50%;font-size:3cqw;color:#1d1f1c;text-shadow:none");
  [t1, t2].forEach((t) => A(t, tf([[0, "rotate(0deg)"], [0.5, "rotate(-180deg)"], [1, "rotate(-360deg)"]]), { d: 4000, e: "ease-in-out" }));
});

def("null", (s) => {
  o(s, "ph-room", "inset:0");
  const g = o(s, "", "inset:0");
  const l = svg(g);
  [[40, 63], [80, 65], [120, 63]].forEach(([x, y]) => sv(l, "line", { x1: 80, y1: 20, x2: x, y2: y, stroke: "#ff6b5f", "stroke-width": 0.6, "stroke-dasharray": "2 1.5" }));
  o(g, "nullbox", "left:50%;top:22%");

  o(g, "dot", "left:25%;top:70%;background:#5fb8ff;width:10cqw");
  o(g, "sq", "left:50%;top:72%;width:10cqw;background:#ff9f43");
  o(g, "dot", "left:75%;top:70%;background:#7ee08a;width:10cqw;border-radius:2cqw;rotate:45deg");
  A(g, tf([[0, "translateX(-12cqw)", "ease-in-out"], [1, "translateX(12cqw)"]]), { dir: "alternate" });
  lab(s, "널: 안 보이는 손잡이", "left:4%;top:6%");
});

def("anchor", (s) => {
  const a = o(s, "sq", "left:30%;top:56%");
  A(a, tf([[0, "rotate(0deg)"], [0.15, "rotate(0deg)", EIO], [0.5, "rotate(90deg)"], [0.65, "rotate(90deg)", EIO], [1, "rotate(0deg)"]]));
  o(s, "pin", "left:30%;top:56%");
  const b = o(s, "sq", "left:70%;top:56%;transform-origin:0% 100%;background:#ff9f43");
  A(b, tf([[0, "rotate(0deg)"], [0.15, "rotate(0deg)", EIO], [0.5, "rotate(-80deg)"], [0.65, "rotate(-80deg)", EIO], [1, "rotate(0deg)"]]));
  o(s, "pin", "left:calc(70% - 9cqw);top:calc(56% + 9cqw)");
  lab(s, "가운데 기준", "left:30%;top:7%;translate:-50% 0");
  lab(s, "모서리 기준", "left:70%;top:7%;translate:-50% 0");
});

def("expression", (s) => {
  o(s, "code", "left:5%;top:10%", "rotation = time × 360");
  const c = o(s, "clock", "left:68%;top:58%");
  A(o(c, "needle", "left:50%;top:50%"), tf([[0, "rotate(0deg)"], [1, "rotate(360deg)"]]), { d: 1000 });
  lab(s, "1초에 한 바퀴, 끝없이", "left:5%;top:78%");
});

def("wiggle", (s) => {
  o(s, "code", "left:5%;top:10%", "wiggle(3, 5)");
  lab(s, "1초에 3번, 5픽셀만큼", "left:5%;top:30%");
  A(tx(s, "?", "left:66%;top:56%;font-size:28cqw;color:#ffd84d"), jitter(7, 12, 1.8, 7), { d: 4000 });
});

def("motiontrack", (s) => {
  o(s, "ph-cells", "inset:0;filter:brightness(.92)");
  const pts = [[20, 62], [36, 34], [56, 52], [74, 28], [84, 62], [60, 76], [36, 72], [20, 62]];
  const tr = (x, y) => `translate(${x}cqw,${(y * 0.5625).toFixed(2)}cqw)`;
  const ang = pts.map((p, i) => { const q = pts[(i + 1) % (pts.length - 1)]; return (Math.atan2((q[1] - p[1]) * 0.5625, q[0] - p[0]) * 180) / Math.PI; });
  for (let i = 1; i < ang.length; i++) ang[i] -= 360 * Math.round((ang[i] - ang[i - 1]) / 360); // 가까운 쪽으로 돌게
  const rows = (rot) => pts.map(([x, y], i) => [i / (pts.length - 1), tr(x, y) + (rot ? ` rotate(${ang[i].toFixed(1)}deg)` : ""), "ease-in-out"]);
  A(o(s, "para", "left:0;top:0"), tf(rows(true)), { d: 5600 });
  const t = o(s, "trk", "left:0;top:0");
  A(t, tf(rows(false)), { d: 5600 });
  lab(t, "짚신벌레", "left:50%;top:-1cqw;translate:-50% -100%;background:#ffd84d;color:#1d1f1c");
});

def("chromakey", (s) => {
  o(s, "ph-sea", "inset:0");
  A(o(s, "", "inset:0;background:#19c443"), op([[0, 1], [0.3, 1, EIO], [0.45, 0], [0.85, 0, EIO], [1, 1]]));
  sub(s, 50, 58, 30);
  A(lab(s, "초록 배경", "left:4%;top:6%"), op([[0, 1], [0.3, 1], [0.36, 0], [0.9, 0], [1, 1]]));
  A(lab(s, "초록만 지우고 바닷속에", "left:4%;top:6%"), op([[0, 0], [0.4, 0], [0.46, 1], [0.84, 1], [0.88, 0], [1, 0]]));
});

def("shapelayer", (s) => {
  A(o(s, "dot", "left:22%;top:50%;width:14cqw;background:#5fb8ff"), tf([[0, "scale(1)", EIO], [0.5, "scale(2.2)", EIO], [1, "scale(1)"]]));
  A(o(s, "sq", "left:52%;top:50%;width:14cqw;background:#ff9f43"), tf([[0, "rotate(0deg)", EIO], [0.5, "rotate(180deg)", EIO], [1, "rotate(360deg)"]]));
  A(o(s, "dot star", "left:80%;top:50%;width:16cqw;border-radius:0;background:#ffd84d"), tf([[0, "rotate(0deg) scale(1)", EIO], [0.5, "rotate(144deg) scale(1.4)", EIO], [1, "rotate(288deg) scale(1)"]]));
  lab(s, "벡터라서 커져도 또렷", "left:50%;top:84%;translate:-50% 0");
});

def("trimpaths", (s) => {
  o(s, "ph-sea", "inset:0;filter:brightness(.8)");
  sub(s, 80, 36, 14);
  const g = svg(s);
  const draw = (d, w, from, to) => {
    const p = sv(g, "path", { d, stroke: "#ff4d4d", "stroke-width": w, fill: "none", "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 });
    A(p, K([0, { strokeDashoffset: 1, opacity: 1 }], [from, { strokeDashoffset: 1, opacity: 1 }, EIO], [to, { strokeDashoffset: 0, opacity: 1 }], [0.88, { strokeDashoffset: 0, opacity: 1 }], [0.95, { strokeDashoffset: 0, opacity: 0 }], [1, { strokeDashoffset: 1, opacity: 0 }]));
  };
  draw("M 18 74 Q 50 20 104 36", 1.8, 0.08, 0.42);
  draw("M 104 36 l -7 -5 M 104 36 l -8 3", 1.8, 0.42, 0.5);
  draw("M 128 20 a 14 14 0 1 1 -0.1 0", 1.6, 0.5, 0.74);
});

def("adjlayer", (s) => {
  o(s, "ph-room", "inset:0");
  o(s, "dot", "left:24%;top:64%;width:15cqw;background:#ff6b6b");
  o(s, "sq", "left:50%;top:64%;width:15cqw;background:#5fb8ff");
  o(s, "dot", "left:76%;top:64%;width:15cqw;background:#7ee08a");
  const band = o(s, "adj", "left:5%;right:5%;top:40%;height:48%");
  lab(band, "조정 레이어: 흑백", "left:2cqw;top:1.4cqw");
  A(band, K([0, { transform: "translateY(-46cqw)" }], [0.15, { transform: "translateY(-46cqw)" }, EIO], [0.42, { transform: "translateY(0cqw)" }], [0.8, { transform: "translateY(0cqw)" }, EIO], [1, { transform: "translateY(-46cqw)" }]));
});

def("blendmode", (s) => {
  o(s, "ph-night", "inset:0");
  [["#ff3b3b", 0, -1], ["#3bff5a", -1, 1], ["#3b6bff", 1, 1]].forEach(([c, dx, dy]) => {
    const n = o(s, "dot", `left:50%;top:50%;width:26cqw;background:${c};mix-blend-mode:screen`);
    A(n, tf([[0, `translate(${dx * 14}cqw,${dy * 8 - 4}cqw)`, EIO], [0.5, `translate(${dx * 6}cqw,${dy * 3.5 - 1}cqw)`, EIO], [1, `translate(${dx * 14}cqw,${dy * 8 - 4}cqw)`]]));
  });
  lab(s, "스크린: 겹친 곳이 밝아져요", "left:4%;top:6%");
});

def("timeremap", (s) => {
  o(s, "track", "left:14%;right:10%;top:52%");
  A(o(s, "ball big", "left:14%;top:52%;width:8cqw"), tf([[0, "translateX(0cqw)", "linear"], [0.35, "translateX(50cqw)", EIO], [0.5, "translateX(22cqw)"], [0.6, "translateX(22cqw)", "linear"], [0.9, "translateX(72cqw)"], [1, "translateX(72cqw)"]]));
  const l = lab(s, "재생", "left:50%;top:14%;translate:-50% 0");
  tick(s, (t) => { l.textContent = t < 0.35 ? "재생" : t < 0.5 ? "되감기" : t < 0.6 ? "멈춤" : t < 0.9 ? "다시 재생" : "끝"; });
});

def("zspace", (s) => {
  const W = s.clientWidth || 320;
  const view = o(s, "", `inset:0;perspective:${W * 0.9}px;perspective-origin:50% 45%`);
  const w3 = o(view, "", "inset:0;transform-style:preserve-3d");
  const cols = ["#3a7bd5", "#f39a45", "#7ee08a", "#ff6b6b", "#b48cff"];
  cols.forEach((c, i) => {
    const x = (i % 2 ? 1 : -1) * W * 0.2;
    o(w3, "card2", `left:50%;top:50%;width:30cqw;height:20cqw;background:${c};color:#fff;font-size:6cqw;transform:translate3d(${x}px,0,${-i * W * 0.55}px) rotateY(${i % 2 ? -18 : 18}deg)`, `사진 ${i + 1}`);
  });
  A(w3, tf([[0, `translateZ(0px) rotateY(-6deg)`, EIO], [1, `translateZ(${W * 1.3}px) rotateY(6deg)`]]), { d: 4400, dir: "alternate" });
  lab(s, "Z 공간: 앞뒤로 세운 사진 사이를 지나가기", "left:50%;top:88%;translate:-50% 0;font-size:clamp(10px,2.6cqw,13px)");
});

// ── 글씨와 그래픽 ────────────────────────────────

def("popin", (s) => {
  o(s, "ph-sea", "inset:0;filter:brightness(.8)");
  sub(s, 24, 74, 22);
  const b = o(s, "bubble", "left:44%;top:46%", "결론부터!");
  A(b, tf([[0, "scale(0)"], [0.1, "scale(0)", OS], [0.32, "scale(1)"], [0.8, "scale(1)", EI], [0.9, "scale(0)"], [1, "scale(0)"]]));
});

def("slidein", (s) => {
  o(s, "ph-room", "inset:0");
  const L = o(s, "card2", "left:28%;top:50%;width:34cqw;height:30cqw;background:#fff;font-size:8cqw", "전");
  const R = o(s, "card2", "left:72%;top:50%;width:34cqw;height:30cqw;background:#ffd84d;font-size:8cqw", "후");
  A(L, tf([[0, "translateX(-70cqw)"], [0.08, "translateX(-70cqw)", EO], [0.34, "translateX(0cqw)"], [0.82, "translateX(0cqw)", EI], [0.95, "translateX(-70cqw)"], [1, "translateX(-70cqw)"]]));
  A(R, tf([[0, "translateX(70cqw)"], [0.16, "translateX(70cqw)", EO], [0.42, "translateX(0cqw)"], [0.82, "translateX(0cqw)", EI], [0.95, "translateX(70cqw)"], [1, "translateX(70cqw)"]]));
});

def("kinetic", (s) => {
  const out = (t0) => [[0.86, "translateX(0cqw) scale(1) rotate(0deg)", EI], [0.94, "translateX(0cqw) scale(.6) rotate(0deg)"], [1, "translateX(0cqw) scale(.6) rotate(0deg)"]];
  const w1 = tx(s, "세포", "left:50%;top:26%;font-size:14cqw");
  A(w1, K([0, { transform: "translateX(0cqw) scale(3) rotate(0deg)", opacity: 0 }], [0.05, { transform: "translateX(0cqw) scale(3) rotate(0deg)", opacity: 0 }, EO], [0.16, { transform: "translateX(0cqw) scale(1) rotate(0deg)", opacity: 1 }], ...out().map(([t, v, e]) => [t, { transform: v, opacity: t > 0.9 ? 0 : 1 }, e])));
  const w2 = tx(s, "하나가", "left:50%;top:52%;font-size:11cqw");
  A(w2, K([0, { transform: "translateX(60cqw) scale(1) rotate(12deg)", opacity: 0 }], [0.25, { transform: "translateX(60cqw) scale(1) rotate(12deg)", opacity: 0 }, EO], [0.38, { transform: "translateX(0cqw) scale(1) rotate(0deg)", opacity: 1 }], ...out().map(([t, v, e]) => [t, { transform: v, opacity: t > 0.9 ? 0 : 1 }, e])));
  const w3 = tx(s, "전부!", "left:50%;top:78%;font-size:16cqw;color:#ffd84d");
  A(w3, K([0, { transform: "translateX(0cqw) scale(0) rotate(-20deg)", opacity: 1 }], [0.46, { transform: "translateX(0cqw) scale(0) rotate(-20deg)", opacity: 1 }, OS], [0.6, { transform: "translateX(0cqw) scale(1) rotate(-6deg)", opacity: 1 }], [0.86, { transform: "translateX(0cqw) scale(1) rotate(-6deg)", opacity: 1 }, EI], [0.94, { transform: "translateX(0cqw) scale(.6) rotate(0deg)", opacity: 0 }], [1, { transform: "translateX(0cqw) scale(0) rotate(-20deg)", opacity: 0 }]));
});

def("lowerthird", (s) => {
  o(s, "ph-room", "inset:0");
  fig(s, 64, 70, 60);
  const lt = o(s, "lt", "left:6%;top:76%");
  div(lt, "big", "연구팀 이름");
  div(lt, "small", "논문 제목과 연도");
  A(lt, K([0, { clipPath: "inset(0 100% 0 0)" }], [0.14, { clipPath: "inset(0 100% 0 0)" }, EO], [0.32, { clipPath: "inset(0 0% 0 0)" }], [0.8, { clipPath: "inset(0 0% 0 0)" }, EI], [0.92, { clipPath: "inset(0 100% 0 0)" }], [1, { clipPath: "inset(0 100% 0 0)" }]));
});

def("textreveal", (s) => {
  A(o(s, "hline", "left:16%;right:16%;top:60%"), tf([[0, "scaleX(0)"], [0.04, "scaleX(0)", EO], [0.18, "scaleX(1)"], [0.84, "scaleX(1)", EI], [0.94, "scaleX(0)"], [1, "scaleX(0)"]]));
  const m = o(s, "", "left:0;right:0;top:28%;height:32%;overflow:hidden");
  A(tx(m, "머리만 남았다", "left:50%;top:50%;font-size:10cqw"), tf([[0, "translateY(12cqw)"], [0.16, "translateY(12cqw)", EO], [0.38, "translateY(0cqw)"], [0.8, "translateY(0cqw)", EI], [0.9, "translateY(-14cqw)"], [1, "translateY(-14cqw)"]]));
});

def("typewriter", (s) => {
  const box = o(s, "search", "left:50%;top:48%");
  const t = div(box, "typed", "바다 민달팽이 머리", "span");
  const c = div(box, "caret", null, "span");
  A(t, F("maxWidth", [[0, "0em", "steps(10, end)"], [0.6, "9.4em"], [0.9, "9.4em"], [0.901, "0em"], [1, "0em"]]));
  A(c, op([[0, 1], [0.5, 1], [0.501, 0], [1, 0]]), { d: 700 });
});

def("magnifier", (s) => {
  const scene = (p) => {
    o(p, "ph-cells", "inset:0");
    [[29, 61], [31.2, 63.6], [28, 64.6], [31.6, 60]].forEach(([x, y]) => o(p, "tiny", `left:${x}%;top:${y}%`));
  };
  scene(s);
  A(o(s, "mk", "left:30%;top:62%"), K([0, { transform: "scale(0)", opacity: 1 }], [0.08, { transform: "scale(0)", opacity: 1 }, OS], [0.18, { transform: "scale(1)", opacity: 1 }], [0.86, { transform: "scale(1)", opacity: 1 }], [0.92, { transform: "scale(1)", opacity: 0 }], [1, { transform: "scale(0)", opacity: 0 }]));
  const g = svg(s);
  const ln = sv(g, "line", { x1: 52, y1: 53, x2: 98, y2: 40, stroke: "#fff", "stroke-width": 0.6, pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 });
  A(ln, K([0, { strokeDashoffset: 1, opacity: 1 }], [0.18, { strokeDashoffset: 1, opacity: 1 }, EIO], [0.3, { strokeDashoffset: 0, opacity: 1 }], [0.86, { strokeDashoffset: 0, opacity: 1 }], [0.92, { strokeDashoffset: 0, opacity: 0 }], [1, { strokeDashoffset: 1, opacity: 0 }]));
  const lens = o(s, "lens", "left:72%;top:42%");
  const inner = o(lens, "", "left:calc(50% - 30cqw);top:calc(50% - 34.875cqw);width:100cqw;height:56.25cqw;transform-origin:30cqw 34.875cqw;transform:scale(3.2)");
  scene(inner);
  A(lens, K([0, { transform: "scale(0)" }], [0.28, { transform: "scale(0)" }, OS], [0.42, { transform: "scale(1)" }], [0.86, { transform: "scale(1)" }, EI], [0.94, { transform: "scale(0)" }], [1, { transform: "scale(0)" }]));
  lab(lens, "3배", "left:50%;bottom:6%;translate:-50% 0");
});

def("counter", (s) => {
  const n = tx(s, "0", "left:50%;top:44%;font-size:11cqw;color:#ffd84d;font-variant-numeric:tabular-nums");
  A(n, tf([[0, "scale(1)"], [0.6, "scale(1)", OS], [0.66, "scale(1.12)"], [0.74, "scale(1)"], [1, "scale(1)"]]));
  A(tx(s, "1억 3천만", "left:50%;top:72%;font-size:6cqw"), op([[0, 0], [0.6, 0], [0.66, 1], [0.92, 1], [0.96, 0], [1, 0]]));
  tick(s, (t) => {
    const p = t < 0.1 ? 0 : t > 0.6 ? 1 : 1 - Math.pow(1 - (t - 0.1) / 0.5, 3);
    n.textContent = Math.round(130000000 * p).toLocaleString("ko-KR");
  });
});

def("callout", (s) => {
  o(s, "ph-sea", "inset:0");
  sub(s, 34, 62, 30);
  A(o(s, "pin", "left:39.6%;top:32%"), tf([[0, "scale(0)"], [0.08, "scale(0)", OS], [0.16, "scale(1)"], [0.88, "scale(1)"], [0.94, "scale(0)"], [1, "scale(0)"]]));
  const g = svg(s);
  const p = sv(g, "polyline", { points: "63.4 28.8 96 12.6 124 12.6", stroke: "#fff", "stroke-width": 0.8, fill: "none", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 });
  A(p, K([0, { strokeDashoffset: 1, opacity: 1 }], [0.16, { strokeDashoffset: 1, opacity: 1 }, EIO], [0.36, { strokeDashoffset: 0, opacity: 1 }], [0.88, { strokeDashoffset: 0, opacity: 1 }], [0.94, { strokeDashoffset: 0, opacity: 0 }], [1, { strokeDashoffset: 1, opacity: 0 }]));
  const l = o(s, "card2", "left:89%;top:14%;padding:.3em .6em;background:#fff;font-size:4.6cqw;white-space:nowrap", "더듬이");
  A(l, tf([[0, "scale(0)"], [0.36, "scale(0)", OS], [0.46, "scale(1)"], [0.88, "scale(1)"], [0.94, "scale(0)"], [1, "scale(0)"]]));
});

def("highlight", (s) => {
  const p = o(s, "paper", "left:7%;right:7%;top:14%");
  const l1 = div(p);
  l1.append("머리만 남아도 ");
  const hl = div(l1, "hl", "몸이 다시 생겨요", "span");
  const l2 = div(p);
  const st = div(l2, "strike", "몸은 못 만들어요", "span");
  const bar = div(st, "", null, "i");
  A(hl, F("backgroundSize", [[0, "0% 100%"], [0.12, "0% 100%", EIO], [0.4, "100% 100%"], [0.9, "100% 100%"], [0.94, "0% 100%"], [1, "0% 100%"]]));
  A(bar, tf([[0, "scaleX(0)"], [0.48, "scaleX(0)", EIO], [0.64, "scaleX(1)"], [0.9, "scaleX(1)"], [0.94, "scaleX(0)"], [1, "scaleX(0)"]]));
});

def("pulse", (s) => {
  o(s, "ph-sea", "inset:0");
  [0, 0.18, 0.36].forEach((t0) => A(o(s, "ring", "left:60%;top:56%;width:30cqw;aspect-ratio:1"), K([0, { transform: "scale(0)", opacity: 0 }], [t0, { transform: "scale(0)", opacity: 1 }, EO], [t0 + 0.45, { transform: "scale(1)", opacity: 0 }], [1, { transform: "scale(1)", opacity: 0 }])));
  o(s, "pin", "left:60%;top:56%;width:3.6cqw");
});

// ── 카메라 무빙 ──────────────────────────────────

def("zoom", (s) => {
  const W = world(s);
  W.cam.style.transformOrigin = "50% 62%";
  A(W.cam, tf([[0, "scale(1)"], [0.12, "scale(1)", EIO], [0.42, "scale(1.5)"], [0.62, "scale(1.5)", EIO], [0.92, "scale(1)"], [1, "scale(1)"]]));
  A(lab(s, "줌 인", "left:4%;top:6%"), op([[0, 0], [0.12, 0], [0.16, 1], [0.58, 1], [0.62, 0], [1, 0]]));
  A(lab(s, "줌 아웃", "left:4%;top:6%"), op([[0, 0], [0.62, 0], [0.66, 1], [0.92, 1], [0.96, 0], [1, 0]]));
});

def("kenburns", (s) => {
  const ph = o(s, "ph-sea", "inset:-6%");
  sub(ph, 46, 66, 24, "#c9a6ff");
  A(ph, tf([[0, "scale(1) translate(0cqw,0cqw)", "ease-in-out"], [1, "scale(1.16) translate(-4cqw,-2.4cqw)"]]), { d: 4200, dir: "alternate" });
  lab(s, "사진 한 장에 느린 줌과 팬", "left:4%;top:6%");
});

def("pan", (s) => {
  const W = world(s);
  W.layers.forEach((l) => A(l, tf([[0, "translateX(0cqw)", EIO], [1, "translateX(-34cqw)"]]), { d: 3600, dir: "alternate" }));
  lab(s, "모든 층이 똑같이 밀려요", "left:4%;top:6%");
});

def("pushin", (s) => {
  const W = world(s);
  [1.04, 1.1, 1.28, 1.5, 1.45, 1.9].forEach((k, i) => {
    W.layers[i].style.transformOrigin = "50% 62%";
    A(W.layers[i], tf([[0, "scale(1)", EIO], [1, `scale(${k})`]]), { d: 3600, dir: "alternate" });
  });
  lab(s, "가까운 것일수록 더 크게", "left:4%;top:6%");
});

def("parallax", (s) => {
  const L = [
    ["inset:0;background:linear-gradient(#ffd7a8,#ffb27a 60%)", 3, "뒤 층"],
    ["left:-30%;width:160%;top:46%;bottom:0;background:linear-gradient(#3a9ccc,#135784)", 9, "가운데 층"],
    ["left:-30%;width:160%;top:62%;bottom:-10%;background:radial-gradient(ellipse 22% 60% at 20% 100%,#6b5a4a 97%,transparent 100%),radial-gradient(ellipse 18% 46% at 64% 100%,#7a6655 97%,transparent 100%),radial-gradient(ellipse 14% 40% at 96% 100%,#6b5a4a 97%,transparent 100%)", 20, ""],
    ["left:-30%;width:160%;top:70%;bottom:-20%;background:radial-gradient(ellipse 16% 80% at 10% 100%,#2f2722 97%,transparent 100%),radial-gradient(ellipse 20% 70% at 52% 100%,#3a302a 97%,transparent 100%),radial-gradient(ellipse 14% 90% at 90% 100%,#2f2722 97%,transparent 100%)", 34, "앞 층"],
  ];
  L.forEach(([css, d, name], i) => {
    const n = o(s, "", css);
    if (i === 0) o(n, "sun", "left:66%;top:30%;background:#fff3d6;box-shadow:none");
    A(n, tf([[0, "translateX(0cqw)", EIO], [1, `translateX(${-d}cqw)`]]), { d: 4200, dir: "alternate" });
  });
  lab(s, "뒤 층은 느리게, 앞 층은 빠르게", "left:4%;top:6%");
});

def("whippan", (s) => {
  const strip = o(s, "", "left:0;top:0;width:200%;height:100%");
  o(strip, "pa", "left:0;top:0;width:50%;height:100%");
  o(strip, "pb", "left:50%;top:0;width:50%;height:100%");
  const P = (x, b) => ({ transform: `translateX(${x}cqw)`, filter: `blur(${b}px)` });
  A(strip, K([0, P(0, 0)], [0.34, P(0, 0), EI], [0.42, P(-50, 12), EO], [0.5, P(-100, 0)], [0.82, P(-100, 0), EI], [0.9, P(-50, 12), EO], [0.98, P(0, 0)], [1, P(0, 0)]));
  lab(s, "휙! 번지면서 넘어가기", "left:50%;top:6%;translate:-50% 0");
});

def("tilt", (s) => {
  const col = o(s, "", "left:0;top:0;width:100%;height:230%;background:linear-gradient(#5ea9e0,#bfe6ff 60%,#d9f2ff 82%,#66ae69 82%)");
  o(col, "sun", "left:72%;top:8%");
  o(col, "", "left:47%;width:6%;top:24%;bottom:12%;background:#7a5536;border-radius:1cqw");
  o(col, "", "left:50%;top:14%;width:40cqw;height:30cqw;border-radius:50%;background:#3f8d5d;translate:-50% 0");
  o(col, "", "left:50%;top:26%;width:30cqw;height:22cqw;border-radius:50%;background:#4fa56b;translate:-50% 0");
  sub(col, 30, 84.5, 16);
  A(col, tf([[0, "translateY(-56.5%)", EIO], [1, "translateY(0%)"]]), { d: 4000, dir: "alternate" });
  lab(s, "고개만 위아래로", "left:4%;top:6%");
});

def("pullout", (s) => {
  const W = world(s);
  [1.12, 1.35, 1.9, 2.8, 3.2, 4.2].forEach((k, i) => {
    W.layers[i].style.transformOrigin = "50% 58%";
    A(W.layers[i], tf([[0, `scale(${k})`, EIO], [1, "scale(1)"]]), { d: 4000, dir: "alternate" });
  });
  lab(s, "가까이에서 물러나며 주변이 드러나요", "left:4%;top:6%");
});

def("dof", (s) => {
  const bg = o(s, "ph-sea", "inset:-4%");
  sub(s, 50, 60, 30);
  A(bg, F("filter", [[0, 0], [0.25, 0, EIO], [0.45, 7], [0.85, 7, EIO], [1, 0]], (v) => `blur(${v}px)`));
  A(lab(s, "다 또렷", "left:4%;top:6%"), op([[0, 1], [0.28, 1], [0.32, 0], [0.92, 0], [1, 1]]));
  A(lab(s, "배경만 흐리게", "left:4%;top:6%"), op([[0, 0], [0.34, 0], [0.4, 1], [0.84, 1], [0.88, 0], [1, 0]]));
});

def("rackfocus", (s) => {
  o(s, "", "inset:0;background:linear-gradient(#bfe0c4,#7fb98a)");
  const far = sub(s, 68, 46, 16, "#ff9f43");
  const near = o(s, "leaf", "left:24%;top:72%");
  const B = (v) => `blur(${v}px)`;
  A(near, F("filter", [[0, 0], [0.3, 0, EIO], [0.48, 6], [0.8, 6, EIO], [0.98, 0], [1, 0]], B));
  A(far.n, F("filter", [[0, 5], [0.3, 5, EIO], [0.48, 0], [0.8, 0, EIO], [0.98, 5], [1, 5]], B));
  A(lab(s, "앞에 초점", "left:4%;top:6%"), op([[0, 1], [0.32, 1], [0.36, 0], [0.92, 0], [1, 1]]));
  A(lab(s, "뒤로 초점 이동", "left:4%;top:6%"), op([[0, 0], [0.4, 0], [0.44, 1], [0.8, 1], [0.84, 0], [1, 0]]));
});

def("tracking", (s) => {
  o(s, "ph-sky", "inset:0");
  // [css, 한 바퀴에 밀 거리, 층마다 세로 위치]
  const lay = [
    ["left:0;right:0;bottom:22%;height:30%;background:radial-gradient(ellipse 50% 100% at 50% 100%,#9cc8b2 97%,transparent 100%) 0 100%/30cqw 100% repeat-x", 30, ["100%"]],
    ["left:0;right:0;bottom:20%;height:28%;background:radial-gradient(circle 4.2cqw at 50% 34%,#3f8d5d 96%,transparent 100%) 0 0/16cqw 100% repeat-x,linear-gradient(90deg,transparent 45%,#6d4c33 45% 55%,transparent 55%) 0 100%/16cqw 52% repeat-x", 48, ["0%", "100%"]],
    ["left:0;right:0;bottom:-24%;height:46%;background:linear-gradient(#66ae69,#4a9255)", 0, []],
  ];
  lay.forEach(([css, dist, ys]) => {
    const n = o(s, "", css);
    if (dist) A(n, F("backgroundPosition", [[0, ys.map((y) => `0cqw ${y}`).join(", ")], [1, ys.map((y) => `-${dist}cqw ${y}`).join(", ")]]));
  });
  const c = sub(s, 50, 64, 22);
  A(c.n, tf([[0, "translateY(0cqw)", "ease-out"], [0.5, "translateY(-2.4cqw)", "ease-in"], [1, "translateY(0cqw)"]]), { d: 500 });
  const near = o(s, "", "left:0;right:0;bottom:-7%;height:19%;background:radial-gradient(ellipse 50% 100% at 50% 100%,#2f7040 96%,transparent 100%) 0 100%/24cqw 100% repeat-x");
  A(near, F("backgroundPosition", [[0, "0cqw 100%"], [1, "-96cqw 100%"]]));
  lab(s, "대상은 가운데, 배경이 흘러가요", "left:4%;top:6%");
});

def("crashzoom", (s) => {
  const W = world(s);
  W.cam.style.transformOrigin = "50% 60%";
  const P = (k, b) => ({ transform: `scale(${k})`, filter: `blur(${b}px)` });
  A(W.cam, K([0, P(1, 0)], [0.3, P(1, 0), "ease-in"], [0.34, P(1.9, 4), "ease-out"], [0.38, P(3.2, 0)], [0.8, P(3.2, 0), EIO], [0.95, P(1, 0)], [1, P(1, 0)]));
  A(tx(s, "!", "left:78%;top:22%;font-size:18cqw;color:#ff4d4d"), tf([[0, "scale(0)"], [0.37, "scale(0)", OS], [0.45, "scale(1)"], [0.8, "scale(1)"], [0.84, "scale(0)"], [1, "scale(0)"]]));
});

def("dollyzoom", (s) => {
  o(s, "", "inset:0;background:#1b2740");
  for (let i = 8; i >= 0; i--) {
    const near = 1 / (1 + i * 0.35), far = 3 / (3 + i * 0.35);
    const n = o(s, "tun", `left:50%;top:46%;width:140%;height:140%;background:${i % 2 ? "#2c4166" : "#36507d"}`);
    A(n, tf([[0, `scale(${near})`], [0.15, `scale(${near})`, EIO], [0.5, `scale(${far})`], [0.65, `scale(${far})`, EIO], [1, `scale(${near})`]]), { d: 4000 });
  }
  const door = o(s, "", "left:50%;top:46%;width:8cqw;height:12cqw;translate:-50% -50%;background:#ffe9a8;border-radius:.6cqw");
  A(door, tf([[0, "scale(1)"], [0.15, "scale(1)", EIO], [0.5, "scale(2)"], [0.65, "scale(2)", EIO], [1, "scale(1)"]]), { d: 4000 });
  sub(s, 50, 66, 26);
  lab(s, "대상은 그대로, 배경만 늘어나요", "left:4%;top:6%");
});

def("arc", (s) => {
  const W = s.clientWidth || 320;
  const stripes = o(s, "", "left:-50%;width:200%;top:0;bottom:30%;background:repeating-linear-gradient(90deg,#24324a 0 6cqw,#2c3d5a 6cqw 12cqw)");
  o(s, "", "left:0;right:0;top:70%;bottom:0;background:#1a2333");
  o(s, "shadow", "left:50%;top:76%;width:34cqw;height:6cqw");
  const view = o(s, "", `inset:0;perspective:${W * 1.2}px`);
  const cube = o(view, "", "left:50%;top:50%;width:22cqw;height:22cqw;translate:-50% -50%;transform-style:preserve-3d");
  const face = (css, bg) => o(cube, "face", `background:${bg};transform:${css}`);
  const f = face("translateZ(11cqw)", "#ffd84d");
  o(f, "", "left:28%;top:36%;width:12%;aspect-ratio:1;border-radius:50%;background:#1d1f1c");
  o(f, "", "right:28%;top:36%;width:12%;aspect-ratio:1;border-radius:50%;background:#1d1f1c");
  face("rotateY(90deg) translateZ(11cqw)", "#ff9f43");
  face("rotateY(180deg) translateZ(11cqw)", "#5fb8ff");
  face("rotateY(-90deg) translateZ(11cqw)", "#7ee08a");
  face("rotateX(90deg) translateZ(11cqw)", "#ffe98a");
  A(cube, tf([[0, "rotateX(-16deg) rotateY(-30deg)", EIO], [1, "rotateX(-16deg) rotateY(-210deg)"]]), { d: 4400, dir: "alternate" });
  A(stripes, tf([[0, "translateX(0cqw)", EIO], [1, "translateX(24cqw)"]]), { d: 4400, dir: "alternate" });
  lab(s, "대상 둘레를 돌아요", "left:4%;top:6%");
});

def("truck", (s) => {
  const wall = o(s, "", "left:-30%;width:160%;top:0;height:74%;background:repeating-linear-gradient(#e9e2d4 0 13cqw,#cdbfa6 13cqw 14cqw)");
  for (let i = 0; i < 12; i++) o(wall, "jar", `left:${4 + i * 8}%;top:${i % 2 ? 31 : 56}%;scale:.45;opacity:.7`);
  const front = o(s, "", "left:-30%;width:160%;top:0;height:100%");
  o(front, "", "left:0;right:0;top:78%;bottom:0;background:#8a6a4a");
  for (let i = 0; i < 9; i++) o(front, "jar", `left:${6 + i * 11}%;top:80%`);
  A(wall, tf([[0, "translateX(0cqw)", EIO], [1, "translateX(-8cqw)"]]), { d: 4200, dir: "alternate" });
  A(front, tf([[0, "translateX(0cqw)", EIO], [1, "translateX(-36cqw)"]]), { d: 4200, dir: "alternate" });
  lab(s, "카메라가 옆으로 걸어가요", "left:4%;top:6%");
});

def("crane", (s) => {
  const W = world(s);
  [2, 8, 15, 24, 24, 38].forEach((d, i) => A(W.layers[i], tf([[0, "translateY(0cqw)", EIO], [1, `translateY(${d}cqw)`]]), { d: 4000, dir: "alternate" }));
  lab(s, "카메라가 위로 올라가요", "left:4%;top:6%");
});

def("roll", (s) => {
  const W = world(s);
  A(W.cam, tf([[0, "rotate(0deg) scale(1.3)", EIO], [0.3, "rotate(18deg) scale(1.3)", EIO], [0.7, "rotate(-18deg) scale(1.3)", EIO], [1, "rotate(0deg) scale(1.3)"]]), { d: 4000 });
});

def("handheld", (s) => {
  const W = world(s);
  A(W.cam, jitter(3, 9, 1.3, 0.9, 1.08));
  lab(s, "손에 든 듯 살짝 흔들려요", "left:4%;top:6%");
});

def("static", (s) => {
  const W = world(s);
  A(W.subj.n, tf([[0, "translateY(0cqw)"], [0.2, "translateY(0cqw)", "ease-out"], [0.3, "translateY(-6cqw)", "ease-in"], [0.4, "translateY(0cqw)"], [0.5, "translateY(0cqw)", "ease-out"], [0.6, "translateY(-6cqw)", "ease-in"], [0.7, "translateY(0cqw)"], [1, "translateY(0cqw)"]]));
  lab(s, "카메라는 고정, 대상만 움직여요", "left:4%;top:6%");
});

// ── 샷과 구도 ────────────────────────────────────

const SHOT = { closeup: "클로즈업", ecu: "익스트림 클로즈업", medium: "미디엄 숏", wide: "와이드 숏" };
function shotDemo(s, kind) {
  const room = o(s, "cam");
  o(room, "ph-room", "inset:0");
  if (kind === "wide") { o(room, "", "left:12%;top:30%;width:14cqw;height:18cqw;background:#bfe6ff;border:1cqw solid #fff"); o(room, "", "left:78%;top:44%;width:10cqw;height:16cqw;background:#3f8d5d;border-radius:50% 50% 10% 10%"); }
  const H = kind === "wide" ? 26 : 46, foot = 53, cx = 50, top = foot - H;
  fig(room, cx, foot, H);
  const [y0, h] = { closeup: [top - 0.03 * H, 0.44 * H], ecu: [top + 0.045 * H, 0.13 * H], medium: [top - 0.04 * H, 0.7 * H], wide: [top - 0.1 * H, 1.2 * H] }[kind];
  const w = (h * 16) / 9, x0 = cx - w / 2, k = 100 / w;
  room.style.transformOrigin = "0 0";
  const Z0 = "scale(1) translate(0cqw,0cqw)", Z1 = `scale(${k.toFixed(3)}) translate(${(-x0).toFixed(2)}cqw,${(-y0).toFixed(2)}cqw)`;
  A(room, tf([[0, Z0], [0.3, Z0, EIO], [0.55, Z1], [0.86, Z1, EIO], [1, Z0]]));
  A(o(s, "cropbox", `left:${x0}cqw;top:${y0}cqw;width:${w}cqw;height:${h}cqw`), op([[0, 0], [0.1, 0], [0.18, 1], [0.3, 1], [0.38, 0], [1, 0]]));
  A(lab(s, SHOT[kind], "left:4%;top:6%"), op([[0, 0], [0.5, 0], [0.56, 1], [0.84, 1], [0.88, 0], [1, 0]]));
}
["closeup", "ecu", "medium", "wide"].forEach((k) => def(k, (s) => shotDemo(s, k)));

def("establishing", (s) => {
  const p1 = o(s, "", "inset:0");
  world(p1, { withSub: false });
  o(p1, "house", "left:62%;top:79%");
  lab(p1, "설정 숏: 여기는 바닷가 연구소", "left:4%;top:6%");
  const p2 = o(s, "", "inset:0");
  o(p2, "ph-room", "inset:0");
  fig(p2, 50, 70, 64);
  lab(p2, "그다음 장면", "left:4%;top:6%");
  A(p2, show([[0, 0], [0.55, 1], [1, 0]]));
});

def("insert", (s) => {
  const p1 = o(s, "", "inset:0");
  o(p1, "ph-room", "inset:0");
  fig(p1, 50, 74, 66);
  o(p1, "tube", "left:64%;top:58%;scale:.5");
  const p2 = o(s, "", "inset:0;background:#2a3140");
  o(p2, "tube", "left:50%;top:50%;scale:2.2");
  for (let i = 0; i < 5; i++) o(p2, "", `left:53%;top:${34 + i * 7}%;width:5cqw;height:.5cqw;background:#fff`);
  lab(p2, "인서트: 눈금 1초", "left:4%;top:6%");
  A(p2, show([[0, 0], [0.4, 1], [0.72, 0]]));
});

def("birdseye", (s) => {
  o(s, "", "inset:0;background:#2a3140");
  const W = s.clientWidth || 320;
  const view = o(s, "", `inset:0;perspective:${W}px;perspective-origin:50% 20%`);
  const t = o(view, "", "left:50%;top:54%;width:62cqw;height:36cqw;translate:-50% -50%;background:#a87b54;border-radius:2cqw");
  o(t, "plate", "left:28%;top:50%;width:14cqw;aspect-ratio:1");
  o(t, "plate", "left:56%;top:44%;width:11cqw;aspect-ratio:1");
  o(t, "dot", "left:80%;top:60%;width:7cqw;background:#5fb8ff;box-shadow:inset 0 0 0 1.2cqw #3a7bd5");
  A(t, tf([[0, "rotateX(64deg)", EIO], [1, "rotateX(0deg)"]]), { d: 3600, dir: "alternate" });
  const l1 = lab(s, "옆에서", "left:4%;top:6%"), l2 = lab(s, "바로 위에서(탑뷰)", "left:4%;top:6%");
  tick(s, (t) => { const p = t < 0.5 ? t * 2 : (1 - t) * 2, top = p > 0.55; l1.style.opacity = top ? 0 : 1; l2.style.opacity = top ? 1 : 0; }, 7200);
});

def("angle", (s) => {
  const W = s.clientWidth || 320;
  const L = o(s, "", "left:0;top:0;width:50%;height:100%;overflow:hidden;background:linear-gradient(#5ea9e0,#cfeeff 82%,#66ae69 82%)");
  const R = o(s, "", "left:50%;top:0;width:50%;height:100%;overflow:hidden;background:#cdb79a");
  o(s, "", "left:50%;top:0;bottom:0;width:2px;background:#fff");
  o(L, "", "left:0;right:0;top:86%;bottom:0;background:#66ae69");
  const fl = fig(L, 25, 66, 80);
  fl.style.transformOrigin = "50% 100%";
  A(fl, tf([[0, `perspective(${W * 0.7}px) rotateX(16deg)`, "ease-in-out"], [1, `perspective(${W * 0.7}px) rotateX(24deg)`]]), { dir: "alternate" });
  const fr = fig(R, 25, 44, 28);
  fr.style.transformOrigin = "50% 0%";
  A(fr, tf([[0, `perspective(${W * 0.4}px) rotateX(-34deg)`, "ease-in-out"], [1, `perspective(${W * 0.4}px) rotateX(-44deg)`]]), { dir: "alternate" });
  lab(s, "로 앵글: 크고 강해 보임", "left:2%;top:4%;font-size:clamp(10px,2.6cqw,13px)");
  lab(s, "하이 앵글: 작아 보임", "left:52%;top:4%;font-size:clamp(10px,2.6cqw,13px)");
});

def("dutch", (s) => {
  const W = world(s);
  A(W.cam, tf([[0, "rotate(0deg) scale(1.25)"], [0.15, "rotate(0deg) scale(1.25)", EIO], [0.42, "rotate(-12deg) scale(1.25)"], [0.8, "rotate(-12deg) scale(1.25)", EIO], [1, "rotate(0deg) scale(1.25)"]]));
  A(lab(s, "기울인 채로 멈춤", "left:4%;top:6%"), op([[0, 0], [0.42, 0], [0.46, 1], [0.8, 1], [0.84, 0], [1, 0]]));
});

def("pov", (s) => {
  const c = o(s, "ph-cells", "inset:-10%;background-size:46cqw 30cqw");
  A(c, K([0, { transform: "translate(0cqw,0cqw) scale(1.1)", filter: "blur(2px)" }, "ease-in-out"], [0.3, { transform: "translate(-3cqw,1cqw) scale(1.1)", filter: "blur(0px)" }, "ease-in-out"], [0.7, { transform: "translate(3cqw,-1cqw) scale(1.1)", filter: "blur(0px)" }, "ease-in-out"], [1, { transform: "translate(0cqw,0cqw) scale(1.1)", filter: "blur(2px)" }]), { d: 4000 });
  o(s, "pov-mask");
  lab(s, "현미경을 들여다보는 눈", "left:4%;top:6%");
});

def("thirds", (s) => {
  o(s, "ph-sky", "inset:0");
  o(s, "", "left:0;right:0;top:78%;bottom:0;background:#66ae69");
  const c = sub(s, 50, 58, 22);
  A(c.n, tf([[0, "translate(0cqw,0cqw)"], [0.15, "translate(0cqw,0cqw)", EIO], [0.42, "translate(-16.7cqw,4.6cqw)"], [0.85, "translate(-16.7cqw,4.6cqw)", EIO], [1, "translate(0cqw,0cqw)"]]));
  const g = o(s, "grid3");
  A(g, op([[0, 0.9], [0.85, 0.9], [0.95, 0.4], [1, 0.9]]));
  A(o(s, "card2", "left:70%;top:34%;padding:.3em .7em;background:#fff;font-size:5cqw;white-space:nowrap", "글씨 자리"), tf([[0, "scale(0)"], [0.42, "scale(0)", OS], [0.52, "scale(1)"], [0.85, "scale(1)"], [0.9, "scale(0)"], [1, "scale(0)"]]));
});

def("negspace", (s) => {
  o(s, "", "inset:0;background:linear-gradient(#9fc6e8,#e9f3fb)");
  const c = sub(s, 50, 55, 24);
  A(c.n, tf([[0, "translate(0cqw,0cqw) scale(1.5)"], [0.15, "translate(0cqw,0cqw) scale(1.5)", EIO], [0.45, "translate(28cqw,12cqw) scale(.5)"], [0.85, "translate(28cqw,12cqw) scale(.5)", EIO], [1, "translate(0cqw,0cqw) scale(1.5)"]]));
  A(tx(s, "여백", "left:30%;top:36%;font-size:9cqw;color:#1d1f1c;text-shadow:none;opacity:.8"), op([[0, 0], [0.45, 0], [0.55, 1], [0.85, 1], [0.9, 0], [1, 0]]));
});

def("leadroom", (s) => {
  o(s, "ph-sea", "inset:0");
  const f = o(s, "fish", "left:84%;top:52%");
  div(f, "", null, "i");
  A(f, tf([[0, "translateX(0cqw)"], [0.42, "translateX(0cqw)", EIO], [0.58, "translateX(-56cqw)"], [0.9, "translateX(-56cqw)", EIO], [1, "translateX(0cqw)"]]), { d: 4000 });
  A(lab(s, "앞이 막혀 답답해요", "left:4%;top:6%;background:#e0453a"), op([[0, 1], [0.42, 1], [0.46, 0], [0.96, 0], [1, 1]]), { d: 4000 });
  A(lab(s, "보는 쪽을 비우면 편해요", "left:4%;top:6%;background:#2f7d4f"), op([[0, 0], [0.56, 0], [0.6, 1], [0.9, 1], [0.94, 0], [1, 0]]), { d: 4000 });
});

// ── 컷과 전환 ────────────────────────────────────

def("cut", (s) => {
  const { b } = ab(s);
  A(b, show([[0, 0], [0.5, 1]]));
  lab(s, "효과 없이 바로", "left:50%;top:6%;translate:-50% 0");
});

def("fade", (s) => {
  o(s, "", "inset:0;background:#000");
  const { a, b } = ab(s);
  A(a, op([[0, 1], [0.3, 1, "ease-in"], [0.45, 0], [0.92, 0, "ease-out"], [1, 1]]));
  A(b, op([[0, 0], [0.5, 0, "ease-out"], [0.65, 1], [0.82, 1, "ease-in"], [0.92, 0], [1, 0]]));
  A(lab(s, "검은 화면을 거쳐요", "left:50%;top:6%;translate:-50% 0"), op([[0, 0], [0.4, 0], [0.45, 1], [0.55, 1], [0.6, 0], [1, 0]]));
});

def("dissolve", (s) => {
  const { b } = ab(s);
  A(b, op([[0, 0], [0.32, 0, "ease-in-out"], [0.56, 1], [0.82, 1, "ease-in-out"], [1, 0]]));
  A(lab(s, "두 장면이 겹쳐요", "left:50%;top:6%;translate:-50% 0"), op([[0, 0], [0.36, 0], [0.4, 1], [0.52, 1], [0.56, 0], [1, 0]]));
});

def("jumpcut", (s) => {
  o(s, "ph-room", "inset:0");
  const c = sub(s, 50, 58, 30);
  A(c.n, tf(step([[0, "translate(-16cqw,0cqw) rotate(-4deg) scale(1)"], [0.33, "translate(6cqw,-2cqw) rotate(6deg) scale(1.12)"], [0.66, "translate(18cqw,1cqw) rotate(0deg) scale(.92)"]])));
  const l = lab(s, "툭", "left:4%;top:6%");
  tick(s, (t) => { l.textContent = t < 0.33 ? "툭" : t < 0.66 ? "툭, 툭" : "툭, 툭, 툭"; });
});

def("wipe", (s) => {
  const { b } = ab(s);
  A(b, K([0, { clipPath: "inset(0 100% 0 0)" }], [0.35, { clipPath: "inset(0 100% 0 0)" }, EIO], [0.55, { clipPath: "inset(0 0% 0 0%)" }], [0.85, { clipPath: "inset(0 0% 0 0%)" }, EIO], [1, { clipPath: "inset(0 0% 0 100%)" }]));
  const e = o(s, "", "left:0;top:0;bottom:0;width:1cqw;background:#fff;translate:-50% 0");
  A(e, K([0, { transform: "translateX(0cqw)", opacity: 0 }], [0.349, { transform: "translateX(0cqw)", opacity: 0 }], [0.35, { transform: "translateX(0cqw)", opacity: 1 }, EIO], [0.55, { transform: "translateX(100cqw)", opacity: 1 }], [0.551, { transform: "translateX(0cqw)", opacity: 0 }], [0.849, { transform: "translateX(0cqw)", opacity: 0 }], [0.85, { transform: "translateX(0cqw)", opacity: 1 }, EIO], [1, { transform: "translateX(100cqw)", opacity: 1 }]));
});

def("broll", (s) => {
  o(s, "ph-room", "inset:0");
  sub(s, 30, 64, 30);
  o(s, "bubble", "left:54%;top:40%;font-size:5cqw", "바다 민달팽이는요");
  lab(s, "A롤: 말하는 화면", "left:4%;top:6%");
  const b = o(s, "", "inset:0");
  o(b, "ph-sea", "inset:0");
  const slug = sub(b, 50, 66, 34, "#7ee08a");
  slug.n.style.aspectRatio = "2.2";
  lab(b, "B롤: 말하는 대상의 실제 모습", "left:4%;top:6%;background:#ffd84d;color:#1d1f1c");
  A(b, show([[0, 0], [0.35, 1], [0.75, 0]]));
});

def("matchcut", (s) => {
  const a = o(s, "", "inset:0;background:linear-gradient(#5ea9e0,#cfeeff)");
  o(a, "dot", "left:38%;top:46%;width:24cqw;background:#ffd84d;box-shadow:0 0 0 2cqw rgb(255 216 77 / .3)");
  lab(a, "해", "left:4%;top:6%");
  const b = o(s, "", "inset:0;background:#f6dfec");
  o(b, "dot", "left:38%;top:46%;width:24cqw;background:#c58bd8;box-shadow:inset 0 0 0 1.6cqw #a868c4");
  o(b, "dot", "left:40%;top:44%;width:7cqw;background:#6c2f88");
  lab(b, "세포", "left:4%;top:6%");
  A(b, show([[0, 0], [0.5, 1]]));
  lab(s, "같은 자리, 같은 동그라미", "left:50%;top:86%;translate:-50% 0");
});

def("zoomtrans", (s) => {
  const { a, b } = ab(s);
  a.style.transformOrigin = "32% 50%";
  A(a, K([0, { transform: "scale(1)", filter: "blur(0px)", opacity: 1 }], [0.3, { transform: "scale(1)", filter: "blur(0px)", opacity: 1 }, "ease-in"], [0.45, { transform: "scale(3.4)", filter: "blur(8px)", opacity: 1 }], [0.451, { transform: "scale(1)", filter: "blur(0px)", opacity: 0 }], [0.88, { transform: "scale(1)", filter: "blur(0px)", opacity: 0 }], [1, { transform: "scale(1)", filter: "blur(0px)", opacity: 1 }]));
  A(b, K([0, { transform: "scale(1.9)", filter: "blur(8px)", opacity: 0 }], [0.45, { transform: "scale(1.9)", filter: "blur(8px)", opacity: 0 }], [0.451, { transform: "scale(1.9)", filter: "blur(8px)", opacity: 1 }, "ease-out"], [0.62, { transform: "scale(1)", filter: "blur(0px)", opacity: 1 }], [0.88, { transform: "scale(1)", filter: "blur(0px)", opacity: 1 }], [1, { transform: "scale(1)", filter: "blur(0px)", opacity: 0 }]));
});

function cutTimeline(s, sw, name) {
  const pic = o(s, "", "left:0;top:0;width:100%;height:62%;overflow:hidden");
  const { b } = ab(pic);
  A(b, show([[0, 0], [0.5, 1]]), { d: 4000 });
  const sa = lab(pic, "들리는 소리: A", "right:4%;top:8%;background:#1f4f8f");
  const sb = lab(pic, "들리는 소리: B", "right:4%;top:8%;background:#d6572b");
  A(sa, show([[0, 1], [sw, 0]]), { d: 4000 });
  A(sb, show([[0, 0], [sw, 1]]), { d: 4000 });
  o(s, "", "left:0;right:0;top:62%;bottom:0;background:#0d1117");
  lab(s, "그림", "left:2%;top:72%;background:transparent;padding:0");
  lab(s, "소리", "left:2%;top:86%;background:transparent;padding:0");
  const x = (t) => 15 + 82 * t;
  const blk = (y, t0, t1, c, t) => o(s, "blk", `left:${x(t0)}%;width:${x(t1) - x(t0) - 0.6}%;top:${y}%;background:${c}`, t);
  blk(70, 0, 0.5, "#3a7bd5", "A");
  blk(70, 0.5, 1, "#f39a45", "B");
  blk(85, 0, sw, "#3a7bd5", "A");
  blk(85, sw, 1, "#f39a45", "B");
  A(o(s, "playhead", "left:15%;top:64%;height:34%"), tf([[0, "translateX(0cqw)"], [1, "translateX(82cqw)"]]), { d: 4000 });
  lab(pic, name, "left:4%;top:8%");
}
def("jcut", (s) => cutTimeline(s, 0.36, "B 소리가 먼저"));
def("lcut", (s) => cutTimeline(s, 0.64, "A 소리가 이어짐"));

def("flash", (s) => {
  const { b } = ab(s);
  A(b, show([[0, 0], [0.5, 1]]));
  A(o(s, "", "inset:0;background:#fff"), op([[0, 0], [0.46, 0, "ease-in"], [0.5, 1, "ease-out"], [0.64, 0], [1, 0]]));
});

def("smashcut", (s) => {
  const a = o(s, "ph-night", "inset:0");
  const c = sub(a, 40, 64, 26);
  c.eyes.forEach((e) => (e.style.transform = "scaleY(.15)"));
  A(tx(a, "쿨쿨", "left:62%;top:30%;font-size:6cqw;opacity:.8"), tf([[0, "translateY(0cqw)", "ease-in-out"], [1, "translateY(-3cqw)"]]), { d: 1600, dir: "alternate" });
  const b = o(s, "", "inset:0;background:radial-gradient(circle,#ffd84d,#ff4d2e 70%)");
  sub(b, 40, 64, 30, "#fff3c4").eyes.forEach((e) => (e.style.scale = "1.6"));
  tx(b, "쾅!", "left:72%;top:36%;font-size:20cqw;color:#fff;-webkit-text-stroke:.6cqw #1d1f1c");
  A(b, show([[0, 0], [0.5, 1]]));
  A(b, jitter(11, 6, 2.4, 2, 1.04, 0.5, 0.64));
});

def("morph", (s) => {
  const pts = (inner) => {
    const out = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? inner : 50;
      out.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
    }
    return `polygon(${out.join(",")})`;
  };
  const circle = pts(50), star = pts(21);
  const n = o(s, "", "left:50%;top:50%;width:34cqw;aspect-ratio:1;translate:-50% -50%");
  A(n, K([0, { clipPath: circle, background: "#ffd84d", transform: "rotate(0deg)" }], [0.15, { clipPath: circle, background: "#ffd84d", transform: "rotate(0deg)" }, EIO], [0.5, { clipPath: star, background: "#ff8a3d", transform: "rotate(36deg)" }], [0.65, { clipPath: star, background: "#ff8a3d", transform: "rotate(36deg)" }, EIO], [1, { clipPath: circle, background: "#ffd84d", transform: "rotate(0deg)" }]));
});

// ── 화면 효과 ────────────────────────────────────

def("motionblur", (s) => {
  [["모션 블러 없음", false, 30], ["모션 블러", true, 74]].forEach(([name, blur, y]) => {
    lab(s, name, `left:4%;top:${y - 18}%`);
    o(s, "track", `left:8%;right:8%;top:${y}%`);
    const b = o(s, "ball big", `left:14%;top:${y}%;width:9cqw`);
    const P = (x, m) => ({ transform: `translateX(${x}cqw) scaleX(${blur ? 1 + m * 1.3 : 1})`, filter: `blur(${blur ? m * 2.6 : 0}px)` });
    A(b, K([0, P(0, 0)], [0.2, P(0, 0), "ease-in"], [0.27, P(36, 1), "ease-out"], [0.34, P(72, 0)], [0.66, P(72, 0), "ease-in"], [0.73, P(36, 1), "ease-out"], [0.8, P(0, 0)], [1, P(0, 0)]));
  });
});

def("shake", (s) => {
  const cam = o(s, "cam");
  o(cam, "ph-sea", "inset:-6%");
  const st = o(cam, "card2", "left:50%;top:50%;padding:.2em .6em;background:#e0453a;color:#fff;font-size:12cqw;rotate:-8deg;white-space:nowrap", "3주 뒤");
  A(st, tf([[0, "scale(0)"], [0.22, "scale(0)"], [0.223, "scale(2.2)", "cubic-bezier(.5,0,.75,0)"], [0.3, "scale(1)"], [0.88, "scale(1)"], [0.94, "scale(0)"], [1, "scale(0)"]]));
  A(cam, jitter(5, 8, 2.2, 1.4, 1.06, 0.3, 0.46));
});

def("grading", (s) => {
  const base = o(s, "", "inset:0");
  world(base);
  const top = o(s, "", "inset:0;filter:sepia(.55) saturate(1.5) hue-rotate(-18deg) contrast(1.08) brightness(.95)");
  world(top);
  A(top, K([0, { clipPath: "inset(0 100% 0 0)" }], [0.15, { clipPath: "inset(0 100% 0 0)" }, EIO], [0.5, { clipPath: "inset(0 0% 0 0)" }], [0.8, { clipPath: "inset(0 0% 0 0)" }, EIO], [1, { clipPath: "inset(0 100% 0 0)" }]));
  lab(s, "원본", "right:4%;top:6%");
  A(lab(s, "그레이딩: 따뜻하고 바랜 색", "left:4%;top:6%"), op([[0, 0], [0.3, 0], [0.36, 1], [0.84, 1], [0.9, 0], [1, 0]]));
});

def("glitch", (s) => {
  o(s, "", "inset:0;background:#0d1117");
  const T = "다 믿으세요?";
  const r = tx(s, T, "left:50%;top:50%;font-size:11cqw;color:#ff2d55;mix-blend-mode:screen;opacity:.9");
  const c = tx(s, T, "left:50%;top:50%;font-size:11cqw;color:#00e5ff;mix-blend-mode:screen;opacity:.9");
  tx(s, T, "left:50%;top:50%;font-size:11cqw;mix-blend-mode:screen");
  const R = rnd(21);
  const glitchRows = (sign) => {
    const rows = [[0, "translate(0cqw,0cqw)", "inset(0 0 0 0)"]];
    for (const [a, b2] of [[0.3, 0.42], [0.7, 0.76]]) {
      rows.push([a, "translate(0cqw,0cqw)", "inset(0 0 0 0)"]);
      for (let k = 0; k < 4; k++) {
        const t0 = a + ((b2 - a) * (k + 0.5)) / 4;
        const y1 = Math.round(R() * 60), y2 = Math.round(R() * 30);
        rows.push([t0, `translate(${(sign * (0.8 + R() * 1.8)).toFixed(2)}cqw,0cqw)`, `inset(${y1}% 0 ${y2}% 0)`]);
      }
      rows.push([b2, "translate(0cqw,0cqw)", "inset(0 0 0 0)"]);
    }
    rows.push([1, "translate(0cqw,0cqw)", "inset(0 0 0 0)"]);
    return rows.map(([offset, transform, clipPath]) => ({ offset, transform, clipPath, easing: "steps(1, end)" }));
  };
  A(r, glitchRows(-1));
  A(c, glitchRows(1));
});

def("speedlines", (s) => {
  o(s, "", "inset:0;background:#2a3a8a");
  const rays = o(s, "rays");
  A(rays, F("transform", [[0, "rotate(0deg) scale(1)"], [0.25, "rotate(2deg) scale(1.03)"], [0.5, "rotate(-1deg) scale(.98)"], [0.75, "rotate(3deg) scale(1.02)"], [1, "rotate(0deg) scale(1)"]].map(([t, v]) => [t, v, "steps(1, end)"])), { d: 600 });
  A(tx(s, "머리만!", "left:50%;top:50%;font-size:14cqw;color:#ffd84d;-webkit-text-stroke:.5cqw #1d1f1c"), tf([[0, "scale(0)"], [0.1, "scale(0)", OS], [0.24, "scale(1)"], [0.88, "scale(1)"], [0.94, "scale(0)"], [1, "scale(0)"]]));
});

def("bgblur", (s) => {
  const bg = o(s, "ph-sea", "inset:-5%");
  sub(bg, 30, 66, 22);
  A(bg, F("filter", [[0, [0, 1]], [0.2, [0, 1], EIO], [0.42, [8, 0.6]], [0.84, [8, 0.6], EIO], [1, [0, 1]]], ([b, k]) => `blur(${b}px) brightness(${k})`));
  A(o(s, "card2", "left:50%;top:50%;padding:.4em .9em;background:#fff;font-size:6cqw;white-space:nowrap", "글씨가 잘 보여요"), tf([[0, "scale(0)"], [0.36, "scale(0)", OS], [0.48, "scale(1)"], [0.82, "scale(1)"], [0.88, "scale(0)"], [1, "scale(0)"]]));
});

def("lightleak", (s) => {
  const base = o(s, "", "inset:0");
  world(base);
  const l1 = o(s, "leak", "left:20%;top:30%;background:radial-gradient(circle,rgb(255 150 60 / .95),rgb(255 90 60 / .45) 40%,transparent 70%)");
  const l2 = o(s, "leak", "left:20%;top:80%;width:50cqw;height:50cqw;background:radial-gradient(circle,rgb(255 120 170 / .8),transparent 65%)");
  A(l1, K([0, { transform: "translateX(-50cqw)", opacity: 0 }], [0.15, { transform: "translateX(-30cqw)", opacity: 0.9 }], [0.6, { transform: "translateX(40cqw)", opacity: 0.9 }], [0.85, { transform: "translateX(80cqw)", opacity: 0 }], [1, { transform: "translateX(80cqw)", opacity: 0 }]), { d: 4000 });
  A(l2, K([0, { transform: "translateX(-40cqw)", opacity: 0 }], [0.3, { transform: "translateX(-10cqw)", opacity: 0.8 }], [0.75, { transform: "translateX(60cqw)", opacity: 0.6 }], [1, { transform: "translateX(90cqw)", opacity: 0 }]), { d: 4000 });
});

def("flare", (s) => {
  o(s, "ph-dusk", "inset:0");
  o(s, "", "left:0;right:0;top:74%;bottom:0;background:#1d1a2a");
  const sx0 = 18, sx1 = 82, sy = 26, cx = 50, cy = 50;
  const at = (k, x) => [x + (cx - x) * k, sy + (cy - sy) * k];
  const sun = o(s, "flare", "left:0;top:0;width:16cqw;aspect-ratio:1;background:radial-gradient(circle,#fff 0 18%,rgb(255 230 160 / .8) 30%,transparent 70%)");
  const disc = [[0.7, 6, "rgb(120 200 255 / .35)"], [1.2, 3, "rgb(255 200 120 / .5)"], [1.6, 9, "rgb(160 255 200 / .25)"], [2, 4.6, "rgb(255 140 200 / .4)"]];
  const move = (n, k) => {
    const [x0, y0] = at(k, sx0), [x1, y1] = at(k, sx1);
    A(n, K([0, { left: `${x0}%`, top: `${y0}%` }, "ease-in-out"], [1, { left: `${x1}%`, top: `${y1}%` }]), { d: 4000, dir: "alternate" });
  };
  move(sun, 0);
  disc.forEach(([k, w, c]) => move(o(s, "flare", `width:${w}cqw;aspect-ratio:1;background:${c}`), k));
});

let grainId = 0;
def("grain", (s) => {
  o(s, "ph-sea", "inset:0");
  sub(s, 50, 62, 26);
  const id = "gr" + grainId++;
  const g = document.createElementNS(NS, "svg");
  g.setAttribute("class", "o");
  g.style.cssText = "left:-50%;top:-50%;width:200%;height:200%;opacity:.45;mix-blend-mode:overlay";
  const f = sv(sv(g, "defs"), "filter", { id });
  sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", stitchTiles: "stitch" });
  sv(f, "feColorMatrix", { type: "saturate", values: "0" });
  sv(g, "rect", { width: "100%", height: "100%", filter: `url(#${id})` });
  s.append(g);
  const R = rnd(9);
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ offset: i / 8, transform: `translate(${(R() * 20 - 10).toFixed(1)}%,${(R() * 20 - 10).toFixed(1)}%)`, easing: "steps(1, end)" });
  rows.push({ offset: 1, transform: rows[0].transform });
  A(g, rows, { d: 640 });
  lab(s, "자글자글한 필름 입자", "left:4%;top:6%");
});

def("vignette", (s) => {
  o(s, "ph-sea", "inset:0");
  sub(s, 50, 58, 28);
  A(o(s, "", "inset:0;background:radial-gradient(ellipse at center,transparent 42%,rgb(0 0 0 / .8) 100%)"), op([[0, 0, "ease-in-out"], [1, 1]]), { dir: "alternate" });
});

// ── 시간과 속도 ──────────────────────────────────

def("slowmo", (s) => {
  [[25, 900, "보통 속도"], [75, 3600, "0.25배 슬로 모션"]].forEach(([x, d, name]) => {
    lab(s, name, `left:${x}%;top:5%;translate:-50% 0`);
    A(o(s, "drop", `left:${x}%;top:20%`), K([0, { transform: "translateY(0cqw)", opacity: 1 }, "ease-in"], [0.7, { transform: "translateY(30cqw)", opacity: 1 }], [0.72, { transform: "translateY(30cqw)", opacity: 0 }], [1, { transform: "translateY(0cqw)", opacity: 0 }]), { d });
    A(o(s, "ring", `left:${x}%;top:76%;width:14cqw;height:4cqw;border-color:#8fd3ff;border-width:.5cqw`), K([0, { transform: "scale(0)", opacity: 0 }], [0.7, { transform: "scale(0)", opacity: 1 }, "ease-out"], [1, { transform: "scale(1.3)", opacity: 0 }]), { d });
  });
  o(s, "", "left:50%;top:0;bottom:0;width:2px;background:rgb(255 255 255 / .25)");
});

def("speedramp", (s) => {
  o(s, "track", "left:10%;right:8%;top:58%");
  A(o(s, "ball big", "left:10%;top:58%;width:8cqw"), tf([[0, "translateX(0cqw)", "linear"], [0.2, "translateX(32cqw)", "linear"], [0.7, "translateX(50cqw)", "linear"], [0.82, "translateX(82cqw)"], [1, "translateX(82cqw)"]]));
  const l = lab(s, "2배", "left:50%;top:14%;translate:-50% 0;font-size:clamp(13px,4.4cqw,20px)");
  tick(s, (t) => { l.textContent = t < 0.2 ? "2배로 빠르게" : t < 0.7 ? "0.3배로 느리게" : t < 0.82 ? "다시 2배" : "끝"; });
});

def("freeze", (s) => {
  const scene = o(s, "", "inset:0");
  const W = world(scene);
  A(scene, F("filter", [[0, 0], [0.4, 0], [0.401, 0.85], [0.75, 0.85], [0.751, 0], [1, 0]], (v) => `grayscale(${v})`));
  A(W.subj.n, tf([[0, "translateY(0cqw)", "ease-out"], [0.4, "translateY(-16cqw)"], [0.75, "translateY(-16cqw)", "ease-in"], [0.88, "translateY(0cqw)"], [1, "translateY(0cqw)"]]));
  A(o(s, "", "inset:0;background:#fff"), op([[0, 0], [0.4, 0], [0.405, 0.9, "ease-out"], [0.5, 0], [1, 0]]));
  A(o(s, "ring", "left:50%;top:38%;width:30cqw;aspect-ratio:1;border-width:.9cqw"), tf([[0, "scale(0)"], [0.44, "scale(0)", OS], [0.52, "scale(1)"], [0.75, "scale(1)"], [0.76, "scale(0)"], [1, "scale(0)"]]));
  A(lab(s, "멈춤!", "left:4%;top:6%;background:#e0453a"), op([[0, 0], [0.44, 0], [0.46, 1], [0.75, 1], [0.76, 0], [1, 0]]));
});

def("timelapse", (s) => {
  const sky = o(s, "", "inset:0");
  A(sky, F("backgroundColor", [[0, "#7cc4f0"], [0.35, "#7cc4f0"], [0.5, "#e88a5a"], [0.62, "#1a2340"], [0.86, "#1a2340"], [1, "#7cc4f0"]]), { d: 4000 });
  const sx = o(s, "", "left:8%;top:62%;width:0;height:0");
  A(sx, tf([[0, "translateX(0cqw)"], [0.55, "translateX(84cqw)"], [1, "translateX(84cqw)"]]), { d: 4000 });
  A(o(sx, "sun", "left:0;top:0"), tf([[0, "translateY(0cqw)", "ease-out"], [0.27, "translateY(-26cqw)", "ease-in"], [0.55, "translateY(0cqw)"], [1, "translateY(0cqw)"]]), { d: 4000 });
  o(s, "", "left:0;right:0;top:72%;bottom:0;background:#6b4a2f");
  const stem = o(s, "", "left:50%;bottom:28%;width:1.4cqw;height:30cqw;background:#3f8d5d;translate:-50% 0;transform-origin:50% 100%;border-radius:99px");
  A(stem, tf([[0, "scaleY(.08)"], [0.9, "scaleY(1)"], [1, "scaleY(1)"]]), { d: 4000 });
  [[0.35, -1, 46], [0.6, 1, 34]].forEach(([t, side, top]) => A(o(s, "leaf", `left:${50 + side * 6}%;top:${top}%;width:12cqw;height:6cqw;rotate:${side * -20}deg`), tf([[0, "scale(0)"], [t, "scale(0)", OS], [t + 0.1, "scale(1)"], [1, "scale(1)"]]), { d: 4000 }));
  const l = lab(s, "1일째", "left:4%;top:6%");
  tick(s, (t) => { l.textContent = `${Math.min(21, 1 + Math.floor(t * 22))}일째`; }, 4000);
});

// ── 화면 ─────────────────────────────────────────

const $ = (q, r = document) => r.querySelector(q);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

const RANK = new Map(TERMS.map((t, i) => [t.id, i + 1]));
const BY = new Map(TERMS.map((t) => [t.id, t]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const S = { view: "rank", cat: "all", q: "", onlyNow: false, motion: !reduce };
try {
  const saved = JSON.parse(localStorage.getItem("terms-ui") || "{}");
  if (saved.view === "cat") S.view = "cat";
  if (typeof saved.motion === "boolean") S.motion = saved.motion;
} catch {}
const remember = () => { try { localStorage.setItem("terms-ui", JSON.stringify({ view: S.view, motion: S.motion })); } catch {} };

// 예시 돌리기 ─ 보이는 카드만
const live = new Map();
function build(st) {
  if (live.has(st)) return live.get(st);
  BAG = { anims: [], ticks: [], playing: false };
  try { DEMOS[st.dataset.demo]?.(st); } catch (e) { console.error(st.dataset.demo, e); }
  const b = BAG;
  BAG = null;
  live.set(st, b);
  return b;
}
function poster(b) {
  for (const a of b.anims) a.currentTime = a.effect.getTiming().duration * 0.62;
  for (const k of b.ticks) k.fn(0.62);
}
function play(st) {
  const b = build(st);
  b.anims.forEach((a) => a.play());
  b.playing = true;
  st.parentElement?.querySelector(".play")?.remove();
  frame();
}
function pause(st) {
  const b = live.get(st);
  if (!b) return;
  b.anims.forEach((a) => a.pause());
  b.playing = false;
}
let rafOn = false;
function frame() {
  if (rafOn) return;
  rafOn = true;
  requestAnimationFrame(function loop() {
    let any = false;
    for (const b of live.values()) {
      if (!b.playing || !b.ticks.length) continue;
      any = true;
      for (const k of b.ticks) k.fn(((k.clock.currentTime || 0) % k.d) / k.d);
    }
    if (any) requestAnimationFrame(loop);
    else rafOn = false;
  });
}
function addPlayButton(st) {
  const wrap = st.parentElement;
  if (!wrap || wrap.querySelector(".play")) return;
  wrap.append(h("button", { class: "play", type: "button", onclick: () => play(st) }, "움직임 보기"));
}
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const st = e.target;
    if (e.isIntersecting) {
      if (S.motion) play(st);
      else { poster(build(st)); addPlayButton(st); }
    } else pause(st);
  }
}, { rootMargin: "120px 0px" });

// 카드
function card(t) {
  const r = RANK.get(t.id);
  const st = h("div", { class: "st", "data-demo": t.id, "aria-hidden": "true" });
  const srcs = [...(t.src || "")];
  const say = h("p", {}, t.say);
  const copyBtn = h("button", { class: "btn", type: "button", onclick: async () => {
    const ok = await copy(t.say);
    copyBtn.textContent = ok ? "복사했어요" : "복사 못 했어요. 글을 길게 눌러 복사해 주세요";
    setTimeout(() => (copyBtn.textContent = "메모 문장 복사"), 1800);
  } }, "메모 문장 복사");
  return h("article", { class: "card", id: `t-${t.id}` },
    h("div", { class: "card-top" },
      h("span", { class: "rank" }, `${r}위`),
      h("span", { class: "tag" }, CATS[t.cat].name),
      t.now ? h("span", { class: "tag ok" }, "지금 바로 돼요") : null),
    h("h3", {}, t.ko, h("span", { class: "en", lang: "en" }, t.en)),
    h("div", { class: "stw" }, st),
    h("dl", {},
      h("dt", {}, "뜻"), h("dd", {}, t.what),
      h("dt", {}, "느낌"), h("dd", {}, t.feel),
      h("dt", {}, "쓰는 곳"), h("dd", {}, t.use),
      t.vs ? [h("dt", {}, "헷갈리면"), h("dd", {}, t.vs)] : null),
    t.now ? h("p", { class: "now" }, h("b", {}, "우리 영상에서 "), t.now) : null,
    h("div", { class: "say" }, h("b", {}, "콘티 메모에 이렇게"), say, copyBtn),
    h("p", { class: "src" }, srcs.length ? `용어집 ${srcs.length}곳에 실림 (${srcs.join(", ")})` : "실무 표현 (이번에 본 용어집 10곳에는 없음)"));
}
async function copy(text) {
  if (window.isSecureContext && navigator.clipboard) {
    // 권한 창이 안 뜨는 곳에서는 끝나지 않을 때가 있어 0.8초만 기다린다
    const ok = await Promise.race([navigator.clipboard.writeText(text).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 800))]);
    if (ok) return true;
  }
  // 아이폰에서 http://100.x 주소로 열면 navigator.clipboard 가 없다 → 옛 방식으로 복사
  const ta = h("textarea", { readonly: true, style: "position:fixed;top:0;opacity:0" });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  ta.remove();
  return ok;
}

const norm = (x) => (x || "").toLowerCase().replace(/\s+/g, "");
function matches(t) {
  if (S.cat !== "all" && t.cat !== S.cat) return false;
  if (S.onlyNow && !t.now) return false;
  if (!S.q) return true;
  return norm([t.ko, t.en, t.alias, t.what, t.feel, t.use, CATS[t.cat].name].join(" ")).includes(norm(S.q));
}

const cards = new Map(TERMS.map((t) => [t.id, card(t)]));

function tierOf(r) { return TIERS.findIndex((x) => r <= x.to); }

function renderGrid() {
  const grid = $("#grid");
  const list = TERMS.filter(matches);
  const parts = [];
  if (!list.length) parts.push(h("p", { class: "empty" }, "찾는 용어가 없어요. 다른 말로 찾아보거나 고른 분류를 풀어 보세요."));
  else if (S.view === "rank") {
    let last = -1;
    for (const t of list) {
      const r = RANK.get(t.id), ti = tierOf(r);
      if (ti !== last) {
        const from = ti ? TIERS[ti - 1].to + 1 : 1;
        parts.push(h("div", { class: "group-head" }, h("h2", {}, `${from}~${TIERS[ti].to}위`, h("small", {}, TIERS[ti].name))));
        last = ti;
      }
      parts.push(cards.get(t.id));
    }
  } else {
    for (const [key, c] of Object.entries(CATS)) {
      const inCat = list.filter((t) => t.cat === key);
      if (!inCat.length) continue;
      parts.push(h("div", { class: "group-head", id: `cat-${key}` }, h("h2", {}, c.name, h("small", {}, `${inCat.length}개`)), h("p", {}, c.desc)));
      parts.push(...inCat.map((t) => cards.get(t.id)));
    }
  }
  grid.replaceChildren(...parts);
  $("#count").textContent = list.length === TERMS.length ? `${TERMS.length}개 전부` : `${TERMS.length}개 중 ${list.length}개`;
  for (const [id, el] of cards) {
    const st = el.querySelector(".st");
    if (el.isConnected) seen.observe(st);
    else { seen.unobserve(st); pause(st); }
  }
}

function renderControls() {
  const counts = {};
  for (const t of TERMS) counts[t.cat] = (counts[t.cat] || 0) + 1;
  const chip = (key, name, n) => h("button", { class: "chip", type: "button", "aria-pressed": String(S.cat === key), onclick: () => { S.cat = key; renderControls(); renderGrid(); } }, name, h("small", {}, n));
  const nowN = TERMS.filter((t) => t.now).length;
  $("#controls").replaceChildren(
    h("div", { class: "row" },
      h("div", { class: "seg", role: "group", "aria-label": "보는 방식" },
        h("button", { type: "button", "aria-pressed": String(S.view === "rank"), onclick: () => { S.view = "rank"; remember(); renderControls(); renderGrid(); } }, "순위순"),
        h("button", { type: "button", "aria-pressed": String(S.view === "cat"), onclick: () => { S.view = "cat"; remember(); renderControls(); renderGrid(); } }, "분류별")),
      h("button", { class: "chip now-chip", type: "button", "aria-pressed": String(S.onlyNow), onclick: () => { S.onlyNow = !S.onlyNow; renderControls(); renderGrid(); } }, h("span", { class: "dot-ok" }), "지금 바로 되는 것만", h("small", {}, nowN)),
      h("button", { class: "chip", type: "button", "aria-pressed": String(!S.motion), onclick: toggleMotion }, S.motion ? "예시 움직임 멈추기" : "예시 움직임 켜기"),
      h("span", { class: "count", id: "count", "aria-live": "polite" })),
    h("div", { class: "row", role: "group", "aria-label": "분류 고르기" },
      chip("all", "전체", TERMS.length),
      ...Object.entries(CATS).map(([k, c]) => chip(k, c.name, counts[k]))),
    h("p", { class: "note" }, h("span", { class: "dot-ok" }), "초록 표시는 많이 쓰는 렌더 도구(Remotion 등)에 이미 있는 기능이라 메모만 적으면 AI가 바로 반영하기 쉬워요. 나머지도 메모에 적으면 AI가 만들어 붙여요."));
}
function toggleMotion() {
  S.motion = !S.motion;
  remember();
  for (const [st, b] of live) {
    if (!st.isConnected) continue;
    if (S.motion) { const r = st.getBoundingClientRect(); if (r.bottom > -120 && r.top < innerHeight + 120) play(st); }
    else { pause(st); poster(b); addPlayButton(st); }
  }
  renderControls();
  renderGrid();
}

function renderFeels() {
  $("#feels").replaceChildren(...FEELS.map((f) => h("div", { class: "feel" },
    h("q", {}, f.said),
    h("div", { class: "to" }, f.ids.map((id) => h("a", { class: "chip-link", href: `#t-${id}`, onclick: (e) => jump(e, id) }, BY.get(id).ko.replace(/ \(.*\)$/, "")))))));
}

function renderRanks() {
  $("#ranks").replaceChildren(...TIERS.map((tier, i) => {
    const from = i ? TIERS[i - 1].to + 1 : 1;
    const list = TERMS.slice(from - 1, tier.to);
    return h("div", { class: "tier" },
      h("h3", {}, `${from}~${tier.to}위`, h("small", {}, tier.name)),
      h("ol", { start: from }, list.map((t) => h("li", {}, h("a", { href: `#t-${t.id}`, onclick: (e) => jump(e, t.id) }, t.ko.replace(/ \(.*\)$/, "")), h("span", { class: "c" }, CATS[t.cat].name)))));
  }));
}

function jump(e, id) {
  e?.preventDefault();
  const t = BY.get(id);
  if (!matches(t)) { S.cat = "all"; S.onlyNow = false; S.q = ""; $("#q").value = ""; renderControls(); renderGrid(); }
  const el = cards.get(id);
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  history.replaceState(null, "", `#t-${id}`);
}

function renderSources() {
  $("#sources").replaceChildren(...Object.entries(SOURCES).map(([k, v]) => h("li", {}, h("b", {}, k), h("a", { href: v.url, target: "_blank", rel: "noopener" }, v.name))));
}

$("#q").addEventListener("input", (e) => { S.q = e.target.value.trim(); renderGrid(); });
renderFeels();
renderRanks();
renderControls();
renderGrid();
renderSources();
const first = location.hash.match(/^#t-([\w-]+)$/);
if (first && BY.has(first[1])) setTimeout(() => jump(null, first[1]), 60);
