// photo-layout.js — 記録写真の純粋計算（DOM / ストア非依存）。tests/test.html から import してテストする。
// 仕様: docs/06_仕様_記録写真.md 4.4〜4.5
import { slash, fromKey, validSets, itemRM, f2, fw, setW } from './calc.js';

export const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** カードの寸法（px。描画時に u × scale を掛ける） */
export const CARD = { pad: 18, head: 36, row: 40, gap: 14, radius: 16, padX: 20 };
/** 「他 N 種目」の行に確保する高さ（カード群との間隔 14 + 文字 22。u のみ掛ける・scale は掛けない） */
export const OTHERS_H = 36;
const SCALE_MIN = 0.6, SCALE_STEP = 0.05;

/** 1枚のカードの高さ（px） */
export const cardH = (sets, u, scale) => (CARD.pad * 2 + CARD.head + CARD.row * sets) * u * scale;
/** カード群に必要な高さ（px）= Σカード高 + 間隔 × (枚数 − 1) */
export function needH(setCounts, u, scale) {
  if (!setCounts.length) return 0;
  return setCounts.reduce((a, n) => a + cardH(n, u, scale), 0) + CARD.gap * u * scale * (setCounts.length - 1);
}

/**
 * 収まるように縮小率と描く種目数を決める。
 *   scale 1.0 から 0.05 刻みで 0.6 まで下げ、need ≤ avail になる最初の scale を採用。
 *   0.6 でも収まらなければ 0.6 のまま末尾から種目を外し、「他 N 種目」の行（OTHERS_H × u）を含めて収まる最大枚数にする。
 * @returns {{ scale: number, count: number }}
 */
export function fitPlan(setCounts, availPx, u) {
  const n = setCounts.length;
  if (!n) return { scale: 1, count: 0 };
  for (let k = 0; ; k++) {
    const scale = Math.round((1 - SCALE_STEP * k) * 100) / 100;
    if (scale < SCALE_MIN) break;
    if (needH(setCounts, u, scale) <= availPx) return { scale, count: n };
  }
  let count = n - 1;
  while (count > 0 && needH(setCounts.slice(0, count), u, SCALE_MIN) + OTHERS_H * u > availPx) count--;
  return { scale: SCALE_MIN, count };
}

/**
 * 写真に描く文字列を作る（描画は photo.js）。
 *   day が無い・有効セットのある種目が無い → items: []。セットのメモは載せない。
 * @returns {{ date: string, sub: string, items: {name:string,color:string,rm:string,sets:{n:number,w:string,r:number,assist:boolean}[]}[] }}
 */
export function photoText(day, dateKey, todayKey, exName, exColor) {
  const d = fromKey(dateKey);
  const items = (day && Array.isArray(day.items) ? day.items : []).filter(it => validSets(it).length > 0).map(it => ({
    name: exName(it.ex), color: exColor(it.ex), rm: f2(itemRM(it)),
    sets: validSets(it).map((s, i) => ({ n: i + 1, w: fw(setW(s)), r: s.r, assist: !!s.assist })),
  }));
  return { date: slash(dateKey), sub: '(' + WD[d.getDay()] + ')' + (dateKey === todayKey ? ' 今日' : ''), items };
}
