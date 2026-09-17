// sheets.js — 下から出るシート（RM計算機／過去の日からコピー／確認／名前入力）
//
// ブラウザバック／スワイプ戻る対応: シートを開く時に history へ1段積む。
//   ・戻る操作（popstate）→ シートを閉じるだけ（main.js が consumePop() を先に呼ぶ）
//   ・×／背景／OK で閉じた時 → 積んだ1段を history.back() で戻す（その popstate は無視する）
import { S, rerender } from '../state.js';
import { store } from '../store.js';
import { $, esc, ic, toast, WD, exName, exColor, dot } from '../ui.js';
import { rm, f1, slash, fromKey, recentTrainedKeys, validSets, mergeCopyDay, weightForReps, normW, normRmReps } from '../calc.js';

let pending = null;   // 確認・入力シートの OK コールバック
let onCancel = null;  // OK 以外で閉じられた時のコールバック（確認シート用）
let pushed = false;   // このシートのために history を1段積んでいるか
let skipPop = 0;      // 自分で history.back() した分の popstate を無視する回数
let waiters = [];     // その popstate を待っている処理

export const sheetOpen = () => { const el = $('#sheet'); return !!(el && el.firstChild); };

/**
 * シートを閉じる。戻り値の Promise は「積んだ履歴を戻し終えた」時に解決する
 * （閉じた直後に画面遷移する処理は then の中で行うこと）。
 *   fromPop: 戻る操作で閉じる（履歴は既に戻っている） / silent: 履歴に触らない（別画面への遷移中）
 */
export function closeSheet(opt = {}) {
  const cancelled = onCancel;
  pending = null; onCancel = null;
  const el = $('#sheet'); if (el) el.innerHTML = '';
  if (cancelled && !opt.ok) { try { cancelled(); } catch (e) { console.error(e); } }
  if (!pushed) return Promise.resolve();
  pushed = false;
  if (opt.fromPop || opt.silent) return Promise.resolve();
  skipPop++;
  return new Promise(res => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    waiters.push(fin);
    setTimeout(() => { if (!done) { skipPop = Math.max(0, skipPop - 1); waiters = waiters.filter(w => w !== fin); fin(); } }, 400);   // popstate が来ない環境の保険
    history.back();
  });
}
/** popstate をシート側で処理したら true（main.js はルーティングしない） */
export function consumePop() {
  if (skipPop > 0) {
    skipPop--; const w = waiters.shift(); if (w) w();
    if (!skipPop) pushEntry();      // 戻し待ちの間に開かれたシートの分を、ここで積む
    return true;
  }
  if (pushed) { closeSheet({ fromPop: true }); return true; }
  return false;
}

/** title は生文字列、html は呼び出し側でエスケープ済みの HTML */
export function sheet(title, html) {
  pending = null; onCancel = null;            // 前のシートのコールバックを引き継がない
  $('#sheet').innerHTML = '<div class="sheet-wrap" data-act="closeSheetBg"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-h"><h2>' + esc(title) + '</h2><button class="iconbtn" data-act="closeSheet" aria-label="閉じる">' + ic('x') + '</button></div>' + html + '</div></div>';
  pushEntry();
}
function pushEntry() {
  if (pushed || skipPop > 0 || !sheetOpen()) return;   // 戻し待ち中は consumePop 側で積む
  const n = history.state && typeof history.state.n === 'number' ? history.state.n : 0;
  try { history.pushState({ n, sheet: true }, '', location.hash); pushed = true; } catch (e) { /* 積めなくてもシート自体は使える */ }
}

/** 確認シート。OK で cb()（履歴を戻し終えてから呼ぶ）。o.onCancel = キャンセル・×・背景・戻るで閉じた時 */
export function confirmSheet(o, cb) {
  sheet(o.title || '確認', '<p>' + esc(o.msg) + '</p><div class="btnrow"><button class="btn ghost" data-act="closeSheet">キャンセル</button><button class="btn pri" data-act="sheetOk">' + esc(o.ok || 'OK') + '</button></div>');
  pending = () => { closeSheet({ ok: true }).then(cb); };
  onCancel = o.onCancel || null;
}

/**
 * 1行入力シート。OK で cb(value)。
 *   cb が false を返す → シートを閉じない／関数を返す → シートを閉じ終えてから実行（画面遷移用）
 * before/after/footer は追加 HTML（エスケープ済み）
 */
export function promptSheet(o, cb) {
  const num = o.type === 'number';
  sheet(o.title, (o.before || '')
    + '<label class="lbl" for="pr-in">' + esc(o.label || '') + '</label>'
    + '<input class="txtin" id="pr-in" ' + (num ? 'type="number" inputmode="numeric"' : 'type="text" enterkeyhint="done"') + ' maxlength="' + (o.maxlength || 40) + '" autocomplete="off" placeholder="' + esc(o.placeholder || '') + '" value="' + esc(o.value == null ? '' : o.value) + '">'
    + (o.after || '')
    + '<div class="btnrow"><button class="btn ghost" data-act="closeSheet">キャンセル</button><button class="btn pri" data-act="sheetOk">' + esc(o.ok || '保存') + '</button></div>'
    + (o.footer || ''));
  pending = () => {
    const el = $('#pr-in'), v = (el ? el.value : '').trim();
    if (!v) { toast(o.emptyMsg || '入力してください'); if (el) el.focus(); return; }
    const r = cb(v);
    if (r === false) return;
    closeSheet().then(() => { if (typeof r === 'function') r(); });
  };
  const el = $('#pr-in'); if (el && o.focus !== false) { el.focus(); try { el.select(); } catch (e) { /* number では不可 */ } }
}

const RM_REPS = [3, 5, 8, 10, 12, 15];
function updRM() {
  const w = normW($('#rm-w').value), r = normRmReps($('#rm-r').value), one = w > 0 && r > 0 ? rm(w, r) : 0;
  $('#rm-out').innerHTML = '<small class="muted">推定 1RM</small><br><b>' + (one ? f1(one) : '--') + '</b> kg';
  $('#rm-tb').innerHTML = RM_REPS.map(n => '<div><small>' + n + ' 回</small>' + (one ? f1(weightForReps(one, n)) : '--') + ' kg</div>').join('');
}

export const actions = {
  closeSheet() { closeSheet(); },
  closeSheetBg(v, t, e) { if (e.target === t) closeSheet(); },
  sheetOk() { if (pending) pending(); },

  rmcalc() {
    sheet('RM計算機', '<div class="set" style="grid-template-columns:1fr;background:var(--surface);border:1px solid var(--line);border-radius:12px"><div class="main" style="justify-content:center"><div class="step"><input id="rm-w" type="number" inputmode="decimal" step="any" min="0" max="999.5" value="80" aria-label="重量"></div><span class="unit">kg ×</span><div class="step reps"><input id="rm-r" type="number" inputmode="numeric" step="1" min="1" max="999" value="8" aria-label="回数"></div><span class="unit">回</span></div></div><div class="rmout" id="rm-out"></div><div class="rmtable" id="rm-tb"></div><p class="note">換算式：重量 ×（1 + 回数 ÷ 40）</p>');
    updRM();
  },

  copyday() {
    const days = store.days(), ks = recentTrainedKeys(days, S.date, 30);   // 選択日より前の日だけ
    const rows = ks.map(k => {
      const its = days[k].items.filter(i => validSets(i).length), colors = [...new Set(its.map(i => exColor(i.ex)))];
      return '<button class="row" data-act="doCopyDay" data-arg="' + esc(k) + '"><span class="t"><b class="num">' + slash(k) + ' (' + WD[fromKey(k).getDay()] + ')</b><small>' + esc(its.map(i => exName(i.ex)).join('・')) + '</small></span>' + colors.map(dot).join('') + '</button>';
    }).join('');
    sheet('過去の日からコピー', '<p class="muted">選んだ日のメニュー（種目・重量・回数）を ' + slash(S.date) + ' にコピーします。</p>'
      + (rows ? '<div class="list">' + rows + '</div>' : '<div class="empty">' + slash(S.date) + ' より前の記録がまだありません。</div>'));
  },
  doCopyDay(k) {
    const src = store.day(k); if (!src || !(k < S.date)) { closeSheet(); return; }
    const { day, added } = mergeCopyDay(store.day(S.date), src);
    closeSheet();
    if (!added) { toast('すべての種目が既に記録されています'); return; }
    store.saveDay(S.date, day);
    rerender(true);
    toast(slash(k) + ' のメニューをコピーしました');
  },
};

export function onInput(t) {
  if (t.id === 'rm-w' || t.id === 'rm-r') { updRM(); return true; }
  return false;
}
/** 入力確定時に、丸め後の値（重量0〜999.5・回数1〜999）を欄へ反映 */
export function onChange(t) {
  if (t.id !== 'rm-w' && t.id !== 'rm-r') return false;
  const v = t.id === 'rm-w' ? normW(t.value) : normRmReps(t.value);
  const s = v == null ? '' : String(v);
  if (t.value !== s) t.value = s;
  updRM();
  return true;
}
