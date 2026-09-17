// analysis.js — 履歴/分析タブ（部位別の種目一覧）
import { go } from '../state.js';
import { store } from '../store.js';
import { esc, ic, bar, parts, exercises, exOf, dot } from '../ui.js';
import { slash, exHistory, itemRM, f1 } from '../calc.js';

function render() {
  const days = store.days(), known = new Set(parts().map(p => p.id));
  const row = e => {
    const hs = exHistory(days, e.id); if (!hs.length) return '';
    return '<button class="row" data-act="histOf" data-arg="' + esc(e.id) + '"><span class="t"><b>' + esc(e.name) + '</b><small>最終 ' + slash(hs[0].k) + '・' + hs.length + '回</small></span><span class="r">1RM ' + f1(hs.reduce((a, h) => Math.max(a, itemRM(h.it)), 0)) + 'kg</span>' + ic('next') + '</button>';
  };
  // 非表示の部位・種目も、記録があれば表示する
  let html = parts().map(p => {
    const rows = exercises().filter(e => e.part === p.id).map(row).join('');
    return rows ? '<div class="sect">' + dot(p.color) + esc(p.name) + '</div><div class="list">' + rows + '</div>' : '';
  }).join('');
  const orphan = exercises().filter(e => !known.has(e.part)).map(row).join('');
  if (orphan) html += '<div class="sect">その他</div><div class="list">' + orphan + '</div>';
  return bar('履歴 / 分析', '', '', false) + '<div class="pad">' + (html || '<div class="empty">まだ記録がありません。<br>ホームの「トレーニングを追加」から記録すると、ここに種目ごとの履歴が並びます。</div>') + '</div>';
}

const actions = {
  histOf(id) { if (exOf(id)) go('#/history/' + encodeURIComponent(id)); },
};

export default { render, actions };
