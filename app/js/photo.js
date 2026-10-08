// photo.js — 記録写真（写真にその日の記録を載せる）。仕様: docs/06_仕様_記録写真.md
//
// 写真はこの端末の canvas でその場で合成するだけ。Firestore / localStorage には一切保存せず、ネットワーク通信もしない。
// 合成結果は navigator.share（iPhone 等）か <a download>（PC）で保存・共有する。
import { $, toast, exName, exColor } from './ui.js';
import { store } from './store.js';
import { todayKey } from './calc.js';
import { sheet, closeSheet, sheetOpen } from './screens/sheets.js';
import { fitPlan, photoText, cardH, CARD } from './photo-layout.js';

const MAX_EDGE = 1600;                 // 出力の長辺（これより大きい写真は縮小。拡大はしない）
const FONT_WAIT_MS = 2000;             // Web フォントを待つ上限
const FONT_D = '"Oswald","Arial Narrow","Noto Sans JP",sans-serif';
const FONT_B = '"Noto Sans JP","Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif';
const STYLES = {
  white: { bg: 'rgba(255,255,255,.88)', ink: '#2B2021', ink2: '#706364' },
  black: { bg: 'rgba(20,16,17,.80)', ink: '#F1EBEB', ink2: '#9C8F8F' },
};
const IMG_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const DECODE_ERR = 'この写真は読み込めませんでした。JPEG か PNG の写真をお試しください';

let st = null;     // 開いているシートの状態（閉じたら dispose() で null）
let seq = 0;       // 非同期処理の世代（古い処理の結果を捨てる）

const isImageFile = f => !!f && (String(f.type || '').startsWith('image/') || IMG_EXT.test(String(f.name || '')));

/* ---------- 読み込み ---------- */
/** EXIF の回転を反映して画像をデコードする（createImageBitmap → 失敗時は Image） */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 未対応・失敗 → Image で読む */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = url; });
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/** 実際に描く文字列を渡してフォントを読み込む。2秒で打ち切る（未読込でもそのまま描く） */
function loadFonts(text) {
  if (!document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve();
  const num = text.date + ' ' + text.items.map(i => i.rm + i.sets.map(s => s.w + s.r).join('')).join('') + '0123456789.× kg reps RM:';
  const ja = text.sub + text.items.map(i => i.name).join('') + '補助他種目…';
  const list = [['600 64px Oswald', num], ['500 20px Oswald', num], ['400 26px Oswald', num],
    ['700 26px "Noto Sans JP"', ja], ['500 26px "Noto Sans JP"', ja], ['400 18px "Noto Sans JP"', ja], ['500 22px "Noto Sans JP"', ja]];
  const all = Promise.all(list.map(a => document.fonts.load(a[0], a[1]).catch(() => { /* 取れなければシステムフォント */ })));
  return Promise.race([all, new Promise(res => setTimeout(res, FONT_WAIT_MS))]);
}

/* ---------- 合成 ---------- */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
/** maxW に収まらない文字列は末尾を … で切る */
function clip(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1) { t = t.slice(0, -1); if (ctx.measureText(t + '…').width <= maxW) return t + '…'; }
  return '…';
}
const px = (n, f) => Math.round(n * 100) / 100 + 'px ' + f;
/** 写真（base）の上に見出しとカードを描く。flip が真なら写真だけを左右反転する（文字・カードは反転しない） */
function compose(cv, base, text, pos, style, flip) {
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d'), C = STYLES[style] || STYLES.white;
  const u = Math.min(W, H) / 1080, m = 28 * u;
  const P = Math.min(560 * u, Math.max(400 * u, Math.round(0.46 * W)));
  const x0 = pos === 'left' ? m : W - m - P;
  ctx.clearRect(0, 0, W, H);
  if (flip) {
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(base, 0, 0, W, H); ctx.restore();
  } else {
    ctx.drawImage(base, 0, 0, W, H);
  }
  ctx.textBaseline = 'alphabetic';

  // 見出し: 日付（Oswald 600/64）＋ (曜) 今日（Noto Sans JP 500/26）。ベースラインを揃える。白文字＋影
  const headTop = Math.round(0.075 * H), base1 = headTop + 64 * u;
  ctx.save();
  ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u;
  ctx.textAlign = 'left';
  ctx.font = '600 ' + px(64 * u, FONT_D); ctx.fillText(text.date, x0, base1);
  const dw = ctx.measureText(text.date + ' ').width;
  ctx.font = '500 ' + px(26 * u, FONT_B); ctx.fillText(text.sub, x0 + dw, base1);
  const lineY = base1 + 14 * u;
  ctx.fillRect(x0, lineY, P, 2 * u);
  ctx.restore();

  // カード群（収まらなければ縮小 → 末尾の種目を外す）
  let y = lineY + 2 * u + 22 * u;
  const plan = fitPlan(text.items.map(i => i.sets.length), H - y - m, u), s = u * plan.scale;
  const pad = CARD.pad * s, padX = CARD.padX * s, headH = CARD.head * s, rowH = CARD.row * s;
  const inL = x0 + padX, inR = x0 + P - padX;
  for (let i = 0; i < plan.count; i++) {
    const it = text.items[i], h = cardH(it.sets.length, u, plan.scale);
    ctx.fillStyle = C.bg; rrect(ctx, x0, y, P, h, CARD.radius * s); ctx.fill();
    // 見出し行: 部位色の丸 → 種目名 … RM
    const cy = y + pad + headH / 2, by = cy + 9.4 * s;
    ctx.fillStyle = /^#|^rgb|^hsl/i.test(it.color) ? it.color : C.ink2;
    ctx.beginPath(); ctx.arc(inL + 7 * s, cy, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.font = '500 ' + px(20 * s, FONT_D); ctx.fillStyle = C.ink2; ctx.textAlign = 'right';
    const rmTxt = 'RM : ' + it.rm + 'kg', rmW = ctx.measureText(rmTxt).width;
    ctx.fillText(rmTxt, inR, by);
    ctx.font = '700 ' + px(26 * s, FONT_B); ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    const nx = inL + 14 * s + 10 * s;
    ctx.fillText(clip(ctx, it.name, inR - rmW - 12 * s - nx), nx, by);
    // セット行: 番号／重量（右揃え）／×／回数（＋補助）
    it.sets.forEach((set, j) => {
      const ry = y + pad + headH + rowH * j + rowH / 2 + 9.4 * s;
      ctx.font = '400 ' + px(26 * s, FONT_D); ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      ctx.fillText(String(set.n), inL + 12 * s, ry);
      ctx.textAlign = 'right'; ctx.fillText(set.w + ' kg', inL + 150 * s, ry);
      ctx.textAlign = 'left'; ctx.fillStyle = C.ink2; ctx.fillText('×', inL + 170 * s, ry);
      ctx.fillStyle = C.ink; const reps = set.r + ' reps'; ctx.fillText(reps, inL + 196 * s, ry);
      if (set.assist) {
        const rw = ctx.measureText(reps).width;
        ctx.font = '400 ' + px(18 * s, FONT_B); ctx.fillStyle = C.ink2; ctx.fillText(' 補助', inL + 196 * s + rw, ry);
      }
    });
    y += h + CARD.gap * s;
  }
  const rest = text.items.length - plan.count;
  if (rest > 0) {
    const y2 = (plan.count ? y - CARD.gap * s : y) + 14 * u + 18 * u;
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u;
    ctx.font = '500 ' + px(22 * u, FONT_B); ctx.textAlign = 'center';
    ctx.fillText('他 ' + rest + ' 種目', x0 + P / 2, y2);
    ctx.restore();
  }
}

/* ---------- シート ---------- */
const alive = my => !!st && st.seq === my && !!document.getElementById('photo-stage');

function dispose() {
  if (!st) return;
  const s = st; st = null;
  if (s.obs) s.obs.disconnect();
  if (s.bmp && typeof s.bmp.close === 'function') { try { s.bmp.close(); } catch (e) { /* noop */ } }
  if (s.url) { try { URL.revokeObjectURL(s.url); } catch (e) { /* noop */ } }
  if (s.base) { s.base.width = s.base.height = 0; }   // iOS の canvas メモリを早めに返す
  if (s.cv) { s.cv.width = s.cv.height = 0; }
  s.bmp = s.base = s.cv = s.file = s.blob = null;
}
function fail(msg) {
  dispose();
  toast(msg);
  if (sheetOpen()) closeSheet();
}
function segHtml(label, act, cur, opts) {
  return '<div><span class="lbl">' + label + '</span><div class="seg" role="group" aria-label="' + label + '">'
    + opts.map(o => '<button class="' + (o[0] === cur ? 'on' : '') + '" data-act="' + act + '" data-arg="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>').join('') + '</div></div>';
}
function setShare(enabled) { const b = $('#photo-share'); if (b) b.disabled = !enabled; }

/** 合成してプレビューを差し替え、保存用の File を先に作っておく（iOS の share はユーザー操作の中でしか呼べないため） */
function render() {
  if (!st || !st.base) return;
  if (st.drawing) { st.dirty = true; return; }
  st.drawing = true; st.dirty = false;
  st.file = null; st.blob = null; setShare(false);
  const my = st.seq, gen = ++st.gen;
  try {
    compose(st.cv, st.base, st.text, st.pos, st.style, st.flip);
    const stage = document.getElementById('photo-stage');
    if (stage && st.cv.parentNode !== stage) stage.replaceChildren(st.cv);
  } finally { st.drawing = false; }
  if (st.dirty) { render(); return; }
  st.cv.toBlob(blob => {
    if (!alive(my) || st.gen !== gen) return;
    if (!blob) { setShare(false); return; }
    st.blob = blob;
    st.file = new File([blob], 'WorkOutNote_' + st.dateKey + '.jpg', { type: 'image/jpeg' });
    setShare(true);
  }, 'image/jpeg', 0.92);
}

/** ホームの「写真に記録を載せる」→ ファイル選択後に呼ばれる */
export async function openPhotoSheet(file, dateKey) {
  if (!isImageFile(file)) { fail(DECODE_ERR); return; }
  dispose();
  const my = ++seq;
  const text = photoText(store.day(dateKey), dateKey, todayKey(), exName, exColor);
  const canShare = !!(navigator.share && navigator.canShare);
  sheet('記録写真', '<div id="photo-stage"><div class="empty" role="status">写真を読み込んでいます…</div></div>'
    + '<div class="photo-opts">' + segHtml('位置', 'photoPos', 'right', [['left', '左'], ['right', '右']]) + segHtml('カード', 'photoStyle', 'white', [['white', '白'], ['black', '黒']]) + segHtml('反転', 'photoFlip', 'off', [['off', 'なし'], ['on', 'あり']]) + '</div>'
    + '<p class="note">写真はこの端末の中だけで合成します。アプリには保存されず、どこにも送信されません。</p>'
    + '<div class="btnrow"><button class="btn ghost" data-act="photoPick">別の写真を選ぶ</button><button class="btn pri" id="photo-share" data-act="photoShare" disabled>保存・共有</button></div>'
    + (canShare ? '<p class="note">iPhone では共有画面の「画像を保存」で写真に保存できます。</p>' : ''));
  st = { seq: my, gen: 0, dateKey, text, pos: 'right', style: 'white', flip: false, bmp: null, base: null, cv: null, file: null, blob: null, url: null, drawing: false, dirty: false, obs: null };
  // シートが閉じられたら（×／背景／戻る／別画面へ遷移）後始末。sheet() は中身を消すだけなので、要素の消失で検知する
  const host = $('#sheet');
  if (host && typeof MutationObserver === 'function') {
    st.obs = new MutationObserver(() => { if (st && st.seq === my && !document.getElementById('photo-stage')) dispose(); });
    st.obs.observe(host, { childList: true });
  }
  let src;
  try { src = await decode(file); } catch (e) { src = null; }
  if (!alive(my)) { if (src && typeof src.close === 'function') src.close(); return; }
  const sw = src ? (src.naturalWidth || src.width) : 0, sh = src ? (src.naturalHeight || src.height) : 0;
  if (!sw || !sh) { if (src && typeof src.close === 'function') src.close(); fail(DECODE_ERR); return; }
  st.bmp = typeof src.close === 'function' ? src : null;
  const k = Math.min(1, MAX_EDGE / Math.max(sw, sh)), W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const bctx = base.getContext('2d');
  try { bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high'; } catch (e) { /* noop */ }
  try { bctx.drawImage(src, 0, 0, W, H); } catch (e) { fail(DECODE_ERR); return; }
  if (st.bmp) { try { st.bmp.close(); } catch (e) { /* noop */ } st.bmp = null; }   // 縮小済みの canvas があれば元画像は不要
  st.base = base;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.className = 'photo-prev'; cv.setAttribute('aria-label', '合成した記録写真のプレビュー');
  st.cv = cv;
  await loadFonts(text);
  if (!alive(my)) return;
  render();
}

export const actions = {
  photoPos(v) { if (!st || (v !== 'left' && v !== 'right')) return; st.pos = v; mark('photoPos', v); render(); },
  photoStyle(v) { if (!st || !STYLES[v]) return; st.style = v; mark('photoStyle', v); render(); },
  photoFlip(v) { if (!st || (v !== 'on' && v !== 'off')) return; st.flip = v === 'on'; mark('photoFlip', v); render(); },
  photoPick() { const i = $('#photo-in'); if (i) i.click(); },
  photoShare() {
    if (!st || !st.file) return;
    const f = st.file, title = 'WorkOut Note ' + st.text.date;
    // iOS は navigator.share をユーザー操作の中（await を挟まず）で呼ぶ必要がある
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f], title }).catch(e => { if (e && e.name === 'AbortError') return; download(f); });
      return;
    }
    download(f);
  },
};
function mark(act, v) {
  document.querySelectorAll('#sheet [data-act="' + act + '"]').forEach(b => { const on = b.dataset.arg === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}
function download(f) {
  let url;
  try { url = URL.createObjectURL(f); } catch (e) { toast('画像を保存できませんでした'); return; }
  const a = document.createElement('a');
  a.href = url; a.download = f.name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } }, 1000);
  toast('画像を保存しました');
}
