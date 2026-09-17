// state.js — 画面間で共有する状態とナビゲーション（hash ルーティング）
import { todayKey, fromKey, isKey, restoreDate } from './calc.js';

const DATE_KEY = 'won-date';                  // ホームの選択日（リロードで復元。タブを閉じれば消える）
const t0 = todayKey();
let d0 = t0;
try { d0 = restoreDate(sessionStorage.getItem(DATE_KEY), t0); } catch (e) { /* 使えなければ今日 */ }
export const S = {
  date: d0,                                   // 選択中の日付
  ym: [fromKey(d0).getFullYear(), fromKey(d0).getMonth()],
  part: null,                                 // 種目選択で選んでいる部位
  range: 90,                                  // グラフ期間（日）。0 = 全期間
  bodyDate: t0,                               // 体組成の入力日
  tab: 'home',
  route: { name: 'home', date: null, ex: null, hash: '#/home' },
  lastToday: t0,
  booting: false,                             // クラウドの準備待ち（前回ログイン済みの端末の起動時）
  follow: false,                             // 入力中に日付が変わった → ホームに戻ったら今日へ
};

const hooks = { route: () => {}, render: () => {} };
export function setHooks(h) { Object.assign(hooks, h); }
/** 現在の画面を描き直す。keep=true でスクロール位置を維持 */
export function rerender(keep = true) { hooks.render(keep); }

const depth = () => (history.state && typeof history.state.n === 'number' ? history.state.n : 0);
export function go(hash, opt = {}) {
  if (opt.replace) history.replaceState({ n: depth() }, '', hash);
  else history.pushState({ n: depth() + 1 }, '', hash);
  hooks.route();
}
/* ---------- 連打ガード ----------
 * ‹(戻る)のダブルタップで2段戻ったり、遷移直後に同じ位置の別ボタン（ホームの設定など）を
 * 誤って押したりしないよう、遷移の前後は短時間だけ data-act のクリックを無視する。 */
const LOCK_AFTER_ROUTE = 300, LOCK_AFTER_BACK = 450, LOCK_BACK_PENDING = 1200;
let lockUntil = 0, backPending = false;
export const navLocked = () => Date.now() < lockUntil;
/** main.js の route() が遷移完了時に呼ぶ */
export function routeDone() {
  lockUntil = Date.now() + (backPending ? LOCK_AFTER_BACK : LOCK_AFTER_ROUTE);
  backPending = false;
}
/** アプリ内の「戻る」。履歴が無ければホームへ。戻り途中の再実行は無視 */
export function back() {
  if (backPending && navLocked()) return;
  backPending = true;
  lockUntil = Date.now() + LOCK_BACK_PENDING;      // popstate が届くまで（届いたら routeDone で +350ms に縮める）
  if (depth() > 0) history.back();
  else { history.replaceState({ n: 0 }, '', '#/home'); hooks.route(); }
}

export function setDate(k) {
  if (!isKey(k)) return;
  S.date = k;
  const d = fromKey(k);
  S.ym = [d.getFullYear(), d.getMonth()];
  try { sessionStorage.setItem(DATE_KEY, JSON.stringify({ date: k, on: todayKey() })); } catch (e) { /* noop */ }
}

/** 日付またぎ対応: 「今日」を選んでいた場合は新しい今日に追従する。変化があれば true */
export function checkRollover() {
  const t = todayKey();
  if (t === S.lastToday) return false;
  const wasToday = S.date === S.lastToday;
  if (S.bodyDate === S.lastToday) S.bodyDate = t;
  S.lastToday = t;
  if (wasToday) {
    if (S.route.name === 'entry' || S.route.name === 'pick') S.follow = true;   // 入力中は日付を変えない
    else setDate(t);
  }
  return true;
}
