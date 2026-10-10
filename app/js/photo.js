// photo.js — 記録写真（写真にその日の記録を載せる）。仕様: docs/06_仕様_記録写真.md、docs/07_仕様_記録写真デザイン.md
//
// 写真はこの端末の canvas でその場で合成するだけ。Firestore / localStorage には一切保存せず、ネットワーク通信もしない。
// 合成結果は navigator.share（iPhone 等）か <a download>（PC）で保存・共有する。
// 描き方（ノーマル／かわいい／おしゃれ／かっこいい）は photo-themes.js に分けてある。
import { $, toast, exName, exColor, exOf, partOf } from './ui.js';
import { store } from './store.js';
import { todayKey, validSets } from './calc.js';
import { sheet, closeSheet, sheetOpen } from './screens/sheets.js';
import { fitPlan, photoText, cardH, CARD } from './photo-layout.js';
import { THEMES, STYLES, FONT_B, px } from './photo-themes.js';

const MAX_EDGE = 1600;                 // 出力の長辺（これより大きい写真は縮小。拡大はしない）
const FONT_WAIT_MS = 5000;             // Web フォントを待つ上限（初回は和文サブセットのダウンロードがあるため長め）
// 記録写真用の追加フォント（起動時には読み込まず、シートを初めて開いた時に 1 回だけ <link> を追加する）
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Yomogi&family=Cormorant+Garamond:wght@500;600&family=Noto+Serif+JP:wght@500&family=Great+Vibes&family=Permanent+Marker&family=Oswald:wght@700&display=swap';
const PREF_KEY = 'won-photo';          // { theme, pos } を端末に記憶（同期しない）
const IMG_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const DECODE_ERR = 'この写真は読み込めませんでした。JPEG か PNG の写真をお試しください';

let st = null;     // 開いているシートの状態（閉じたら dispose() で null）
let seq = 0;       // 非同期処理の世代（古い処理の結果を捨てる）
let cssReady = null;            // 追加フォントの <link> 読み込み完了（失敗も含む）
const fontsDone = new Set();    // フォント読み込みを済ませた（または諦めた）テーマ

const isImageFile = f => !!f && (String(f.type || '').startsWith('image/') || IMG_EXT.test(String(f.name || '')));

/* ---------- 設定の記憶 ---------- */
function loadPref() {
  const d = { theme: 'normal', pos: 'right' };
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
    if (p && THEMES[p.theme]) d.theme = p.theme;
    if (p && (p.pos === 'left' || p.pos === 'right')) d.pos = p.pos;
  } catch (e) { /* 読めなければ既定 */ }
  return d;
}
function savePref() {
  if (!st) return;
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ theme: st.theme, pos: st.pos })); } catch (e) { /* 保存できなくても動く */ }
}

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

/** 追加フォントの <link id="won-photo-fonts"> を 1 回だけ足す。読み込み完了（失敗含む）で解決 */
function ensureFontCss() {
  if (cssReady) return cssReady;
  cssReady = new Promise(res => {
    if (document.getElementById('won-photo-fonts')) { res(); return; }
    const l = document.createElement('link');
    l.id = 'won-photo-fonts'; l.rel = 'stylesheet'; l.href = FONTS_URL;
    l.onload = () => res(); l.onerror = () => res();
    document.head.appendChild(l);
  });
  return cssReady;
}

/** テーマのフォントを、実際に描く文字列を渡して読み込む。5 秒で打ち切る（未読込でもシステムフォントで描く） */
function loadFonts(text, theme) {
  const T = THEMES[theme] || THEMES.normal;
  if (!document.fonts || typeof document.fonts.load !== 'function') { fontsDone.add(theme); return Promise.resolve(); }
  const num = text.date + ' ' + text.items.map(i => i.rm + i.sets.map(s => s.w + s.r).join('')).join('') + '0123456789.× kg reps RM:' + (T.sample && T.sample.num || '');
  const ja = text.sub + text.items.map(i => i.name + (i.part || '')).join('') + '補助他種目…' + (T.sample && T.sample.ja || '');
  const run = (async () => {
    if (theme !== 'normal') await ensureFontCss();
    await Promise.all(T.fonts.map(a => document.fonts.load(a[0], a[1] === 'ja' ? ja : num).catch(() => { /* 取れなければシステムフォント */ })));
  })();
  return Promise.race([run, new Promise(res => setTimeout(res, FONT_WAIT_MS))]).then(() => { fontsDone.add(theme); });
}

/* ---------- 合成 ---------- */
/**
 * 写真（base）の上に見出しとカードを描く。flip が真なら写真だけを左右反転する（文字・カードは反転しない）。
 * 描き方は theme に委譲: 写真 → drawBackdrop → drawHeader → カード（fitPlan は共通）→ 他 N 種目 → drawDecor
 */
function compose(cv, base, text, pos, style, flip, theme) {
  const T = THEMES[theme] || THEMES.normal;
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
  const headTop = Math.round(0.075 * H), bottomReserve = T.bottomReserve(H);
  const g = { W, H, u, m, P, x0, pos, text, style, C, headTop, bottomReserve, plan: null, s: u };
  ctx.save(); T.drawBackdrop(ctx, g); ctx.restore();
  ctx.save(); T.drawHeader(ctx, g); ctx.restore();

  // カード群（収まらなければ縮小 → 末尾の種目を外す）。テーマごとの見出し高と下部の飾りの分を除いた高さに収める
  let y = headTop + T.headerH(u);
  const plan = fitPlan(text.items.map(i => i.sets.length), H - y - bottomReserve - m, u), s = u * plan.scale;
  g.plan = plan; g.s = s;
  for (let i = 0; i < plan.count; i++) {
    const it = text.items[i], h = cardH(it.sets.length, u, plan.scale);
    ctx.save(); T.drawCard(ctx, g, it, i, y, h, plan.scale); ctx.restore();
    y += h + CARD.gap * s;
  }
  const rest = text.items.length - plan.count;
  if (rest > 0) {
    const y2 = (plan.count ? y - CARD.gap * s : y) + 14 * u + 18 * u, o = T.others || { ink: '#FFFFFF', shadow: 'rgba(0,0,0,.55)' };
    ctx.save();
    ctx.fillStyle = o.ink; ctx.shadowColor = o.shadow; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u;
    ctx.font = '500 ' + px(22 * u, FONT_B); ctx.textAlign = 'center';
    if (o.outline) { ctx.strokeStyle = o.outline; ctx.lineWidth = 5 * u; ctx.lineJoin = 'round'; ctx.strokeText('他 ' + rest + ' 種目', x0 + P / 2, y2); }
    ctx.fillText('他 ' + rest + ' 種目', x0 + P / 2, y2);
    ctx.restore();
  }
  ctx.save(); T.drawDecor(ctx, g); ctx.restore();
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
function segHtml(label, act, cur, opts, cls, disabled) {
  return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span class="lbl">' + label + '</span><div class="seg" role="group" aria-label="' + label + '">'
    + opts.map(o => '<button class="' + (o[0] === cur ? 'on' : '') + '" data-act="' + act + '" data-arg="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '"' + (disabled ? ' disabled' : '') + '>' + o[1] + '</button>').join('') + '</div></div>';
}
function setShare(enabled) { const b = $('#photo-share'); if (b) b.disabled = !enabled; }
/** カード 白/黒 はノーマルだけ有効 */
function setStyleEnabled(on) { document.querySelectorAll('#sheet [data-act="photoStyle"]').forEach(b => { b.disabled = !on; }); }
function showEmpty(msg) {
  const stage = document.getElementById('photo-stage'); if (!stage) return;
  const d = document.createElement('div'); d.className = 'empty'; d.setAttribute('role', 'status'); d.textContent = msg;
  stage.replaceChildren(d);
}

/** 合成してプレビューを差し替え、保存用の File を先に作っておく（iOS の share はユーザー操作の中でしか呼べないため） */
function render() {
  if (!st || !st.base) return;
  if (st.drawing) { st.dirty = true; return; }
  st.drawing = true; st.dirty = false;
  st.file = null; st.blob = null; setShare(false);
  const my = st.seq, gen = ++st.gen;
  try {
    compose(st.cv, st.base, st.text, st.pos, st.style, st.flip, st.theme);
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
/**
 * テーマのフォントを（この写真の文字列で）読み込んでから描く。
 * そのテーマが初めてなら「フォントを読み込んでいます…」を出す（2 回目以降はキャッシュ済みなのでほぼ即時）
 */
async function redraw() {
  if (!st || !st.base) return;
  const my = st.seq, theme = st.theme;
  setShare(false);
  if (!fontsDone.has(theme)) showEmpty('フォントを読み込んでいます…');
  await loadFonts(st.text, theme);
  if (!alive(my) || st.theme !== theme) return;   // 待っている間にさらに切り替わった → その切替側が描く
  render();
}

/** ホームの「写真に記録を載せる」→ ファイル選択後に呼ばれる */
export async function openPhotoSheet(file, dateKey) {
  if (!isImageFile(file)) { fail(DECODE_ERR); return; }
  dispose();
  const my = ++seq, pref = loadPref();
  const day = store.day(dateKey), text = photoText(day, dateKey, todayKey(), exName, exColor);
  // かわいいテーマの「部位名 がんばった!!」用に部位名を添える（photoText と同じ絞り込み順）
  const parts = (day && Array.isArray(day.items) ? day.items : []).filter(it => validSets(it).length > 0).map(it => { const e = exOf(it.ex), p = e && partOf(e.part); return p ? p.name : ''; });
  text.items.forEach((it, i) => { it.part = parts[i] || ''; });
  const canShare = !!(navigator.share && navigator.canShare);
  const themeOpts = Object.keys(THEMES).map(k => [k, THEMES[k].label]);
  sheet('記録写真', '<div id="photo-stage"><div class="empty" role="status">写真を読み込んでいます…</div></div>'
    + segHtml('デザイン', 'photoTheme', pref.theme, themeOpts, 'photo-theme')
    + '<div class="photo-opts">' + segHtml('位置', 'photoPos', pref.pos, [['left', '左'], ['right', '右']]) + segHtml('カード', 'photoStyle', 'white', [['white', '白'], ['black', '黒']], '', pref.theme !== 'normal') + segHtml('反転', 'photoFlip', 'off', [['off', 'なし'], ['on', 'あり']]) + '</div>'
    + '<p class="note">写真はこの端末の中だけで合成します。アプリには保存されず、どこにも送信されません。</p>'
    + '<div class="btnrow"><button class="btn ghost" data-act="photoPick">別の写真を選ぶ</button><button class="btn pri" id="photo-share" data-act="photoShare" disabled>保存・共有</button></div>'
    + (canShare ? '<p class="note">iPhone では共有画面の「画像を保存」で写真に保存できます。</p>' : ''));
  st = { seq: my, gen: 0, dateKey, text, theme: pref.theme, pos: pref.pos, style: 'white', flip: false, bmp: null, base: null, cv: null, file: null, blob: null, url: null, drawing: false, dirty: false, obs: null };
  ensureFontCss();   // 2 本目の Google Fonts <link>（初回だけ追加。ノーマルは待たずに描く）
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
  redraw();
}

export const actions = {
  photoTheme(v) { if (!st || !THEMES[v]) return; st.theme = v; mark('photoTheme', v); setStyleEnabled(v === 'normal'); savePref(); redraw(); },
  photoPos(v) { if (!st || (v !== 'left' && v !== 'right')) return; st.pos = v; mark('photoPos', v); savePref(); render(); },
  photoStyle(v) { if (!st || !STYLES[v] || st.theme !== 'normal') return; st.style = v; mark('photoStyle', v); render(); },
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
