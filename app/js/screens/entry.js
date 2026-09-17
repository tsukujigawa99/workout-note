// entry.js — セット入力（即時自動保存。入力中は再描画しない）
import { S, go, back, rerender } from '../state.js';
import { store } from '../store.js';
import { timer, mmss } from '../timer.js';
import { $, esc, ic, bar, toast, exName } from '../ui.js';
import { TIMER_PRESETS } from '../defaults.js';
import { slash, exHistory, validSets, isValidSet, setW, rm, f2, fw, normW, normR, stepWeight, stepReps, copySets } from '../calc.js';
import { confirmSheet } from './sheets.js';

// 画面上の作業用データ（空セットを含む）。保存データには有効セットだけを書く
let draft = null;   // { date, ex, idx, sets:[{w,r,memo,assist}] }
const blank = w => ({ w: w == null ? null : w, r: null, memo: '', assist: false });

function buildDraft(ex) {
  const day = store.day(S.date), idx = day ? day.items.findIndex(i => i.ex === ex) : -1;
  const sets = idx >= 0 ? day.items[idx].sets.map(s => ({ ...s })) : [];
  draft = { date: S.date, ex, idx: idx >= 0 ? idx : null, sets };
  fill();
}
function fill() { if (!draft.sets.length) for (let i = 0; i < 3; i++) draft.sets.push(blank()); }

/** draft の有効セットだけを保存データに反映（有効セットが無ければ種目ごと消える） */
function persist() {
  if (!draft) return;
  draft.dirty = true;                  // 手元で変更した（以後、他端末の変更が届いても作り直さない）
  const cur = store.day(draft.date), day = { memo: cur ? cur.memo : '', items: cur ? cur.items.map(it => ({ ex: it.ex, sets: it.sets })) : [] };
  const sets = draft.sets.filter(isValidSet).map(s => ({ ...s }));
  const i = day.items.findIndex(it => it.ex === draft.ex);
  if (sets.length) {
    if (i >= 0) day.items[i] = { ex: draft.ex, sets };
    else day.items.splice(Math.min(draft.idx == null ? day.items.length : draft.idx, day.items.length), 0, { ex: draft.ex, sets });
  } else if (i >= 0) day.items.splice(i, 1);
  else return;   // 保存データに無く、有効セットも無い → 何も書かない
  store.saveDay(draft.date, day);
}

const rmText = s => (isValidSet(s) ? 'RM ' + f2(rm(setW(s), s.r)) + 'kg' : '');
const val = v => (v == null ? '' : v);

function setRow(s, i) {
  const st = store.settings().step, n = i + 1;
  return '<div class="set" id="set-' + i + '"><div class="no">' + n + '</div><div class="main">'
    + '<div class="step"><button data-act="stepW" data-arg="' + i + ',-1" aria-label="重量を' + st + 'kg減らす">−</button><input id="w-' + i + '" data-f="w" data-i="' + i + '" type="number" inputmode="decimal" step="any" min="0" max="999.5" placeholder="重さ" value="' + val(s.w) + '" aria-label="' + n + 'セット目の重量"><button data-act="stepW" data-arg="' + i + ',1" aria-label="重量を' + st + 'kg増やす">＋</button></div><span class="unit">kg ×</span>'
    + '<div class="step reps"><button data-act="stepR" data-arg="' + i + ',-1" aria-label="回数を1減らす">−</button><input id="r-' + i + '" data-f="r" data-i="' + i + '" type="number" inputmode="numeric" step="1" min="0" max="999" placeholder="回数" value="' + val(s.r) + '" aria-label="' + n + 'セット目の回数"><button data-act="stepR" data-arg="' + i + ',1" aria-label="回数を1増やす">＋</button></div><span class="unit">回</span></div>'
    + '<div class="subl"><input class="memo" id="m-' + i + '" data-f="memo" data-i="' + i + '" maxlength="100" autocomplete="off" placeholder="メモ" value="' + esc(s.memo) + '" aria-label="' + n + 'セット目のメモ"><span class="rmv" id="rm-' + i + '">' + rmText(s) + '</span>'
    + '<button class="assist' + (s.assist ? ' on' : '') + '" id="as-' + i + '" data-act="assist" data-arg="' + i + '" aria-pressed="' + !!s.assist + '">' + ic('check') + '補助</button><button class="del" data-act="delSet" data-arg="' + i + '" aria-label="' + n + 'セット目を削除">' + ic('trash') + '</button></div></div>';
}

function timerInner() {
  return '<div class="presets">' + TIMER_PRESETS.map(v => '<button data-act="preset" data-arg="' + v + '" aria-label="' + v + '秒">' + v + '</button>').join('') + '</div><div class="pill">' + ic('timer')
    + (timer.running() ? '<span class="count" id="count" aria-live="off">' + mmss(timer.remaining()) + '</span><button class="go" data-act="timerStop">STOP</button>'
      : '<input id="tsec" type="number" inputmode="numeric" min="1" max="3600" value="' + timer.sec + '" aria-label="インターバル秒数"><button class="go" data-act="timerStart">START</button>') + '</div>';
}
/** タイマー部分だけを描き直す（セット入力欄のフォーカスを奪わない） */
export function refreshTimer(ring) {
  const el = $('#timer'); if (!el) return;
  el.innerHTML = timerInner();
  el.classList.toggle('ring', !!ring);
}
export function tickTimer(left) { const c = $('#count'); if (c) c.textContent = mmss(left); }

function render() {
  if (!draft) return '';
  const h = exHistory(store.days(), draft.ex, draft.date)[0];
  const last = h ? '<div class="last"><div class="t"><h3>Last Record :<span>' + slash(h.k) + '</span></h3>' + validSets(h.it).map((s, i) => '<div class="setline"><span>' + (i + 1) + '</span><span>' + fw(s.w) + ' kg</span><span>×</span><span>' + s.r + ' reps</span></div>').join('') + '</div><div class="acts"><button class="btn sm pri" data-act="copyLast">' + ic('copy') + 'コピー</button><button class="btn sm ghost" data-act="hist">履歴</button></div></div>'
    : '<div class="last"><div class="t"><h3>Last Record :<span>なし</span></h3><span class="muted">この種目は初めての記録です</span></div></div>';
  return bar(exName(draft.ex), slash(draft.date), '<button class="iconbtn" data-act="hist" aria-label="履歴とグラフ">' + ic('chart') + '</button>')
    + '<div class="pad"><div class="timer" id="timer">' + timerInner() + '</div>'
    + '<div>' + last + '<div class="sets">' + draft.sets.map(setRow).join('') + '</div></div>'
    + '<div class="addset"><button class="btn" data-act="addSet">' + ic('plus') + 'セットを追加</button><button class="btn pri" data-act="back">' + ic('check') + '記録して戻る</button></div>'
    + '<button class="btn sm ghost danger" data-act="delItem">' + ic('trash') + 'この種目の記録を削除</button></div>';
}

const setAt = i => (draft && draft.sets[+i]) || null;
function showSet(i) {     // 再描画せずに i 番目の表示だけ更新
  const s = setAt(i); if (!s) return;
  const w = $('#w-' + i), r = $('#r-' + i), o = $('#rm-' + i);
  if (w) w.value = val(s.w); if (r) r.value = val(s.r); if (o) o.textContent = rmText(s);
}

const actions = {
  stepW(a) {
    const [i, dir] = a.split(',').map(Number), s = setAt(i); if (!s) return;
    if (s.w == null) {
      const prev = i > 0 ? draft.sets[i - 1].w : null, h = exHistory(store.days(), draft.ex, draft.date)[0], hv = h ? validSets(h.it)[0] : null;
      s.w = prev != null ? prev : (hv && hv.w != null ? hv.w : 20);
    } else s.w = stepWeight(s.w, dir * store.settings().step);
    showSet(i); persist();
  },
  stepR(a) {
    const [i, dir] = a.split(',').map(Number), s = setAt(i); if (!s) return;
    s.r = s.r == null ? 10 : stepReps(s.r, dir);
    showSet(i); persist();
  },
  assist(i) {
    const s = setAt(i); if (!s) return;
    s.assist = !s.assist;
    const b = $('#as-' + i); if (b) { b.classList.toggle('on', s.assist); b.setAttribute('aria-pressed', String(s.assist)); }
    persist();
  },
  addSet() {
    if (!draft) return;
    const p = draft.sets[draft.sets.length - 1];
    draft.sets.push(blank(p ? p.w : null));
    draft.dirty = true;
    rerender(true);
    const el = $('#r-' + (draft.sets.length - 1)); if (el) el.focus();
  },
  delSet(i) {
    const s = setAt(i); if (!s) return;
    const idx = +i, d = draft, hadValue = s.w != null || s.r != null || !!s.memo || !!s.assist;
    d.sets.splice(idx, 1);
    const refilled = !d.sets.length; fill(); persist(); rerender(true);
    if (!hadValue) return;                       // 空セットは即削除
    toast((idx + 1) + 'セット目を削除しました', {
      action: '元に戻す', ms: 5000,
      onAction: () => {
        if (draft !== d) return;                 // 別の種目・日付に移っていたら何もしない
        if (refilled) d.sets = d.sets.filter(x => x.w != null || x.r != null || x.memo || x.assist);   // 自動で補った空セットは外す
        d.sets.splice(Math.min(idx, d.sets.length), 0, s);
        persist(); rerender(true); toast('セットを元に戻しました');
      },
    });
  },
  copyLast() {
    const h = exHistory(store.days(), draft.ex, draft.date)[0]; if (!h) return;
    const d = draft, run = () => {
      if (draft !== d) return;
      d.sets = copySets(h.it); fill(); persist(); rerender(true);
      toast('前回（' + slash(h.k) + '）の記録をコピーしました');
    };
    // 入力済み（有効セットあり）の時だけ確認する
    if (d.sets.some(isValidSet)) confirmSheet({ title: '前回の記録をコピー', msg: '入力済みのセットを前回の記録で置き換えます。', ok: '置き換える' }, run);
    else run();
  },
  delItem() {
    if (!draft) return;
    const day = store.day(draft.date), has = !!(day && day.items.some(it => it.ex === draft.ex));
    const d = draft, run = () => { if (draft !== d) return; d.sets = []; persist(); draft = null; toast('記録を削除しました'); back(); };
    if (!has) { draft = null; back(); return; }
    confirmSheet({ title: '記録の削除', msg: slash(draft.date) + ' の「' + exName(draft.ex) + '」の記録を削除します。よろしいですか？', ok: '削除する' }, run);
  },
  hist() { if (draft) go('#/history/' + encodeURIComponent(draft.ex)); },
  preset(v) {
    timer.setSec(v);
    const el = $('#tsec');
    if (el) el.value = timer.sec; else { timer.start(); refreshTimer(); }
  },
  timerStart() { const el = $('#tsec'); timer.start(el && el.value ? el.value : null); refreshTimer(); },
  timerStop() { timer.stop(); refreshTimer(); },
};

function onInput(t) {
  if (t.id === 'tsec') { timer.setSec(t.value); return; }
  const f = t.dataset.f, s = f ? setAt(t.dataset.i) : null; if (!s) return;
  if (f === 'memo') s.memo = t.value;
  else if (f === 'w') s.w = normW(t.value);
  else if (f === 'r') s.r = normR(t.value);
  const o = $('#rm-' + t.dataset.i); if (o) o.textContent = rmText(s);
  persist();
}
/** 入力確定（フォーカスが外れた）時に、丸め後の値を表示へ反映 */
function onChange(t) {
  if (t.id === 'tsec') { t.value = timer.sec; return; }
  const f = t.dataset.f, s = f ? setAt(t.dataset.i) : null; if (!s || f === 'memo') return;
  const v = val(s[f]); if (String(v) !== t.value) t.value = v;
}

/** prev = 直前のルート。履歴画面から戻った時だけ作業中の draft を引き継ぐ */
function enter(r, prev) {
  if (draft && prev && prev.name === 'history' && prev.ex === r.ex && draft.ex === r.ex && draft.date === r.date) return;
  buildDraft(r.ex);      // 対象日は URL の日付（main.js が S.date に反映済み）
}
function leave(next) { if (!next || next.name !== 'history') draft = null; }
/** 他タブ等でデータが変わった時 */
function reload() { if (draft) buildDraft(draft.ex); }
/** 他端末の変更が届いた時: 手元でまだ何も変更していなければ最新の内容で draft を作り直す（作り直したら true） */
function refreshIfClean() {
  if (!draft || draft.dirty) return false;
  buildDraft(draft.ex);
  return true;
}

export default { render, actions, onInput, onChange, enter, leave, reload, refreshIfClean };
