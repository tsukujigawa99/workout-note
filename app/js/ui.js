// ui.js — 画面共通の描画ヘルパー（エスケープ、アイコン、ヘッダ、グラフ、期間切替、トースト）
import { S } from './state.js';
import { f1, chartTicks } from './calc.js';
import { store } from './store.js';

export const $ = s => document.querySelector(s);
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** ユーザー入力文字列は必ずこれを通してから HTML に埋め込む */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const IC = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
  body: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 9a4 4 0 018 0M12 9l1.5-2.5',
  set: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4', back: 'M15 5l-7 7 7 7', plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1', timer: 'M12 9v4l3 2M9 2h6M12 5a8 8 0 100 16 8 8 0 000-16z', check: 'M5 12l5 5 9-10',
  bell: 'M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12', next: 'M9 5l7 7-7 7', trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', x: 'M6 6l12 12M18 6L6 18',
  up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
};
export const ic = n => n === 'skin'
  ? '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 010 18z" fill="currentColor"/></svg>'
  : '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC[n] + '"/></svg>';

/** サブ画面のヘッダ。back=false で戻るボタン無し（タブ直下の画面）。title は生文字列（内部でエスケープ） */
export function bar(title, sub, right, backBtn = true) {
  return '<header class="bar">' + (backBtn ? '<button class="iconbtn" data-act="back" aria-label="戻る">' + ic('back') + '</button>' : '<span></span>')
    + '<h1>' + esc(title) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</h1>' + (right || '<span></span>') + '</header>';
}

/** 折れ線グラフ。pts = [{x:ラベル, y:数値}] */
export function chart(pts) {
  if (pts.length < 2) return '<p class="muted" style="padding:12px 2px;margin:0">記録が2回以上になるとグラフが表示されます。</p>';
  const W = 340, H = 150, L = 40, R = 12, T = 12, B = 22, ys = pts.map(p => p.y);
  let mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys); if (mn === mx) { mn -= 1; mx += 1; }
  const g = (mx - mn) * .18; mn -= g; mx += g;
  const X = i => L + (W - L - R) * i / (pts.length - 1), Y = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
  const lbl = v => (Math.abs(v) >= 10000 ? String(Math.round(v)) : f1(v));
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
  const ticks = chartTicks(ys).map(v =>'<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + lbl(v) + '</text>').join('');
  const n = pts.length - 1, lp = pts[n];
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="推移グラフ">' + ticks
    + '<path d="' + line + ' L' + X(n).toFixed(1) + ' ' + (H - B) + ' L' + L + ' ' + (H - B) + ' Z" fill="var(--accent)" fill-opacity=".12" stroke="none"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>'
    + '<circle cx="' + X(n).toFixed(1) + '" cy="' + Y(lp.y).toFixed(1) + '" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>'
    + '<text x="' + L + '" y="' + (H - 6) + '">' + esc(pts[0].x) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(lp.x) + '</text></svg>';
}

/** 期間切替（1か月〜全期間） */
export const seg = () => '<div class="seg" role="group" aria-label="期間">' + [[30, '1か月'], [90, '3か月'], [180, '半年'], [365, '1年'], [0, '全期間']]
  .map(a => '<button class="' + (S.range === a[0] ? 'on' : '') + '" data-act="range" data-arg="' + a[0] + '" aria-pressed="' + (S.range === a[0]) + '">' + a[1] + '</button>').join('') + '</div>';

let toastH = 0, ghostH = 0, toastFn = null;
const GHOST_MS = 600;
/** opt = { action:'元に戻す', onAction:fn, ms:5000 } でボタン付きトースト */
export function toast(msg, opt) {
  const t = $('#toast'); if (!t) return;
  clearTimeout(ghostH); t.classList.remove('ghost');
  t.textContent = msg;
  toastFn = opt && opt.onAction ? opt.onAction : null;
  t.classList.toggle('act', !!toastFn);
  if (toastFn) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.act = 'toastAct'; b.textContent = opt.action || '元に戻す';
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toastH); toastH = setTimeout(hideToast, (opt && opt.ms) || 2400);
}
/**
 * トーストを消す。ボタン付きトーストは、消えた直後に同じ位置をタップしても下のボタン（補助など）に
 * 抜けないよう、約600ms は透明のまま同じ場所に残してクリックを吸収する。now=true で即時に消す
 */
export function hideToast(now) {
  const t = $('#toast'); toastFn = null; clearTimeout(toastH);
  if (!t) return;
  if (now !== true && t.classList.contains('ghost')) return;      // 吸収中のタップで吸収時間を延ばさない
  clearTimeout(ghostH);
  if (now !== true && !t.hidden && t.classList.contains('act')) {
    t.classList.add('ghost');
    ghostH = setTimeout(() => { t.hidden = true; t.classList.remove('ghost'); }, GHOST_MS);
  } else { t.hidden = true; t.classList.remove('ghost'); }
}
/** ボタン付きトーストだけを消す（画面遷移時。元に戻す対象が無くなるため） */
export function dropActionToast() { if (toastFn) hideToast(true); }
export function runToastAction() { const f = toastFn; hideToast(); if (f) f(); }

/* ---------- マスタ参照 ---------- */
export const parts = () => store.master().parts;
export const exercises = () => store.master().exercises;
export const exOf = id => exercises().find(e => e.id === id) || null;
export const partOf = id => parts().find(p => p.id === id) || null;
export const exName = id => { const e = exOf(id); return e ? e.name : '（不明な種目）'; };
export const exColor = id => { const e = exOf(id), p = e && partOf(e.part); return p ? p.color : 'var(--ink-2)'; };
export const dot = color => '<i class="dot" style="background:' + esc(color) + '"></i>';
