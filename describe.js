// 장면(Remotion 의 Scene)을 사람이 읽는 말로. 화면(app.js)과 내보내기 도구(tools/story2conti.mjs)가 같이 쓴다.

export const KIND = {
  grid: "노트 바탕",
  photo: "사진 바탕",
  archive: "옛 사진 바탕",
  burst: "강조 화면",
  mascot: "캐릭터 화면",
  doc: "자료 카드",
  dark: "어두운 바탕",
  black: "검은 화면",
};

// 글씨를 가진 요소: 화면에서 글자를 바로 고칠 수 있다
export const TEXT_EL = { say: "말풍선", label: "글씨", card: "카드", stamp: "도장", tile: "칸", type: "타자 글씨" };

export const EL = {
  ...TEXT_EL,
  img: "그림",
  vid: "영상 조각",
  arrow: "화살표",
  x: "X 표시",
  o: "O 표시",
  q: "물음표",
  count: "숫자 세기",
  bars: "막대그래프",
  panel: "판",
  ring: "동그라미 강조",
  zoombox: "강조 상자",
  button: "좋아요·구독 단추",
  dia: "도식",
};

export const base = (p) => (p || "").split("/").pop().replace(/\.(jpe?g|png|webp|mp4|mov)$/i, "");
const quote = (t) => `「${String(t).replace(/\*\*/g, "").replace(/\n/g, " ")}」`;

export function elText(e) {
  switch (e.t) {
    case "img": return `${e.inset ? "끼운 사진" : "그림"} ${base(e.src)}`;
    case "vid": return `영상 조각 ${base(e.src)}`;
    case "count": return `숫자 ${e.prefix || ""}${e.from ?? 0}→${e.to}${e.suffix || ""}`;
    case "bars": return `막대그래프${e.title ? " " + quote(e.title) : ""}`;
    case "dia": return `도식 ${e.name}`;
    case "button": return e.kind === "like" ? "좋아요 단추" : "구독 단추";
    case "tile": return `칸 ${quote(e.text)}${e.img ? ` + 그림 ${base(e.img)}` : ""}`;
    default:
      if (e.text != null) return `${EL[e.t] || e.t} ${quote(e.text)}`;
      return EL[e.t] || e.t;
  }
}

/** 장면 한 줄 설명. 예: "사진 바탕 tree-flower · 글씨 「아이폰 AI」 · 끼운 사진 iphone-apricot" */
export function describe(s) {
  const head = [];
  if (s.kind === "photo" || s.kind === "archive") head.push(`${KIND[s.kind]} ${base(s.bg)}`);
  else if (s.kind === "burst") head.push(`${KIND.burst} ${quote(s.text || "")}`);
  else if (s.kind === "mascot") head.push(`캐릭터 ${s.who || ""}`);
  else if (s.kind === "doc" && s.doc) head.push(`${KIND.doc} ${quote(s.doc.ko || s.doc.title)} (${s.doc.authors}, ${s.doc.year})`);
  else head.push(KIND[s.kind] || s.kind || "화면");
  const fx = [];
  if (s.zoom === "in") fx.push("천천히 다가감");
  if (s.zoom === "out") fx.push("천천히 멀어짐");
  if (s.blur) fx.push("흐리게");
  if (s.cut === "flash") fx.push("번쩍 전환");
  if (fx.length) head.push(fx.join(", "));
  const els = (s.els || []).map(elText);
  return [...head, ...els].join(" · ");
}
