// main.js — 起動、ルーティング、イベント委譲、描画
import { S, setHooks, go, back, setDate, checkRollover, navLocked, routeDone } from './state.js';
import { store, LocalAdapter, normalizeAll } from './store.js';
import { syncBadge, firestoreErrorMessage } from './store-firebase.js';
import { firebaseConfig } from './firebase-config.js';
import { loadSdk, createAuth } from './auth.js';
import { initCloud } from './cloud.js';
import { timer } from './timer.js';
import { $, ic, toast, exOf, dropActionToast, runToastAction } from './ui.js';
import { todayKey, parseHash, exHistory } from './calc.js';
import home from './screens/home.js';
import pick from './screens/pick.js';
import entry, { refreshTimer, tickTimer } from './screens/entry.js';
import historyScr from './screens/history.js';
import analysis from './screens/analysis.js';
import body from './screens/body.js';
import settings from './screens/settings.js';
import master from './screens/master.js';
import * as sheets from './screens/sheets.js';

const SCREENS = { home, pick, entry, history: historyScr, analysis, body, settings, master };
const TAB_SCREENS = ['home', 'analysis', 'body', 'settings'];
const TABS = [['home', 'home', 'ホーム'], ['analysis', 'chart', '履歴/分析'], ['body', 'body', '体組成'], ['settings', 'set', '設定']];
const SKIN_KEY = 'won-skin', THEME_COLOR = { red: '#D23B38', black: '#151213' };

/* ---------- テーマ（端末ごと。同期対象外） ---------- */
let skin = 'red';
try { skin = localStorage.getItem(SKIN_KEY) === 'black' ? 'black' : 'red'; } catch (e) { /* noop */ }
function applySkin() {
  document.documentElement.dataset.skin = skin;
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEME_COLOR[skin]);
}

/* ---------- ルーティング ---------- */
/** r = { name, date, ex, hash }。#/pick/<date>  #/entry/<date>/<exId>  #/history/<exId> */
function parse(hash) {
  const r = parseHash(hash, todayKey());
  if (!r || !SCREENS[r.name]) return null;
  // マスタに無い種目ID（他端末で消えた等）でも、記録が残っていれば開ける・削除できるようにする（名前は「（不明な種目）」）
  if (r.name === 'entry' && !exOf(r.ex)) { const d = store.day(r.date); if (!r.ex || !(d && d.items.some(it => it.ex === r.ex))) return null; }
  if (r.name === 'history' && !exOf(r.ex) && !(r.ex && exHistory(store.days(), r.ex).length)) return null;
  return r;
}
function route() {
  let r = parse(location.hash);
  const depth = history.state && typeof history.state.n === 'number' ? history.state.n : 0;
  if (!r) { history.replaceState({ n: 0 }, '', '#/home'); r = parse('#/home'); }
  else if (r.hash !== location.hash) history.replaceState({ n: depth }, '', r.hash);   // 不正な日付・旧形式のURLを正規化
  const prev = S.route, prevScr = prev && SCREENS[prev.name];
  if (prevScr && prevScr.leave) prevScr.leave(r);
  sheets.closeSheet({ silent: true });
  dropActionToast();
  S.route = r;
  if (r.date) setDate(r.date);                 // 対象日は URL が正（リロードしても変わらない）
  if (TAB_SCREENS.includes(r.name)) S.tab = r.name;
  else if (r.name === 'master') S.tab = 'settings';
  else if (r.name === 'history' && !(prev && (prev.name === 'entry' || prev.name === 'history'))) S.tab = 'analysis';
  else if (r.name === 'pick' || r.name === 'entry') S.tab = 'home';
  if (r.name === 'home' && S.follow) { S.follow = false; setDate(todayKey()); }
  if (SCREENS[r.name].enter) SCREENS[r.name].enter(r, prev);
  render(false);
  routeDone();
}

function render(keep) {
  checkRollover();
  // 前回ログインしていた端末では、クラウドの準備が済むまで端末内データを描かない（古い記録の一瞬の表示・誤入力を防ぐ）
  $('#view').innerHTML = S.booting ? '<div class="pad"><div class="empty" role="status">記録を読み込んでいます…</div></div>' : SCREENS[S.route.name].render();
  $('#tabs').innerHTML = TABS.map(t => '<button class="' + (S.tab === t[0] ? 'on' : '') + '" data-act="tab" data-arg="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + ic(t[1]) + t[2] + '</button>').join('');
  if (!keep) window.scrollTo(0, 0);
}

/* ---------- 操作（イベント委譲） ---------- */
const ACTIONS = {
  tab(v) {
    if (!TAB_SCREENS.includes(v)) return;
    if (S.route.name === v) { window.scrollTo(0, 0); return; }
    go('#/' + v, { replace: TAB_SCREENS.includes(S.route.name) });
  },
  back() { back(); },
  toastAct() { runToastAction(); },
  // Google ログインはタップのハンドラ内で同期的に呼ぶ（ポップアップブロック対策。ここで await しない）
  login() { cloud.signIn(); },
  loginLater() { cloud.loginLater(); },
  logout() { cloud.signOut(); },
  migrateNow() { cloud.migrateNow(); },
  reconnect() { cloud.reconnect(); },
  skin() {
    skin = skin === 'red' ? 'black' : 'red'; applySkin();
    try { localStorage.setItem(SKIN_KEY, skin); } catch (e) { /* 保存できなくても切替自体は有効 */ }
    if (S.route.name === 'settings') render(true);
  },
};
[sheets, ...Object.values(SCREENS)].forEach(m => Object.assign(ACTIONS, m.actions));

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  if (navLocked()) { e.preventDefault(); return; }     // 連打ガード（遷移の前後 約300ms）
  const fn = ACTIONS[t.dataset.act];
  if (fn) fn(t.dataset.arg, t, e);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (sheets.onInput(t)) return;
  const scr = SCREENS[S.route.name];
  if (scr.onInput && t.closest('#view')) scr.onInput(t);
});
document.addEventListener('change', e => {
  const t = e.target, scr = SCREENS[S.route.name];
  if (sheets.onChange(t)) return;
  if (scr.onChange && t.closest('#view')) scr.onChange(t);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { sheets.closeSheet(); return; }
  if (e.key !== 'Enter' || e.isComposing) return;
  const t = e.target;
  if (t.id === 'pr-in') { e.preventDefault(); ACTIONS.sheetOk(); }
  else if (t.matches && t.matches('[role="button"][data-act]')) { e.preventDefault(); t.click(); }
  else if (t.tagName === 'INPUT' && t.closest('#view')) t.blur();   // Enter で確定（キーボードを閉じる）
});

// シート表示中の「戻る」はシートを閉じるだけ（sheets.consumePop が true を返したらルーティングしない）
let booted = false;
window.addEventListener('popstate', () => { if (booted && !sheets.consumePop()) route(); });
window.addEventListener('hashchange', () => { if (!booted) return; const r = parse(location.hash); if (!r || r.hash !== S.route.hash) route(); });

/* ---------- 日付またぎ・他タブでの変更 ---------- */
let cloud = null;
let bootWait = false;       // 起動時にクラウドの準備を待っている間
let staleView = false;      // 入力中・シート表示中に他端末の変更が届いた → 手が空いたら描き直す
document.addEventListener('focusout', () => setTimeout(() => {
  if (staleView && !S.booting && !typing() && !sheets.sheetOpen() && S.route.name !== 'entry') { staleView = false; render(true); }
}, 80));
const typing = () => { const a = document.activeElement; return !!(a && a.tagName === 'INPUT' && a.closest('#view, #sheet')); };
function refreshIfIdle() { if (!typing() && !sheets.sheetOpen()) render(true); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && checkRollover()) refreshIfIdle(); });
window.addEventListener('focus', () => { if (checkRollover()) refreshIfIdle(); });

/* ---------- タイマー ---------- */
timer.onTick(left => tickTimer(left));
timer.onDone(() => {
  if (S.route.name === 'entry') refreshTimer(true);
  toast('インターバル終了。次のセットへ');
});

/* ---------- 起動 ---------- */
async function boot() {
  applySkin();
  setHooks({ route, render });
  let lastBlock = 0;
  store.onError(e => {
    const code = String((e && e.code) || '');
    if (code === 'not-ready' || code === 'switching') {       // クラウドの内容を把握できるまでは書き込まない（上書き事故の防止）
      if (Date.now() - lastBlock < 4000) return;               // 連続表示は抑止
      lastBlock = Date.now();
      const err = store.syncState().error;
      toast(err ? firestoreErrorMessage(err) : 'クラウドの記録を読み込み中です。少し待ってからもう一度入力してください', { ms: 4000 });
      return;
    }
    toast('保存できませんでした。端末の空き容量やプライベートブラウズの設定を確認してください');
  });
  store.onNotice(ev => { if (ev.type === 'corrupt') setTimeout(() => toast('データの一部を読み込めませんでした（退避済み）', { ms: 6000 }), 0); });
  store.onChange(ev => {
    if (ev.origin !== 'remote') return;           // 自分の保存では再描画しない（入力中のフォーカス維持）
    if (S.booting || ev.what === 'switched') return;   // 保存先の切替完了は cloud.onChange 側で画面を作り直す
    if (ev.what === 'ready') {
      // クラウドの内容を把握できた（遅れて届いた最初のスナップショット等）。それまでの画面・入力中データは
      // 不完全な内容を元にしているので、セット入力中でも破棄して必ず作り直す（保存は拒否されていたので失うものは無い）
      sheets.closeSheet({ silent: true });
      route();
      return;
    }
    if (!parse(location.hash)) {                 // 表示中の種目が他の端末・タブの変更で無くなった
      if (typing() || sheets.sheetOpen()) { staleView = true; return; }
      route();
      toast('他の画面で種目が変更されたためホームに戻りました', { ms: 4000 });
      return;
    }
    // セット入力中: 手元でまだ何も変更していなければ最新の内容で作り直す。変更済みなら手元を優先し、作り直さない
    if (S.route.name === 'entry') {
      if (entry.refreshIfClean && entry.refreshIfClean()) { const id = document.activeElement && document.activeElement.id; render(true); const el = id && document.getElementById(id); if (el) el.focus(); }
      return;
    }
    if (typing() || sheets.sheetOpen()) { staleView = true; return; }
    render(true);
  });
  // 同期状態・ログイン状態の表示更新
  const refreshStatus = () => {
    if (S.booting) return;
    const b = $('#syncbadge');
    if (b) { const t = syncBadge(store.syncState(), !!cloud.state().user); b.textContent = t; b.hidden = !t; }
    if (S.route.name === 'settings' && !sheets.sheetOpen() && !typing()) render(true);
  };
  cloud = initCloud({
    store, loadSdk, createAuth, config: firebaseConfig, toast,
    confirm: (o, ok) => sheets.confirmSheet(o, ok),
    busy: () => S.booting || typing() || sheets.sheetOpen() || S.route.name === 'entry',
    makeLocalAdapter: () => new LocalAdapter(),
    readLocal: async () => normalizeAll(await new LocalAdapter(undefined, null).load()),
  });
  store.onSync(refreshStatus);
  cloud.onChange(ev => {
    if (!booted || bootWait) return;             // 起動時の待ち合わせ中は boot() が描画する
    const cs = cloud.state();
    if (cs.switching) {                           // 保存先の切替中: 全画面の読み込み表示で入力をブロック
      if (!S.booting) { S.booting = true; sheets.closeSheet({ silent: true }); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); render(true); }
      return;
    }
    if (ev && ev.switched) {                      // 切替完了: 入力中の draft を破棄し、現在のルートを必ず作り直す
      S.booting = false; staleView = false;
      if (!timer.running()) timer.setSec(store.settings().timerSec);
      route();
      return;
    }
    if (S.booting) return;
    if (S.route.name === 'home' && !typing() && !sheets.sheetOpen()) render(true); else refreshStatus();
  });
  await store.init();
  timer.setSec(store.settings().timerSec);
  try { history.scrollRestoration = 'manual'; } catch (e) { /* noop */ }
  // シートを開いたままリロードされた時は、シート用に積んだ履歴の段を1つ捨てる（最初の「戻る」の空振り防止）
  if (history.state && history.state.sheet) {
    await new Promise(res => {
      const h = setTimeout(res, 600);
      window.addEventListener('popstate', () => { clearTimeout(h); res(); }, { once: true });
      history.back();
    });
    if (history.state && history.state.sheet) history.replaceState({ n: history.state.n || 0 }, '', location.hash);   // 戻れなかった時は印だけ外す
  }
  if (!history.state || typeof history.state.n !== 'number') history.replaceState({ n: 0 }, '', location.hash || '#/home');
  booted = true;
  if (cloud.hadLogin()) {
    // 前回ログイン済み: クラウド（オフラインならそのキャッシュ）の準備を待ってから描画。待ちすぎない保険つき
    S.booting = true; bootWait = true; render(false);
    await Promise.race([cloud.start(), new Promise(res => setTimeout(res, 9000))]);
    bootWait = false;
    S.booting = cloud.state().switching;        // 9秒で打ち切った後に切替が始まっていたら、読み込み表示のまま完了を待つ
    route();
  } else {
    route();                                    // 未ログイン: すぐ描画し、SDK は裏で読み込む（失敗しても端末内保存で使える）
    cloud.start();
  }

  // Service Worker（localhost か https の時だけ）
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    const reg = () => navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン機能なしで続行 */ });
    if (document.readyState === 'complete') reg();                      // 登録は1回だけ
    else window.addEventListener('load', reg, { once: true });
  }
}
boot();
