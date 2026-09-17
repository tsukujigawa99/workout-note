// settings.js — 設定
import { go, rerender } from '../state.js';
import { store } from '../store.js';
import { cloud } from '../cloud.js';
import { syncLabel } from '../store-firebase.js';
import { timer } from '../timer.js';
import { $, esc, ic, bar, toast } from '../ui.js';
import { APP_NAME, APP_VERSION, STEP_CHOICES, TIMER_PRESETS } from '../defaults.js';
import { sheet, closeSheet, promptSheet } from './sheets.js';

const skin = () => document.documentElement.dataset.skin === 'black' ? 'black' : 'red';

function render() {
  const s = store.settings();
  const r = (t, sub, v, act) => '<button class="row" data-act="' + act + '"><span class="t"><b>' + esc(t) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="r">' + esc(v || '') + '</span>' + ic('next') + '</button>';
  return bar('設定', '', '', false) + '<div class="pad">'
    + '<div class="sect">表示</div><div class="list">' + r('テーマ', 'ホーム右上のボタンでも切り替えできます', skin() === 'red' ? '赤' : '黒', 'skin') + '</div>'
    + '<div class="sect">記録</div><div class="list">' + r('部位・種目の管理', '追加・名称変更・並び替え・非表示', '', 'openMaster') + r('重量の増減ステップ', '＋／−ボタン1回あたり', s.step + ' kg', 'setStep') + r('インターバルの初期値', 'タイマーの秒数', s.timerSec + ' 秒', 'setTimerSec') + '</div>'
    + account()
    + '<div class="sect">このアプリについて</div><div class="list"><div class="row"><span class="t"><b>' + esc(APP_NAME) + '</b><small>' + (cloud && cloud.state().user ? '記録はクラウドに同期されます' : '記録はこの端末の中に保存されます') + '</small></span><span class="r">v' + esc(APP_VERSION) + '</span></div></div></div>';
}

/** アカウント／同期 */
function account() {
  if (!cloud) return '';
  const cs = cloud.state(), u = cs.user, info = (t, sub, v) => '<div class="row"><span class="t"><b>' + esc(t) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="r acct">' + esc(v) + '</span></div>';
  const btn = (t, sub, act) => '<button class="row" data-act="' + act + '"><span class="t"><b>' + esc(t) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + ic('next') + '</button>';
  const ss = store.syncState();
  const note = cs.signingIn ? 'ログイン画面で操作を続けてください' : cs.sdk === 'failed' ? 'オフラインのため同期機能を読み込めませんでした' : (cs.sdk === 'loading' ? 'ログインの準備中…' : 'iPhone と PC で記録が同期されます');
  return '<div class="sect">アカウント／同期</div><div class="list">'
    + info('ログイン状態', u ? (u.name || '') : '', u ? (u.email || 'ログイン中') : '未ログイン')
    + info('同期の状態', '', syncLabel(ss, !!u))
    + (u && ss.error ? btn('再接続', 'クラウドへの接続をもう一度試します', 'reconnect') : '')
    + (u ? btn('端末内の記録をクラウドへ追加', 'ログイン前にこの端末で付けた記録のうち、クラウドに無い日を追加します', 'migrateNow') + btn('ログアウト', '', 'logout')
      : btn(cs.signingIn ? 'ログイン処理中…' : 'Googleでログイン', note, 'login'))
    + '</div>';
}

const actions = {
  openMaster() { go('#/master'); },
  setStep() {
    const cur = store.settings().step;
    sheet('重量の増減ステップ', '<p class="muted">＋／−ボタン1回で増減する重量を選んでください。</p><div class="list">' + STEP_CHOICES.map(v => '<button class="row" data-act="chooseStep" data-arg="' + v + '" aria-pressed="' + (v === cur) + '"><span class="t"><b class="num">' + v + ' kg</b></span>' + (v === cur ? '<span style="color:var(--accent)">' + ic('check') + '</span>' : '') + '</button>').join('') + '</div>');
  },
  chooseStep(v) {
    store.saveSettings({ step: +v });
    closeSheet(); rerender(true); toast('重量ステップを ' + store.settings().step + ' kg にしました');
  },
  setTimerSec() {
    promptSheet({
      title: 'インターバルの初期値', label: '秒数（1〜3600）', type: 'number', value: store.settings().timerSec, maxlength: 4, focus: false,
      after: '<div class="presets">' + TIMER_PRESETS.map(v => '<button data-act="fillTimerSec" data-arg="' + v + '">' + v + '</button>').join('') + '</div>',
      emptyMsg: '秒数を入力してください',
    }, v => {
      const n = Math.round(+v);
      if (!Number.isFinite(n) || n < 1 || n > 3600) { toast('1〜3600 の秒数を入力してください'); return false; }
      store.saveSettings({ timerSec: n });
      if (!timer.running()) timer.setSec(n);
      rerender(true); toast('インターバルの初期値を ' + n + ' 秒にしました');
    });
  },
  fillTimerSec(v) { const el = $('#pr-in'); if (el) el.value = v; },
};

export default { render, actions };
