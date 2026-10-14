// home.js — ホーム（日付・連続記録・カレンダー・リングゲージ・負荷量集計・選択日の記録）。v2.1.0 で 3 テーマ共通の配置に（仕様書09）
import { S, go, rerender, setDate } from '../state.js';
import { store } from '../store.js';
import { cloud } from '../cloud.js';
import { syncBadge } from '../store-firebase.js';
import { $, esc, ic, toast, WD, exName, exColor, dot } from '../ui.js';
import { openPhotoSheet } from '../photo.js';
import { todayKey, fromKey, slash, md, calendarCells, isTrained, monthDays, totalDays, rangeVol, weeklyVols, monthlyBlocks, totalVol, ringRatio, streak, ton, vehicles, VEHICLES, validSets, itemRM, f2, fw, shiftMonth, isKey, isUsableDate } from '../calc.js';

const RING_R = 94, RING_C = 2 * Math.PI * RING_R;   // viewBox 220×220、線の太さ 12

/** 棒グラフ（古い順→右が直近。末尾＝今週を濃く）。高さは最大値比の % */
function bars(vals, cls) {
  const mx = Math.max.apply(null, vals) || 1;
  return '<div class="bars ' + cls + '" aria-hidden="true">' + vals.map((v, i) => '<i class="' + (i === vals.length - 1 ? 'now' : '') + '" style="height:' + Math.max(8, v / mx * 100).toFixed(1) + '%"></i>').join('') + '</div>';
}

/** 折れ線（総合計カード用）。vals は古い順の 8 点。viewBox 80×36、なめらかにしない */
function spark(vals) {
  const mx = Math.max.apply(null, vals) || 1, n = vals.length, W = 80, H = 36, T = 3, B = 3;
  const pts = vals.map((v, i) => [(i * (W - 4) / (n - 1) + 2).toFixed(1), (H - B - (H - T - B) * v / mx).toFixed(1)]);
  const line = pts.map(p => p.join(',')).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" preserveAspectRatio="none"><polygon points="' + pts[0][0] + ',' + (H - B) + ' ' + line + ' ' + pts[n - 1][0] + ',' + (H - B) + '"/><polyline points="' + line + '"/></svg>';
}

function render() {
  const days = store.days(), TK = todayKey(), [y, m] = S.ym;
  const cells = calendarCells(y, m).map(c => {
    const tr = isTrained(days[c.key]);
    return '<button class="day' + (c.out ? ' out' : '') + (tr && !c.out ? ' done' : '') + (tr ? ' has' : '') + (c.key === S.date ? ' sel' : '') + (c.key === TK ? ' today' : '') + '" data-act="pickDay" data-arg="' + c.key + '" aria-label="' + slash(c.key) + (tr ? ' 記録あり' : '') + '"' + (c.key === S.date ? ' aria-pressed="true"' : '') + '>' + c.day + '</button>';
  }).join('');
  const v7 = rangeVol(days, TK, 0, 6), v28 = rangeVol(days, TK, 0, 27), vall = totalVol(days);
  const wk6 = weeklyVols(days, TK, 6).slice().reverse();     // 左＝5 週前 … 右＝今週
  const bl4 = monthlyBlocks(days, TK);                       // 28 日を 7 日ずつ（古い順）
  const wk8 = weeklyVols(days, TK, 8).slice().reverse();     // 折れ線用の 8 週（古い順）
  const ratio = ringRatio(vall), st = streak(days, TK);
  const d = fromKey(S.date), log = days[S.date], items = log ? log.items.filter(it => validSets(it).length) : [];
  const isToday = S.date === TK;
  const recs = items.length ? items.map(it => '<button class="rec" data-act="openEx" data-arg="' + esc(it.ex) + '"><div class="rec-h">' + dot(exColor(it.ex)) + '<b>' + esc(exName(it.ex)) + '</b><span class="rm num">RM : ' + f2(itemRM(it)) + 'kg</span></div>'
    + validSets(it).map((s, i) => '<div class="setline"><span>' + (i + 1) + '</span><span>' + fw(s.w) + ' kg</span><span>×</span><span>' + s.r + ' reps' + (s.assist ? '<em>補助</em>' : '') + (s.memo ? '<em>' + esc(s.memo) + '</em>' : '') + '</span></div>').join('') + '</button>').join('')
    : '<div class="empty pen"><b>' + ic('bell') + 'トレーニング</b><p>この日の記録はまだありません。<br>「トレーニングを追加」から種目を選んでください。</p></div>';
  // 同期の小さな状態表示（未送信あり・オフライン・エラーの時だけ）と、未ログイン時のログイン案内
  const badge = cloud ? syncBadge(store.syncState(), !!cloud.state().user) : '';
  const loginCard = cloud && cloud.showLoginCard()
    ? '<div class="logincard"><p><b><span class="nw">Googleでログインすると</span><wbr> <span class="nw">iPhone と PC で</span><wbr><span class="nw">記録が同期されます</span></b><span>ログインしなくても、この端末の中だけで使えます。</span></p>'
      + '<div class="btnrow"><button class="btn sm ghost" data-act="loginLater">あとで</button><button class="btn sm pri" data-act="login"' + (cloud.state().signingIn ? ' disabled' : '') + '>' + (cloud.state().signingIn ? 'ログイン処理中…' : 'Googleでログイン') + '</button></div></div>'
    : '';
  const ringLabel = '総合計負荷量 ' + ton(vall) + ' t、旅客機 × ' + vehicles(vall, VEHICLES.plane);
  const dw = '(' + WD[d.getDay()] + ')' + (isToday ? ' 今日' : '');
  return '<section class="pad home">'
    // ヘッダー（上部の「空」は CSS の .home::before）: ダンベル＋タイトル＋タグライン＋同期バッジ、右にテーマ巡回・設定
    + '<header class="htop"><div class="brand"><span class="logo" aria-hidden="true">' + ic('bell') + '</span><div class="bt"><h1>WorkOut Note</h1><p class="tagline">今日の積み重ねが、明日の自分をつくる。</p><small class="syncbadge" id="syncbadge" role="status"' + (badge ? '' : ' hidden') + '>' + esc(badge) + '</small></div></div>'
    + '<div class="hbtns"><button class="iconbtn" data-act="skin" aria-label="テーマ切り替え（サンセット／ゴールド／グリーン）">' + ic('skin') + '</button><button class="iconbtn" data-act="tab" data-arg="settings" aria-label="設定">' + ic('set') + '</button></div></header>'
    + loginCard
    + '<div class="hgrid">'
    // 行 1 左: 日付カード（暗い半透明）＋連続記録バッジ。カード全体のタップで今日へ
    + '<div class="hdate glass"><div class="datebtn" data-act="goToday" role="button" tabindex="0" title="タップで今日に戻る" aria-label="' + slash(S.date) + ' ' + dw + '（タップで今日に戻る）"><span class="yr">' + S.date.slice(0, 4) + '</span><span class="calic">' + ic('cal') + '</span><span class="dn">' + md(S.date) + '</span><span class="dw">' + dw + '</span></div>'
    + '<div class="streak"><b>' + ic('flame') + st + ' days</b><span>' + (st ? '連続トレーニング中' : '今日から再開') + '</span></div></div>'
    // 行 1 右: 総合計負荷量カード（紙）＝見出し＋›、リングゲージ（次の旅客機 1 機までの進み具合）
    + '<div class="hring paper"><div class="ch"><span class="chipic ctot">' + ic('bell') + '</span><h2>総合計負荷量</h2><button class="arrbtn" data-act="tab" data-arg="analysis" aria-label="履歴/分析を開く">' + ic('next') + '</button></div>'
    + '<div class="ring"><svg viewBox="0 0 220 220" role="img" aria-label="' + ringLabel + '"><defs><linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ring-a)"/><stop offset="1" style="stop-color:var(--ring-b)"/></linearGradient></defs>'
    + '<circle class="track" cx="110" cy="110" r="' + RING_R + '"/><circle class="fill" cx="110" cy="110" r="' + RING_R + '" stroke="url(#ringgrad)" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + (RING_C * (1 - ratio)).toFixed(2) + '" transform="rotate(-90 110 110)"/>'
    // .t はリング内の見出し（380〜479px だけ CSS で表示。それ以外は .ch の h2 が見出し）
    + '<text class="t" x="110" y="66" aria-hidden="true">総合計負荷量</text><text class="v" x="110" y="118">' + ton(vall) + ' t</text><text class="s" x="110" y="146">旅客機 × ' + vehicles(vall, VEHICLES.plane) + '</text></svg></div></div>'
    // 行 2 左: カレンダー（紙・丸いセル）
    + '<div class="hcal paper"><div class="month"><button data-act="mon" data-arg="-1" aria-label="前の月">‹</button><h2 aria-live="polite">' + y + '年 ' + (m + 1) + '月</h2><button data-act="mon" data-arg="1" aria-label="次の月">›</button></div>'
    + '<div class="dow"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div><div class="days">' + cells + '</div>'
    + '<div class="legend"><span><i class="on"></i>トレーニングあり</span><span><i></i>トレーニングなし</span></div></div>'
    // 行 2 右: 集計カード 3 枚（7 日間＝週別 6 本、28 日間＝7 日ブロック 4 本、総合計＝8 週の折れ線）
    + '<div class="hstats"><div class="stat glass"><span class="chipic c7">' + ic('bell') + '</span><h2>合計負荷量 / 7日間</h2><span class="arr">' + ic('next') + '</span><b class="val">' + ton(v7) + ' t</b><span class="sub">乗用車 × ' + vehicles(v7, VEHICLES.car) + '</span>' + bars(wk6, 'b7') + '</div>'
    + '<div class="stat glass"><span class="chipic c28">' + ic('cal') + '</span><h2>合計負荷量 / 28日間</h2><span class="arr">' + ic('next') + '</span><b class="val">' + ton(v28) + ' t</b><span class="sub">バス × ' + vehicles(v28, VEHICLES.bus) + '</span>' + bars(bl4, 'b28') + '</div>'
    + '<div class="stat glass"><span class="chipic ctot">' + ic('sigma') + '</span><h2>総合計負荷量</h2><span class="arr">' + ic('next') + '</span><b class="val">' + ton(vall) + ' t</b><span class="sub">旅客機 × ' + vehicles(vall, VEHICLES.plane) + '</span><div class="bars btot" aria-hidden="true">' + spark(wk8) + '</div></div></div>'
    + '</div>'
    // MONTHLY ARCHIVE（暗い半透明・全幅）
    + '<div class="archive glass"><span class="aring" aria-hidden="true"><svg viewBox="0 0 48 48"><circle class="t" cx="24" cy="24" r="19"/><circle class="f" cx="24" cy="24" r="19" stroke="url(#ringgrad)" transform="rotate(-90 24 24)"/></svg></span><div class="al"><small>MONTHLY ARCHIVE</small><b>' + monthDays(days, y, m) + '<span>days</span></b></div><span class="arr">' + ic('next') + '</span><div class="al tot"><small>TOTAL</small><b class="pill">' + totalDays(days) + '<span>days</span></b></div></div>'
    // 主ボタン行
    + '<div class="cta-row"><button class="btn pri" data-act="pick">' + ic('plus') + (isToday ? '本日の' : '') + 'トレーニングを追加<span class="arr">' + ic('next') + '</span></button><button class="btn glassbtn" data-act="rmcalc">' + ic('bell') + 'RM計算機</button></div>'
    // トレーニング履歴カード（紙）: 見出し＋すべて見る、日付｜記録｜タイル、コピー・写真、メモ
    + '<div class="histcard paper"><div class="hist-h"><h2>' + ic('note') + 'トレーニング履歴</h2><button class="linkbtn" data-act="tab" data-arg="analysis">すべて見る' + ic('next') + '</button></div>'
    + '<div class="hrow' + (items.length ? ' has' : '') + '"><div class="hd"><span class="yr">' + S.date.slice(0, 4) + '</span><span class="dn">' + md(S.date) + '</span><span class="dw">' + dw + '</span></div>'
    + '<div class="records">' + recs + '</div><span class="htile" aria-hidden="true">' + ic('bell') + '</span></div>'
    + '<div class="dayacts"><button class="btn sm ghost" data-act="copyday">' + ic('copy') + '過去の日からコピー</button>'
    + (items.length ? '<button class="btn sm ghost" data-act="photo">' + ic('camera') + '写真に記録を載せる</button>' : '') + '</div>'
    + '<input type="file" id="photo-in" accept="image/*" hidden aria-hidden="true">'
    + '<input class="memo" id="daymemo" maxlength="200" autocomplete="off" placeholder="この日のメモ（体調・睡眠など）" aria-label="この日のメモ" value="' + esc(log ? log.memo : '') + '"></div>'
    + '</section>';
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
  photo() { const i = $('#photo-in'); if (i) i.click(); },   // iOS はユーザー操作の中で同期的に呼ばないとピッカーが開かない
};

function onInput(t) {
  if (t.id !== 'daymemo') return;
  const cur = store.day(S.date);
  store.saveDay(S.date, { memo: t.value, items: cur ? cur.items : [] });   // 再描画しない（フォーカス維持）
}

/** 写真の選択（隠し input）。同じ写真を続けて選べるよう value を空に戻す */
function onChange(t) {
  if (t.id !== 'photo-in') return;
  const f = t.files && t.files[0];
  if (f) openPhotoSheet(f, S.date);
  t.value = '';
}

export default { render, actions, onInput, onChange };
