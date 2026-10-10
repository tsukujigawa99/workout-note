// photo-themes.js — 記録写真のデザイン（ノーマル／かわいい／おしゃれ／かっこいい）。仕様: docs/07_仕様_記録写真デザイン.md
//
// 各テーマは { label, fonts, sample, headerH(u), bottomReserve(H), others, drawBackdrop, drawHeader, drawCard, drawDecor }。
// 描画の共有情報 g = { W, H, u, m, P, x0, pos, text, style, C, headTop, plan, s }（photo.js の compose() が作る）。
// normal は v1.2.1 の photo.js の描画をそのまま移したもの（見た目を変えない）。
import { CARD } from './photo-layout.js';

export const FONT_D = '"Oswald","Arial Narrow","Noto Sans JP",sans-serif';
export const FONT_B = '"Noto Sans JP","Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif';
const MARU = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP","Meiryo",sans-serif';
const YOMO = '"Yomogi","Zen Maru Gothic","Noto Sans JP","Meiryo",sans-serif';
const CORM = '"Cormorant Garamond","Times New Roman",Georgia,serif';
const MIN = '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho","MS Mincho",serif';
const VIBES = '"Great Vibes","Brush Script MT","Segoe Script",cursive';
const MARKER = '"Permanent Marker","Impact","Arial Black",sans-serif';

/** ノーマルの白／黒カード */
export const STYLES = {
  white: { bg: 'rgba(255,255,255,.88)', ink: '#2B2021', ink2: '#706364' },
  black: { bg: 'rgba(20,16,17,.80)', ink: '#F1EBEB', ink2: '#9C8F8F' },
};

/* ---------- 共通の補助 ---------- */
export const px = (n, f) => Math.round(n * 100) / 100 + 'px ' + f;
const DEG = Math.PI / 180;
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
/** maxW に収まらない文字列は末尾を … で切る */
export function clip(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1) { t = t.slice(0, -1); if (ctx.measureText(t + '…').width <= maxW) return t + '…'; }
  return '…';
}
/** 字間付きの英字（ctx.letterSpacing が無い環境のため 1 文字ずつ描く）。sp は字間 px。戻り値は全体の幅 */
function spaced(ctx, s, x, y, sp, align) {
  const chars = Array.from(s), ws = chars.map(c => ctx.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, chars.length - 1);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  const prev = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += ws[i] + sp; });
  ctx.textAlign = prev;
  return total;
}
function spacedW(ctx, s, sp) { const chars = Array.from(s); return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + sp * Math.max(0, chars.length - 1); }
/** 複数行の文字列（配列）を lh 間隔で描く */
function lines(ctx, arr, x, y, lh) { arr.forEach((t, i) => ctx.fillText(t, x, y + lh * i)); }
const maxW = (ctx, arr) => arr.reduce((a, t) => Math.max(a, ctx.measureText(t).width), 0);
/** 角を中心に rad 回転して fn() を描く */
function rotated(ctx, x, y, rad, fn) { ctx.save(); ctx.translate(x, y); ctx.rotate(rad); fn(); ctx.restore(); }
/** 反転後の曜日表記: text.sub '(木) 今日' → { wd:'木', today:true } */
const subOf = text => { const mt = /\((.)\)/.exec(text.sub || ''); return { wd: mt ? mt[1] : '', today: /今日/.test(text.sub || '') }; };
/** 見出しが幅 P に収まらない時の縮小率 */
const shrink = (w, P) => (w > P ? P / w : 1);

/* ---------- 簡単な線画 ---------- */
function heart(ctx, x, y, s, fill) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 0.9, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 0.9, -s * 0.35, 0, s * 0.35);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } else ctx.stroke();
  ctx.restore();
}
/** 4 つ星（きらめき） */
function star4(ctx, x, y, r, color) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath();
  const k = r * 0.28;
  ctx.moveTo(x, y - r); ctx.lineTo(x + k, y - k); ctx.lineTo(x + r, y); ctx.lineTo(x + k, y + k);
  ctx.lineTo(x, y + r); ctx.lineTo(x - k, y + k); ctx.lineTo(x - r, y); ctx.lineTo(x - k, y - k);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function crown(ctx, x, y, w, color) {
  const h = w * 0.7;
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = '#D9A520'; ctx.lineWidth = Math.max(1, w * 0.06); ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w * 0.25, y - h * 0.55); ctx.lineTo(x + w * 0.5, y - h * 0.1); ctx.lineTo(x + w * 0.75, y - h * 0.55);
  ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.9, y + h * 0.45); ctx.lineTo(x + w * 0.1, y + h * 0.45); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w * 0.5, y - h * 0.45, w * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function smile(ctx, x, y, r, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, r * 0.14); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.5, 20 * DEG, 160 * DEG); ctx.stroke();
  ctx.restore();
}
/** ダンベルの線画（幅 w、中心 (x,y)） */
function dumbbell(ctx, x, y, w, color) {
  const h = w * 0.42, pw = w * 0.12, ph = h, pw2 = w * 0.08, ph2 = h * 0.62;
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, w * 0.08); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - w * 0.3, y); ctx.lineTo(x + w * 0.3, y); ctx.stroke();
  [-1, 1].forEach(d => {
    rrect(ctx, x + d * w * 0.34 - pw / 2, y - ph / 2, pw, ph, pw * 0.35); ctx.stroke();
    rrect(ctx, x + d * w * 0.46 - pw2 / 2, y - ph2 / 2, pw2, ph2, pw2 * 0.35); ctx.stroke();
  });
  ctx.restore();
}
function checkbox(ctx, x, y, s, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  rotated(ctx, x, y, -4 * DEG, () => { ctx.strokeRect(0, -s, s, s); ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.5); ctx.lineTo(s * 0.45, -s * 0.2); ctx.lineTo(s * 1.0, -s * 1.05); ctx.stroke(); });
  ctx.restore();
}
/** 手書き風マーカー線（少し傾き） */
function marker(ctx, x, y, w, t, color, tilt) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = t; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + w * Math.tan((tilt || 0) * DEG)); ctx.stroke(); ctx.restore();
}
/** 右上・左下の角を c だけ斜めに切った六角形 */
function hexCard(ctx, x, y, w, h, c) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.closePath();
}
/** 飾り側（パネルと反対側）の x。f = 外側の端からの割合（0〜1）、off = px */
function decoX(g, f, off) {
  const dw = g.x0 - 2 * g.m;                               // 飾り側の幅（左右対称）
  return g.pos === 'right' ? g.m + dw * f + (off || 0) : g.W - g.m - dw * f - (off || 0);
}
const decoAlign = g => (g.pos === 'right' ? 'left' : 'right');
const mirror = g => (g.pos === 'right' ? 1 : -1);          // 飾り側の向き（右パネル = 飾りは左 = +1）

/* ---------- セット行の共通描画（番号／重量 右揃え／×／reps／補助） ---------- */
function setRows(ctx, it, inL, ay, rowH, s, o) {
  it.sets.forEach((set, j) => {
    const ry = ay + rowH * j + rowH / 2 + 9.4 * s;
    ctx.font = o.font; ctx.fillStyle = o.ink; ctx.textAlign = 'left';
    ctx.fillText(String(set.n), inL + 12 * s, ry);
    ctx.textAlign = 'right'; ctx.fillText(set.w + (o.kg || ' kg'), inL + 150 * s, ry);
    ctx.textAlign = 'left'; ctx.fillStyle = o.ink2; if (o.xFont) ctx.font = o.xFont; ctx.fillText('×', inL + 170 * s, ry);
    ctx.font = o.font; ctx.fillStyle = o.ink; const reps = set.r + ' reps'; ctx.fillText(reps, inL + 196 * s, ry);
    if (set.assist) {
      const rw = ctx.measureText(reps).width;
      ctx.font = o.assistFont; ctx.fillStyle = o.ink2; ctx.fillText(' 補助', inL + 196 * s + rw, ry);
    }
  });
}

/* ================= normal（v1.2.1 の描画そのまま） ================= */
const normal = {
  label: 'ノーマル',
  fonts: [['600 64px Oswald', 'num'], ['500 20px Oswald', 'num'], ['400 26px Oswald', 'num'],
    ['700 26px "Noto Sans JP"', 'ja'], ['500 26px "Noto Sans JP"', 'ja'], ['400 18px "Noto Sans JP"', 'ja'], ['500 22px "Noto Sans JP"', 'ja']],
  sample: { num: '', ja: '' },
  headerH: u => 102 * u,                 // 64（日付）+ 14 + 2（線）+ 22
  bottomReserve: () => 0,
  others: { ink: '#FFFFFF', shadow: 'rgba(0,0,0,.55)' },
  drawBackdrop() { /* 写真そのまま */ },
  drawHeader(ctx, g) {
    const { x0, P, u, text, headTop } = g, base1 = headTop + 64 * u;
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u;
    ctx.textAlign = 'left';
    ctx.font = '600 ' + px(64 * u, FONT_D); ctx.fillText(text.date, x0, base1);
    const dw = ctx.measureText(text.date + ' ').width;
    ctx.font = '500 ' + px(26 * u, FONT_B); ctx.fillText(text.sub, x0 + dw, base1);
    const lineY = base1 + 14 * u;
    ctx.fillRect(x0, lineY, P, 2 * u);
    ctx.restore();
  },
  drawCard(ctx, g, it, i, y, h, scale) {
    const { x0, P, u, C } = g, s = u * scale;
    const pad = CARD.pad * s, padX = CARD.padX * s, headH = CARD.head * s, rowH = CARD.row * s;
    const inL = x0 + padX, inR = x0 + P - padX;
    ctx.fillStyle = C.bg; rrect(ctx, x0, y, P, h, CARD.radius * s); ctx.fill();
    const cy = y + pad + headH / 2, by = cy + 9.4 * s;
    ctx.fillStyle = /^#|^rgb|^hsl/i.test(it.color) ? it.color : C.ink2;
    ctx.beginPath(); ctx.arc(inL + 7 * s, cy, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.font = '500 ' + px(20 * s, FONT_D); ctx.fillStyle = C.ink2; ctx.textAlign = 'right';
    const rmTxt = 'RM : ' + it.rm + 'kg', rmW = ctx.measureText(rmTxt).width;
    ctx.fillText(rmTxt, inR, by);
    ctx.font = '700 ' + px(26 * s, FONT_B); ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    const nx = inL + 14 * s + 10 * s;
    ctx.fillText(clip(ctx, it.name, inR - rmW - 12 * s - nx), nx, by);
    setRows(ctx, it, inL, y + pad + headH, rowH, s, { font: '400 ' + px(26 * s, FONT_D), assistFont: '400 ' + px(18 * s, FONT_B), ink: C.ink, ink2: C.ink2 });
  },
  drawDecor() { /* 飾りなし */ },
};

/* ================= cute（かわいい） ================= */
const NAVY = '#2F3A56', PINK = '#FF8FB1', GRAY = '#7A7A8C', YELLOW = '#F5C542';
const BANDS = ['#FFD6E3', '#D6E8FF', '#FFF1B8', '#E6D9FF'];
const NOTES = [['パンプ', '最高♡'], ['効いた!!'], ['最後まで', 'やりきった!']];
/** 手書き文字: Yomogi は細いので同色の細い縁（bold）で太らせる。outline を渡すと先に白などの縁取りを付ける（写真の上に直接置く時） */
function hand(ctx, t, x, y, color, bold, outline, ow) {
  ctx.save(); ctx.lineJoin = 'round';
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = ow; ctx.strokeText(t, x, y); }
  ctx.fillStyle = color; ctx.fillText(t, x, y);
  if (bold) { ctx.strokeStyle = color; ctx.lineWidth = bold; ctx.strokeText(t, x, y); }
  ctx.restore();
}
const outlined = (ctx, t, x, y, stroke, w) => hand(ctx, t, x, y, ctx.fillStyle, w * 0.2, stroke, w);
/** 手書きの日付: 1 文字ずつ描き、'.' の送り幅を measureText の 45% に詰める（Yomogi のピリオドは右の空きが広いため）。縁取り→本体の 2 パス */
const DOT_ADV = 0.45;
const tightW = (ctx, t) => Array.from(t).reduce((a, c) => a + ctx.measureText(c).width * (c === '.' ? DOT_ADV : 1), 0);
function tightHand(ctx, t, x, y, color, bold, outline, ow) {
  const chars = Array.from(t), adv = chars.map(c => ctx.measureText(c).width * (c === '.' ? DOT_ADV : 1));
  ctx.save(); ctx.lineJoin = 'round'; ctx.textAlign = 'left';
  const pass = (fill, stroke, lw) => { let cx = x; chars.forEach((c, i) => { if (fill) ctx.fillText(c, cx, y); if (lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(c, cx, y); } cx += adv[i]; }); };
  if (outline) pass(false, outline, ow);
  ctx.fillStyle = color; pass(true, color, bold);
  ctx.restore();
}
/** 角丸ラベル（少し傾き）の上に複数行。戻り値 { w, h } */
function label(ctx, g, x, top, arr, font, lh, padX, padY, bg, ink, align, tilt, extraW) {
  const u = g.u;
  ctx.font = font;
  const w = maxW(ctx, arr) + padX * 2 + (extraW || 0), h = lh * arr.length + padY * 2 - lh * 0.25;
  const lx = align === 'right' ? x - w : x;
  rotated(ctx, lx, top, tilt * DEG, () => {
    ctx.fillStyle = bg; rrect(ctx, 0, 0, w, h, 14 * u); ctx.fill();
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = font;
    arr.forEach((t, i) => hand(ctx, t, padX, padY + lh * 0.72 + lh * i, ink, u * 0.8));
  });
  return { w, h };
}
const cute = {
  label: 'かわいい',
  fonts: [['700 26px "Zen Maru Gothic"', 'ja'], ['500 26px "Zen Maru Gothic"', 'num'], ['500 18px "Zen Maru Gothic"', 'num'], ['500 26px "Zen Maru Gothic"', 'ja'],
    ['400 60px Yomogi', 'num'], ['400 34px Yomogi', 'ja'], ['400 30px Yomogi', 'ja'], ['400 22px Yomogi', 'ja'], ['400 40px Yomogi', 'ja'], ['400 28px Yomogi', 'num'], ['500 22px "Noto Sans JP"', 'ja']],
  sample: { num: 'BetterMe GoodWorkout 2026.10.08', ja: '今日もがんばった継続は最強また明日もがんばろう水をのむたんぱく質とるゆっくり寝るパンプ最高♡効いた!!最後までやりきった!（木）今日' },
  headerH: u => 106 * u,                 // 60（日付）+ 10（マーカー）+ 36
  bottomReserve: H => 0.16 * H,
  others: { ink: NAVY, shadow: 'rgba(255,255,255,.9)', outline: 'rgba(255,255,255,.9)' },
  drawBackdrop(ctx, g) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 0, g.W, g.H); },
  drawHeader(ctx, g) {
    const { x0, P, u, text, headTop } = g, sub = subOf(text), base1 = headTop + 60 * u;
    const date = text.date.replace(/\//g, '.'), wdTxt = '(' + sub.wd + ')' + (sub.today ? ' 今日' : '');
    ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = NAVY;
    ctx.font = px(60 * u, YOMO); let dw = tightW(ctx, date);
    ctx.font = px(34 * u, YOMO); let sw = ctx.measureText(wdTxt).width;
    const k = shrink(dw + 6 * u + sw + 40 * u, P);          // 収まらなければ縮小（右のハートの分も）
    ctx.font = px(60 * u * k, YOMO); dw = tightW(ctx, date);
    // マーカー線（文字の下、少し傾き）→ 文字
    marker(ctx, x0 - 4 * u, base1 + 4 * u, dw + 8 * u, 10 * u, 'rgba(255,150,180,.55)', -1);
    tightHand(ctx, date, x0, base1, NAVY, 2 * u, 'rgba(255,255,255,.9)', 8 * u);
    ctx.font = px(34 * u * k, YOMO); sw = ctx.measureText(wdTxt).width; hand(ctx, wdTxt, x0 + dw + 10 * u, base1, NAVY, 1.2 * u, 'rgba(255,255,255,.9)', 6 * u);
    // きらめき・ハート
    star4(ctx, x0 - 22 * u, base1 - 50 * u, 9 * u, '#FFFFFF'); star4(ctx, x0 - 36 * u, base1 - 30 * u, 6 * u, NAVY);
    star4(ctx, x0 + dw + sw + 30 * u, base1 - 58 * u, 8 * u, NAVY);
    heart(ctx, x0 + dw + sw + 24 * u, base1 - 14 * u, 11 * u, PINK);
    heart(ctx, x0 + dw + sw + 42 * u, base1 - 32 * u, 7 * u, PINK);
    // パネル右上: ダンベル ＋ Good Workout ♡
    const gx = x0 + P - 10 * u, top = 26 * u;
    if (headTop > 90 * u) {
      dumbbell(ctx, gx - 50 * u, top, 70 * u, NAVY);
      ctx.font = px(20 * u, YOMO); ctx.textAlign = 'right'; ctx.fillStyle = NAVY;
      hand(ctx, 'Good', gx - 22 * u, top + 38 * u, NAVY, 0.8 * u, 'rgba(255,255,255,.9)', 5 * u); hand(ctx, 'Workout', gx - 22 * u, top + 62 * u, NAVY, 0.8 * u, 'rgba(255,255,255,.9)', 5 * u);
      heart(ctx, gx - 8 * u, top + 54 * u, 7 * u, PINK);
    }
    ctx.restore();
  },
  drawCard(ctx, g, it, i, y, h, scale) {
    const { x0, P, u } = g, s = u * scale;
    const pad = CARD.pad * s, padX = CARD.padX * s, headH = CARD.head * s, rowH = CARD.row * s;
    const inL = x0 + padX, inR = x0 + P - padX;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 16 * s; ctx.shadowOffsetY = 4 * s;
    rrect(ctx, x0, y, P, h, 22 * s); ctx.fill(); ctx.restore();
    // 見出し行: パステルの帯（ダンベル＋種目名）… RM
    const cy = y + pad + headH / 2, by = cy + 9.4 * s;
    ctx.font = '500 ' + px(18 * s, MARU); ctx.fillStyle = GRAY; ctx.textAlign = 'right';
    const rmTxt = 'RM : ' + it.rm + 'kg', rmW = ctx.measureText(rmTxt).width;
    ctx.fillText(rmTxt, inR, by);
    ctx.font = '700 ' + px(26 * s, MARU); ctx.textAlign = 'left';
    const nx = inL + 34 * s, name = clip(ctx, it.name, inR - rmW - 12 * s - nx - 12 * s), nw = ctx.measureText(name).width;
    ctx.fillStyle = BANDS[i % BANDS.length]; rrect(ctx, inL - 8 * s, cy - 17 * s, nx + nw + 12 * s - (inL - 8 * s), 34 * s, 12 * s); ctx.fill();
    dumbbell(ctx, inL + 10 * s, cy, 26 * s, NAVY);
    ctx.fillStyle = NAVY; ctx.fillText(name, nx, by);
    // セット行
    const ay = y + pad + headH;
    setRows(ctx, it, inL, ay, rowH, s, { font: '500 ' + px(26 * s, MARU), xFont: '400 ' + px(22 * s, FONT_D), assistFont: '500 ' + px(18 * s, MARU), ink: NAVY, ink2: GRAY });
    // 右側の空きに手書きの一言（窮屈な時は描かない）
    const free = inR - (inL + 300 * s);
    if (scale >= 0.8 && it.sets.length >= 2 && free >= 120 * s) {
      const note = i === 0 ? [it.part ? it.part : '', 'がんばった!!'].filter(Boolean) : NOTES[(i - 1) % NOTES.length];
      const cx = inL + 300 * s + free / 2, lh = 27 * s, iconH = 26 * s, bh = lh * note.length + iconH;
      const topY = ay + (rowH * it.sets.length - bh) / 2;
      ctx.font = px(22 * s, YOMO); ctx.fillStyle = NAVY; ctx.textAlign = 'center';
      if (i === 0) {
        crown(ctx, cx - 13 * s, topY + 14 * s, 26 * s, YELLOW);
        note.forEach((t, j) => hand(ctx, t, cx, topY + iconH + lh * (j + 0.75), NAVY, 0.7 * s));
      } else {
        note.forEach((t, j) => {
          const hasHeart = t.endsWith('♡'), tt = hasHeart ? t.slice(0, -1) : t, ty = topY + lh * (j + 0.75);
          hand(ctx, tt, cx - (hasHeart ? 8 * s : 0), ty, NAVY, 0.7 * s);
          if (hasHeart) heart(ctx, cx + ctx.measureText(tt).width / 2 + 4 * s, ty - 6 * s, 8 * s, PINK);
        });
        smile(ctx, cx, topY + lh * note.length + 11 * s, 10 * s, NAVY);
      }
    }
  },
  drawDecor(ctx, g) {
    const { W, H, u, m, x0, P, headTop } = g, al = decoAlign(g), d = mirror(g);
    ctx.save(); ctx.textAlign = 'left';
    // 上: 今日も がんばった ☺（白ラベル）
    const lx = decoX(g, 0, 6 * u), top1 = Math.max(16 * u, headTop - 36 * u);
    const r1 = label(ctx, g, lx, top1, ['今日も', 'がんばった'], px(30 * u, YOMO), 38 * u, 16 * u, 10 * u, 'rgba(255,255,255,.85)', NAVY, al, -3 * d, 34 * u);
    rotated(ctx, al === 'right' ? lx - r1.w : lx, top1, -3 * d * DEG, () => { smile(ctx, r1.w - 24 * u, r1.h - 24 * u, 12 * u, NAVY); star4(ctx, r1.w + 10 * u, 2 * u, 6 * u, NAVY); });
    // ハート・きらめき（飾り側、パネル寄り）
    heart(ctx, decoX(g, 0.72), 0.19 * H, 14 * u, PINK); heart(ctx, decoX(g, 0.82), 0.225 * H, 9 * u, PINK);
    star4(ctx, decoX(g, 0.9), 0.31 * H, 8 * u, '#FFFFFF'); star4(ctx, decoX(g, 0.96), 0.48 * H, 10 * u, '#FFFFFF'); star4(ctx, decoX(g, 0.9), 0.53 * H, 6 * u, '#FFFFFF');
    // 中ほど: Better Me♡（上と同じ白ラベルの上に濃紺。明るい壁の上でも読めるように）
    const bx = decoX(g, 0, 6 * u), btop = 0.4 * H - 30 * u;
    const r2 = label(ctx, g, bx, btop, ['Better', 'Me'], px(28 * u, YOMO), 34 * u, 16 * u, 10 * u, 'rgba(255,255,255,.85)', NAVY, al, -3 * d, 22 * u);
    rotated(ctx, al === 'right' ? bx - r2.w : bx, btop, -3 * d * DEG, () => {
      ctx.font = px(28 * u, YOMO); const mw = ctx.measureText('Me').width;
      heart(ctx, 16 * u + mw + 14 * u, r2.h - 10 * u - 24 * u, 8 * u, PINK);
      marker(ctx, 12 * u, r2.h - 8 * u, mw + 50 * u, 5 * u, 'rgba(255,150,180,.7)', -2);
    });
    // 下: 水色ラベルのチェックリスト
    const list = ['水をのむ', 'たんぱく質とる', 'ゆっくり寝る'], lh = 36 * u, padX = 18 * u + 30 * u, padY = 14 * u;
    ctx.font = px(22 * u, YOMO);
    const lw = maxW(ctx, list) + padX + 18 * u + 30 * u, lhgt = lh * list.length + padY * 2 - lh * 0.25;
    const ltop = H - m - lhgt - 6 * u, llx = decoX(g, 0, 4 * u);
    rotated(ctx, al === 'right' ? llx - lw : llx, ltop, -2 * d * DEG, () => {
      ctx.fillStyle = 'rgba(214,232,255,.9)'; rrect(ctx, 0, 0, lw, lhgt, 14 * u); ctx.fill();
      ctx.fillStyle = NAVY; ctx.textAlign = 'left'; ctx.font = px(22 * u, YOMO);
      list.forEach((t, i) => { const yy = padY + lh * (i + 0.72); checkbox(ctx, 18 * u, yy, 18 * u, NAVY); hand(ctx, t, padX, yy, NAVY, u * 0.8); });
      smile(ctx, lw - 26 * u, lhgt - 26 * u, 11 * u, NAVY);
    });
    // パネル側の下: 継続は 最強 ＋ 王冠 ／ また明日も がんばろう ☺
    const ry0 = H - g.bottomReserve;
    ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = px(40 * u, YOMO);
    const kx = x0 + 30 * u, k1 = ry0 + 56 * u, k2 = k1 + 50 * u;
    outlined(ctx, '継続は', kx, k1, 'rgba(255,255,255,.95)', 6 * u); outlined(ctx, '最強', kx + 16 * u, k2, 'rgba(255,255,255,.95)', 6 * u);
    crown(ctx, kx + 16 * u + ctx.measureText('最強').width + 10 * u, k2 - 24 * u, 30 * u, YELLOW);
    star4(ctx, kx + ctx.measureText('継続は').width + 16 * u, k1 - 30 * u, 7 * u, NAVY);
    ctx.font = px(22 * u, YOMO);
    const left = g.pos === 'left', a1 = H - m - 34 * u, a2 = a1 + 28 * u;
    ctx.textAlign = left ? 'left' : 'right';
    const ax = left ? x0 + 30 * u : x0 + P - 46 * u, aw = ctx.measureText('また明日も').width;
    outlined(ctx, 'また明日も', ax, a1, 'rgba(255,255,255,.95)', 4 * u); outlined(ctx, 'がんばろう', ax, a2, 'rgba(255,255,255,.95)', 4 * u);
    smile(ctx, left ? ax + aw + 18 * u : ax + 22 * u, a2 - 8 * u, 11 * u, NAVY);
    heart(ctx, Math.min(W - m - 6 * u, x0 + P - 8 * u), ry0 + 20 * u, 8 * u, PINK);
    ctx.restore();
  },
};

/* ================= chic（おしゃれ） ================= */
const W80 = 'rgba(255,255,255,.8)', W85 = 'rgba(255,255,255,.85)';
const chic = {
  label: 'おしゃれ',
  fonts: [['500 22px "Cormorant Garamond"', 'num'], ['600 96px "Cormorant Garamond"', 'num'], ['500 20px "Cormorant Garamond"', 'num'],
    ['500 28px "Noto Serif JP"', 'ja'], ['500 24px "Noto Serif JP"', 'ja'], ['500 22px "Noto Serif JP"', 'ja'],
    ['400 56px "Great Vibes"', 'num'], ['400 64px "Great Vibes"', 'num'], ['400 24px "Noto Sans JP"', 'num'], ['400 18px "Noto Sans JP"', 'ja'], ['500 22px "Noto Sans JP"', 'ja']],
  sample: { num: 'WORKOUT LOG SMALL STEPS BIG CHANGES Better Than Yesterday Keep Training 01234567890/', ja: '今日の積み重ねが、明日の自分をつくる。（木）今日' },
  headerH: u => 242 * u,                 // 18（WORKOUT LOG）+ 100（日付）+ 24（線）+ 40（曜日）+ 60
  bottomReserve: H => 0.17 * H,
  others: { ink: '#FFFFFF', shadow: 'rgba(0,0,0,.55)' },
  drawBackdrop(ctx, g) {
    const { W, H, x0, P, pos } = g;
    ctx.fillStyle = 'rgba(20,16,12,.28)'; ctx.fillRect(0, 0, W, H);
    const gr = pos === 'right' ? ctx.createLinearGradient(x0 - 0.14 * W, 0, W, 0) : ctx.createLinearGradient(x0 + P + 0.14 * W, 0, 0, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  },
  drawHeader(ctx, g) {
    const { x0, P, u, text, headTop } = g, sub = subOf(text);
    ctx.save(); ctx.textAlign = 'left';
    ctx.fillStyle = W80; ctx.font = '500 ' + px(22 * u, CORM);
    spaced(ctx, 'WORKOUT LOG', x0, headTop + 18 * u, 0.35 * 22 * u, 'left');
    const dBase = headTop + 118 * u;
    ctx.font = '600 ' + px(96 * u, CORM); const k = shrink(ctx.measureText(text.date).width, P);
    ctx.font = '600 ' + px(96 * u * k, CORM); ctx.fillStyle = '#FFFFFF'; ctx.fillText(text.date, x0, dBase);
    ctx.fillRect(x0, dBase + 24 * u, P, Math.max(1, 1 * u));
    ctx.font = '500 ' + px(24 * u, MIN); ctx.fillText('（' + sub.wd + '）' + (sub.today ? '今日' : ''), x0, dBase + 24 * u + 40 * u);
    ctx.restore();
  },
  drawCard(ctx, g, it, i, y, h, scale) {
    const { x0, P, u } = g, s = u * scale, lw = Math.max(1, 1 * u);
    const pad = CARD.pad * s, padX = CARD.padX * s, headH = CARD.head * s, rowH = CARD.row * s;
    const inL = x0 + padX, inR = x0 + P - padX;
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x0, y, P, lw);
    if (i === g.plan.count - 1) ctx.fillRect(x0, y + h - lw, P, lw);   // 下線は最後のカードだけ（間は上線 1 本）
    const cy = y + pad + headH / 2, by = cy + 9.4 * s;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(inL + 16 * s, cy, 16 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '500 ' + px(20 * s, CORM); ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1).padStart(2, '0'), inL + 16 * s, cy + 7 * s);
    ctx.fillStyle = W85; ctx.textAlign = 'right';
    const rmTxt = 'RM ' + it.rm + 'kg', rmW = ctx.measureText(rmTxt).width;
    ctx.fillText(rmTxt, inR, by);
    ctx.font = '500 ' + px(28 * s, MIN); ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left';
    const nx = inL + 32 * s + 14 * s;
    ctx.fillText(clip(ctx, it.name, inR - rmW - 12 * s - nx), nx, by);
    setRows(ctx, it, inL, y + pad + headH, rowH, s, { font: '400 ' + px(24 * s, FONT_B), xFont: '400 ' + px(22 * s, FONT_D), assistFont: '400 ' + px(18 * s, FONT_B), ink: '#FFFFFF', ink2: 'rgba(255,255,255,.7)' });
  },
  drawDecor(ctx, g) {
    const { H, u, m, x0, P, headTop } = g, al = decoAlign(g), d = mirror(g);
    ctx.save();
    // 飾り側の上: Better Than Yesterday（筆記体、少し右上がり）
    ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 2 * u;
    const tx = decoX(g, 0, 12 * u), ty = Math.max(70 * u, headTop - 10 * u);
    rotated(ctx, tx, ty, -6 * d * DEG, () => { ctx.font = px(56 * u, VIBES); ctx.textAlign = al; lines(ctx, ['Better', 'Than', 'Yesterday'], 0, 0, 58 * u); });
    // 飾り側の下: SMALL STEPS BIG CHANGES（1 行ずつ、字間）
    ctx.fillStyle = W85; ctx.font = '500 ' + px(22 * u, CORM);
    ['SMALL', 'STEPS', 'BIG', 'CHANGES'].forEach((t, i) => spaced(ctx, t, decoX(g, 0, 4 * u), H - m - 8 * u - 30 * u * (3 - i), 0.3 * 22 * u, al));
    // パネル側の下: Keep Training（筆記体）＋ 和文 2 行（パネル右端揃え）
    const pr = al === 'left' ? x0 + P : x0, pal = al === 'left' ? 'right' : 'left';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '500 ' + px(22 * u, MIN); ctx.textAlign = pal;
    const j2 = H - m - 8 * u, j1 = j2 - 32 * u;
    ctx.fillText('今日の積み重ねが、', pr, j1); ctx.fillText('明日の自分をつくる。', pr, j2);
    rotated(ctx, pr, j1 - 48 * u, -4 * d * DEG, () => { ctx.font = px(64 * u, VIBES); ctx.textAlign = pal; ctx.fillText('Training', 0, 0); ctx.fillText('Keep', pal === 'right' ? -ctx.measureText('Training').width + 30 * u : 0, -60 * u); });
    ctx.restore();
  },
};

/* ================= cool（かっこいい） ================= */
const cool = {
  label: 'かっこいい',
  fonts: [['700 92px Oswald', 'num'], ['400 18px Oswald', 'num'], ['500 18px Oswald', 'num'], ['400 26px Oswald', 'num'], ['400 20px Oswald', 'num'],
    ['700 26px "Noto Sans JP"', 'ja'], ['500 26px "Noto Sans JP"', 'ja'], ['400 18px "Noto Sans JP"', 'ja'], ['500 22px "Noto Sans JP"', 'ja'], ['400 84px "Permanent Marker"', 'num']],
  sample: { num: 'NO PAIN GAIN TRAINING RECORD BETTER THAN YESTERDAY Keep Going', ja: '' },
  headerH: u => 186 * u,                 // 92（日付）+ 44（TRAINING RECORD）+ 50
  bottomReserve: H => 0.18 * H,
  others: { ink: '#FFFFFF', shadow: 'rgba(0,0,0,.55)' },
  drawBackdrop(ctx, g) {
    const { W, H, u, x0, P, pos } = g;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const gr = pos === 'right' ? ctx.createLinearGradient(x0 - 0.1 * W, 0, x0 + P * 0.5, 0) : ctx.createLinearGradient(x0 + P + 0.1 * W, 0, x0 + P * 0.5, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // 角の斜めストライプ（パネル側の上）
    ctx.save(); ctx.fillStyle = '#2a2a2a'; ctx.globalAlpha = 0.9;
    const right = pos === 'right';
    [[30, 24], [92, 34], [164, 16]].forEach(([d0, w]) => {
      const d1 = d0 * u, w1 = w * u;
      ctx.beginPath();
      if (right) { ctx.moveTo(W - d1, 0); ctx.lineTo(W - d1 - w1, 0); ctx.lineTo(W, d1 + w1); ctx.lineTo(W, d1); } else { ctx.moveTo(d1, 0); ctx.lineTo(d1 + w1, 0); ctx.lineTo(0, d1 + w1); ctx.lineTo(0, d1); }
      ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  },
  drawHeader(ctx, g) {
    const { x0, P, u, text, headTop } = g, base1 = headTop + 92 * u;
    ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 ' + px(92 * u, FONT_D); let dw = ctx.measureText(text.date).width;
    ctx.font = '500 ' + px(26 * u, FONT_B); let sw = ctx.measureText(text.sub).width;
    const k = shrink(dw + 16 * u + sw, P);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12 * u; ctx.shadowOffsetY = 3 * u;
    ctx.save(); ctx.translate(x0, base1); ctx.transform(1, 0, -Math.tan(8 * DEG), 1, 0, 0);
    ctx.font = '700 ' + px(92 * u * k, FONT_D); dw = ctx.measureText(text.date).width; ctx.fillText(text.date, 0, 0);
    ctx.restore();
    ctx.font = '500 ' + px(26 * u * k, FONT_B); sw = ctx.measureText(text.sub).width; ctx.fillText(text.sub, x0 + dw + 16 * u, base1);
    ctx.shadowColor = 'transparent';
    // TRAINING RECORD ＋ 左右の短い白線
    ctx.fillStyle = W85; ctx.font = '400 ' + px(18 * u, FONT_D);
    const ty = base1 + 44 * u, tw = spacedW(ctx, 'TRAINING RECORD', 0.4 * 18 * u), lx = x0 + 26 * u;
    spaced(ctx, 'TRAINING RECORD', lx, ty, 0.4 * 18 * u, 'left');
    ctx.fillRect(x0, ty - 6 * u, 14 * u, Math.max(1, u));
    ctx.fillRect(lx + tw + 14 * u, ty - 6 * u, Math.max(0, x0 + P - (lx + tw + 14 * u)), Math.max(1, u));
    ctx.restore();
  },
  drawCard(ctx, g, it, i, y, h, scale) {
    const { x0, P, u } = g, s = u * scale;
    const pad = CARD.pad * s, padX = CARD.padX * s, headH = CARD.head * s, rowH = CARD.row * s;
    const inL = x0 + padX, inR = x0 + P - padX;
    hexCard(ctx, x0, y, P, h, 18 * s);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    ctx.strokeStyle = W85; ctx.lineWidth = 1.5 * s; ctx.stroke();
    const cy = y + pad + headH / 2, by = cy + 9.4 * s;
    // 白い平行四辺形マーク（−15° スラント）
    const sl = Math.tan(15 * DEG) * 22 * s, mx = inL;
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath();
    ctx.moveTo(mx, cy + 11 * s); ctx.lineTo(mx + 14 * s, cy + 11 * s); ctx.lineTo(mx + 14 * s + sl, cy - 11 * s); ctx.lineTo(mx + sl, cy - 11 * s); ctx.closePath(); ctx.fill();
    // RM のピル
    ctx.font = '500 ' + px(18 * s, FONT_D);
    const rmTxt = 'RM : ' + it.rm + 'kg', rmW = ctx.measureText(rmTxt).width, ph = 28 * s, pw = rmW + 24 * s;
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, inR - pw, cy - ph / 2, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'right'; ctx.fillText(rmTxt, inR - 12 * s, cy + 6.5 * s);
    ctx.font = '700 ' + px(26 * s, FONT_B); ctx.textAlign = 'left';
    const nx = mx + 14 * s + sl + 12 * s;
    ctx.fillText(clip(ctx, it.name, inR - pw - 10 * s - nx), nx, by);
    setRows(ctx, it, inL, y + pad + headH, rowH, s, { font: '400 ' + px(26 * s, FONT_D), assistFont: '400 ' + px(18 * s, FONT_B), ink: '#FFFFFF', ink2: 'rgba(255,255,255,.7)', kg: 'kg' });
  },
  drawDecor(ctx, g) {
    const { H, u, m, x0, P } = g, al = decoAlign(g), d = mirror(g);
    ctx.save();
    // 飾り側の上: NO PAIN / NO GAIN
    ctx.fillStyle = W80; ctx.font = '400 ' + px(20 * u, FONT_D);
    spaced(ctx, 'NO PAIN', decoX(g, 0, 10 * u), m + 36 * u, 0.3 * 20 * u, al); spaced(ctx, 'NO GAIN', decoX(g, 0, 10 * u), m + 66 * u, 0.3 * 20 * u, al);
    ctx.fillRect(al === 'left' ? decoX(g, 0, 10 * u) : decoX(g, 0, 10 * u) - 22 * u, m + 82 * u, 22 * u, Math.max(1, u));
    // 飾り側の下: Keep Going（ブラシ文字、−8° 回転、影）
    ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 4 * u;
    rotated(ctx, decoX(g, 0, 10 * u), H - m - 30 * u, -8 * d * DEG, () => { ctx.font = px(84 * u, MARKER); ctx.textAlign = al; ctx.fillText('Going', 0, 0); ctx.fillText('Keep', al === 'left' ? 0 : -ctx.measureText('Going').width * 0.3, -92 * u); });
    ctx.shadowColor = 'transparent';
    // パネル側の下: BETTER THAN YESTERDAY（両脇に線）
    ctx.fillStyle = W85; ctx.font = '400 ' + px(18 * u, FONT_D);
    const t = 'BETTER THAN YESTERDAY', sp = 0.3 * 18 * u, tw = spacedW(ctx, t, sp), cx = x0 + P / 2, by = H - m - 24 * u;
    spaced(ctx, t, cx, by, sp, 'center');
    const ll = Math.min(60 * u, (P - tw) / 2 - 16 * u);
    if (ll > 8 * u) { ctx.fillRect(cx - tw / 2 - 12 * u - ll, by - 6 * u, ll, Math.max(1, u)); ctx.fillRect(cx + tw / 2 + 12 * u, by - 6 * u, ll, Math.max(1, u)); }
    ctx.restore();
  },
};

export const THEMES = { normal, cute, chic, cool };
export const THEME_IDS = Object.keys(THEMES);
