// pick.js — 種目選択
import { S, go, rerender } from '../state.js';
import { store, newId } from '../store.js';
import { esc, ic, bar, toast, parts, exercises, exOf, dot } from '../ui.js';
import { slash, exHistory, validSets, fw, normName, findSameName } from '../calc.js';
import { promptSheet } from './sheets.js';

/** 同名種目があった時の案内 */
export const dupMsg = dup => (dup.hidden ? '同じ名前の種目が非表示になっています（種目の管理から再表示できます）' : '同じ名前の種目が既にあります');

const visibleParts = () => parts().filter(p => !p.hidden);
function curPart() {
  const vp = visibleParts();
  if (!vp.some(p => p.id === S.part)) S.part = vp.length ? vp[0].id : null;
  return S.part;
}

function render() {
  const vp = visibleParts(), cur = curPart(), days = store.days();
  if (!vp.length) return bar('種目を選ぶ', slash(S.date)) + '<div class="pad"><div class="empty">表示できる部位がありません。<br>設定の「部位・種目の管理」で部位を追加または再表示してください。</div></div>';
  const chips = vp.map(p => '<button class="chip' + (p.id === cur ? ' on' : '') + '" data-act="part" data-arg="' + esc(p.id) + '" aria-pressed="' + (p.id === cur) + '">' + dot(p.color) + esc(p.name) + '</button>').join('');
  const rows = exercises().filter(e => e.part === cur && !e.hidden).map(e => {
    const h = exHistory(days, e.id)[0], vs = h ? validSets(h.it) : [], ls = vs[vs.length - 1];
    return '<button class="row" data-act="openEx" data-arg="' + esc(e.id) + '"><span class="t"><b>' + esc(e.name) + '</b><small>' + (h ? '前回 ' + slash(h.k) + '　' + fw(ls.w) + 'kg × ' + ls.r : '記録なし') + '</small></span>' + ic('next') + '</button>';
  }).join('');
  return bar('種目を選ぶ', slash(S.date)) + '<div class="pad"><div class="chips">' + chips + '</div>'
    + (rows ? '<div class="list">' + rows + '</div>' : '<div class="empty">この部位にはまだ種目がありません。</div>')
    + '<button class="btn sm ghost" data-act="newEx">' + ic('plus') + '新しい種目を追加</button></div>';
}

const actions = {
  part(v) { S.part = v; rerender(true); },
  /** ホームの記録カード／種目リストから。種目選択から開く時は履歴を置き換える（戻る＝ホーム） */
  // マスタに無い種目ID（「（不明な種目）」）の記録もホームから開ける。開けるかどうかは main.js の parse() が判定する
  openEx(id) { if (id) go('#/entry/' + S.date + '/' + encodeURIComponent(id), { replace: S.route.name === 'pick' }); },
  newEx() {
    const part = curPart(); if (!part) return;
    promptSheet({ title: '新しい種目を追加', label: '種目名', placeholder: '例：ケーブルフライ', ok: '追加して記録へ', emptyMsg: '種目名を入力してください' }, raw => {
      const m = store.master(), id = newId(), name = normName(raw), dup = findSameName(m.exercises, part, name);
      if (dup) { toast(dupMsg(dup)); return false; }
      store.saveMaster({ ...m, exercises: m.exercises.concat([{ id, part, name }]) });
      toast('「' + name + '」を追加しました');
      return () => go('#/entry/' + S.date + '/' + id, { replace: true });   // シートを閉じ終えてから遷移
    });
  },
};

export default { render, actions };
