// body.js — 体組成（体重・体脂肪率の入力と推移グラフ）
import { S, rerender } from '../state.js';
import { store } from '../store.js';
import { $, ic, bar, chart, seg, toast } from '../ui.js';
import { todayKey, slash, md, isKey, inRange, f1, fromKey } from '../calc.js';
import { WD } from '../ui.js';

const val = v => (v == null ? '' : v);
// 画面に出した時点の値。保存時は「変更した項目だけ」を送る（画面が古くても、触っていない w / f を消さない）
let base = { w: '', f: '' };

function render() {
  const TK = todayKey(), body = store.bodies();
  if (!isKey(S.bodyDate) || S.bodyDate > TK) S.bodyDate = TK;
  const ks = Object.keys(body).sort(), kr = ks.filter(k => inRange(k, TK, S.range)), t = body[S.bodyDate] || {};
  base = { w: String(val(t.w)), f: String(val(t.f)) };
  const lastW = ks.filter(k => body[k].w).pop(), lastF = ks.filter(k => body[k].f).pop();
  const lw = lastW ? body[lastW].w : null, lf = lastF ? body[lastF].f : null, isT = S.bodyDate === TK;
  return bar('体組成', '', '', false) + '<div class="pad"><div class="dayhead mid"><h2>' + slash(S.bodyDate) + '<small>(' + WD[fromKey(S.bodyDate).getDay()] + ')' + (isT ? ' 今日の記録' : ' の記録') + '</small></h2>'
    + '<input class="datein" id="bdate" type="date" max="' + TK + '" value="' + S.bodyDate + '" aria-label="記録する日付"></div>'
    + '<div class="bodyform"><div class="field"><label for="bw">体重</label><div><input id="bw" type="number" inputmode="decimal" step="0.1" min="0" placeholder="' + val(lw) + '" value="' + val(t.w) + '"><span class="unit">kg</span></div></div>'
    + '<div class="field"><label for="bf">体脂肪率</label><div><input id="bf" type="number" inputmode="decimal" step="0.1" min="0" max="100" placeholder="' + val(lf) + '" value="' + val(t.f) + '"><span class="unit">%</span></div></div></div>'
    + '<button class="btn pri" data-act="saveBody">' + ic('check') + '記録する</button>' + seg()
    + '<div class="charts"><div class="chartbox"><h3>体重（kg）<b class="num">' + (lw ? f1(lw) : '-') + '</b></h3>' + chart(kr.filter(k => body[k].w).map(k => ({ x: md(k), y: body[k].w }))) + '</div>'
    + '<div class="chartbox"><h3>体脂肪率（%）<b class="num">' + (lf ? f1(lf) : '-') + '</b></h3>' + chart(kr.filter(k => body[k].f).map(k => ({ x: md(k), y: body[k].f }))) + '</div></div></div>';
}

const read = () => ({ w: $('#bw') ? $('#bw').value : '', f: $('#bf') ? $('#bf').value : '' });
/** 変更した項目だけの patch（変更なしなら null） */
function changed() {
  const r = read(), p = {};
  if (String(r.w).trim() !== base.w) p.w = r.w;
  if (String(r.f).trim() !== base.f) p.f = r.f;
  return Object.keys(p).length ? p : null;
}
async function save() {
  const p = changed(); if (!p) return true;
  const ok = await store.patchBody(S.bodyDate, p);
  if (ok) { const r = read(); if ('w' in p) base.w = String(r.w).trim(); if ('f' in p) base.f = String(r.f).trim(); }
  return ok;
}

const actions = {
  async saveBody() {
    const had = !!store.body(S.bodyDate), r = read();
    if (!had && String(r.w).trim() === '' && String(r.f).trim() === '') { toast('体重か体脂肪率を入力してください'); return; }
    if (!(await save())) return;                 // クラウド読み込み中などで保存できなかった（トーストは main.js が出す）
    const now = store.body(S.bodyDate);
    if (!now && !had) { toast('体重か体脂肪率を入力してください'); return; }
    rerender(true);
    toast(now ? slash(S.bodyDate) + ' の体組成を記録しました' : slash(S.bodyDate) + ' の体組成を削除しました');
  },
};

/** 入力確定時に静かに自動保存（再描画しない＝もう一方の欄のフォーカスを奪わない） */
function onChange(t) {
  if (t.id === 'bdate') {
    const TK = todayKey();
    S.bodyDate = isKey(t.value) ? (t.value > TK ? TK : t.value) : TK;
    rerender(true);
  } else if (t.id === 'bw' || t.id === 'bf') save();
}

export default { render, actions, onChange };
