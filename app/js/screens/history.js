// history.js — 種目履歴・分析（グラフ＋日付ごとのカード）
import { S, rerender } from '../state.js';
import { store } from '../store.js';
import { bar, chart, seg, exName } from '../ui.js';
import { todayKey, slash, md, exHistory, inRange, itemRM, itemVol, validSets, rm, setW, f1, f2, fw } from '../calc.js';

let exId = null;

function render() {
  const TK = todayKey(), hs = exHistory(store.days(), exId), hr = hs.filter(h => inRange(h.k, TK, S.range)).reverse();
  const best = hs.reduce((a, h) => Math.max(a, itemRM(h.it)), 0);
  const cards = hs.map(h => '<div class="card"><div class="card-h"><b>' + slash(h.k) + '</b><span>TOTAL : ' + f1(itemVol(h.it)) + 'kg　MAX 1RM : ' + f1(itemRM(h.it)) + 'kg</span></div><table class="h"><tr><th>セット</th><th>重さ</th><th>回数</th><th>RM</th></tr>'
    + validSets(h.it).map((s, i) => '<tr><td>' + (i + 1) + '</td><td>' + fw(s.w) + '<small>kg</small></td><td>' + s.r + '<small>回</small></td><td class="rm">' + f2(rm(setW(s), s.r)) + 'kg</td></tr>').join('') + '</table></div>').join('');
  return bar(exName(exId), '履歴 / 分析') + '<div class="pad">' + seg()
    + '<div class="charts"><div class="chartbox"><h3>推定1RM（最大）<b class="num">BEST ' + f1(best) + ' kg</b></h3>' + chart(hr.map(h => ({ x: md(h.k), y: itemRM(h.it) }))) + '</div>'
    + '<div class="chartbox"><h3>総ボリューム（kg）</h3>' + chart(hr.map(h => ({ x: md(h.k), y: itemVol(h.it) }))) + '</div></div>'
    + (cards ? '<div class="cards">' + cards + '</div>' : '<div class="empty">まだ記録がありません。</div>') + '</div>';
}

const actions = {
  range(v) { S.range = +v || 0; rerender(true); },   // 体組成画面と共用
};

function enter(r) { exId = r.ex; }

export default { render, actions, enter };
