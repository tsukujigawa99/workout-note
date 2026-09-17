// home.js — ホーム（カレンダー＋負荷量集計＋選択日の記録）
import { S, go, rerender, setDate } from '../state.js';
import { store } from '../store.js';
import { cloud } from '../cloud.js';
import { syncBadge } from '../store-firebase.js';
import { esc, ic, toast, MONTHS, WD, exName, exColor, dot } from '../ui.js';
import { todayKey, fromKey, slash, calendarCells, isTrained, monthDays, totalDays, rangeVol, weeklyVols, totalVol, ton, vehicles, VEHICLES, validSets, itemRM, f2, fw, shiftMonth, isKey, isUsableDate } from '../calc.js';

function render() {
  const days = store.days(), TK = todayKey(), [y, m] = S.ym;
  const cells = calendarCells(y, m).map(c => {
    const tr = isTrained(days[c.key]);
    return '<button class="day' + (c.out ? ' out' : '') + (tr && !c.out ? ' done' : '') + (tr ? ' has' : '') + (c.key === S.date ? ' sel' : '') + (c.key === TK ? ' today' : '') + '" data-act="pickDay" data-arg="' + c.key + '" aria-label="' + slash(c.key) + (tr ? ' 記録あり' : '') + '"' + (c.key === S.date ? ' aria-pressed="true"' : '') + '>' + c.day + '</button>';
  }).join('');
  const v7 = rangeVol(days, TK, 0, 6), v28 = rangeVol(days, TK, 0, 27), vall = totalVol(days);
  const wk = weeklyVols(days, TK, 6), mx = Math.max.apply(null, wk) || 1;
  const bars = wk.map((v, i) => '<span class="' + (i ? '' : 'now') + '">' + (i ? i + '週前' : '今週') + '</span><i class="' + (i ? '' : 'now') + '" style="width:' + Math.max(2, v / mx * 100).toFixed(1) + '%"></i>').join('');
  const d = fromKey(S.date), log = days[S.date], items = log ? log.items.filter(it => validSets(it).length) : [];
  const recs = items.length ? items.map(it => '<button class="rec" data-act="openEx" data-arg="' + esc(it.ex) + '"><div class="rec-h">' + dot(exColor(it.ex)) + '<b>' + esc(exName(it.ex)) + '</b><span class="rm num">RM : ' + f2(itemRM(it)) + 'kg</span></div>'
    + validSets(it).map((s, i) => '<div class="setline"><span>' + (i + 1) + '</span><span>' + fw(s.w) + ' kg</span><span>×</span><span>' + s.r + ' reps' + (s.assist ? '<em>補助</em>' : '') + (s.memo ? '<em>' + esc(s.memo) + '</em>' : '') + '</span></div>').join('') + '</button>').join('')
    : '<div class="empty">この日の記録はまだありません。<br>「トレーニングを追加」から種目を選んでください。</div>';
  // 同期の小さな状態表示（未送信あり・オフライン・エラーの時だけ）と、未ログイン時のログイン案内
  const badge = cloud ? syncBadge(store.syncState(), !!cloud.state().user) : '';
  const loginCard = cloud && cloud.showLoginCard()
    ? '<div class="logincard"><p><b><span class="nw">Googleでログインすると</span><wbr> <span class="nw">iPhone と PC で</span><wbr><span class="nw">記録が同期されます</span></b><span>ログインしなくても、この端末の中だけで使えます。</span></p>'
      + '<div class="btnrow"><button class="btn sm ghost" data-act="loginLater">あとで</button><button class="btn sm pri" data-act="login"' + (cloud.state().signingIn ? ' disabled' : '') + '>' + (cloud.state().signingIn ? 'ログイン処理中…' : 'Googleでログイン') + '</button></div></div>'
    : '';
  return '<section class="hero"><div class="hero-top"><button class="iconbtn" data-act="tab" data-arg="settings" aria-label="設定">' + ic('set') + '</button><div class="brand">WorkOut Note<small class="syncbadge" id="syncbadge" role="status"' + (badge ? '' : ' hidden') + '>' + esc(badge) + '</small></div><button class="iconbtn" data-act="skin" aria-label="赤/黒テーマ切り替え">' + ic('skin') + '</button></div>'
    + '<div class="hero-grid"><div><div class="month"><h1 data-act="goToday" role="button" tabindex="0" title="タップで今日に戻る" aria-label="' + MONTHS[m] + ' ' + y + '（タップで今日に戻る）"><span class="mfull">' + MONTHS[m] + '</span><span class="mabbr">' + MONTHS[m].slice(0, 3) + '</span> ' + y + '</h1><button data-act="mon" data-arg="-1" aria-label="前の月">‹</button><button data-act="mon" data-arg="1" aria-label="次の月">›</button></div>'
    + '<div class="dow"><span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span></div><div class="days">' + cells + '</div>'
    + '<div class="archive"><div class="lbl">MONTHLY<br>ARCHIVE</div><div class="big">' + monthDays(days, y, m) + ' <small>days</small></div><div class="tot">TOTAL<b>' + totalDays(days) + ' days</b></div></div></div>'
    + '<div class="stats"><div class="stat"><h2>合計負荷量 / 7日間</h2><div class="v"><b>' + ton(v7) + ' t</b><span>乗用車 × ' + vehicles(v7, VEHICLES.car) + '</span></div><div class="weeks">' + bars + '</div></div>'
    + '<div class="stat"><h2>合計負荷量 / 28日間</h2><div class="v"><b>' + ton(v28) + ' t</b><span>バス × ' + vehicles(v28, VEHICLES.bus) + '</span></div></div>'
    + '<div class="stat"><h2>総合計負荷量</h2><div class="v"><b>' + ton(vall) + ' t</b><span>旅客機 × ' + vehicles(vall, VEHICLES.plane) + '</span></div></div></div></div></section>'
    + '<div class="pad">' + loginCard + '<div class="cta-row"><button class="btn pri" data-act="pick">' + ic('plus') + (S.date === TK ? '本日の' : '') + 'トレーニングを追加</button><button class="btn" data-act="rmcalc">' + ic('bell') + 'RM計算機</button></div>'
    + '<div class="dayhead"><h2>' + slash(S.date) + '<small>(' + WD[d.getDay()] + ')' + (S.date === TK ? ' 今日' : '') + '</small></h2><button class="btn sm ghost" data-act="copyday">' + ic('copy') + '過去の日からコピー</button></div>'
    + '<div class="records">' + recs + '</div>'
    + '<input class="memo" id="daymemo" maxlength="200" autocomplete="off" placeholder="この日のメモ（体調・睡眠など）" aria-label="この日のメモ" value="' + esc(log ? log.memo : '') + '"></div>';
}

const actions = {
  mon(v) { S.ym = shiftMonth(S.ym[0], S.ym[1], +v); rerender(true); },
  pickDay(k) {
    if (!isKey(k)) return;
    if (!isUsableDate(k, todayKey())) { toast('この日付は選択できません（2000年〜1年先まで）'); return; }   // URL の日付制限と揃える
    setDate(k); rerender(true);
  },
  goToday() { setDate(todayKey()); rerender(true); },
  pick() { go('#/pick/' + S.date); },
};

function onInput(t) {
  if (t.id !== 'daymemo') return;
  const cur = store.day(S.date);
  store.saveDay(S.date, { memo: t.value, items: cur ? cur.items : [] });   // 再描画しない（フォーカス維持）
}

export default { render, actions, onInput };
