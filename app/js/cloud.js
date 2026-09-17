// cloud.js — ログイン状態と保存先（端末内 ⇔ クラウド）の切り替えをまとめる
//
// 依存はすべて引数で受け取る（DOM や SDK を直接 import しない）ので、tests/test.html ではモックで一連の流れをテストできる。
//   未ログイン: LocalAdapter ／ ログイン中: FirebaseAdapter ／ SDK が読めない時: LocalAdapter のまま起動
// 保存先の切替中（switching）は store が書き込みを拒否し、main.js が全画面の読み込み表示にする。
import { FirebaseAdapter, firestoreErrorMessage } from './store-firebase.js';
import { authErrorMessage } from './auth.js';
import { planMigration, migrationMessage, migrationOps, inspectCloud, runMigration, createFlags } from './migrate.js';

const HINT_KEY = 'won-auth-hint';     // 前回ログインしていた uid（起動時に端末内データを一瞬表示しないため）
const LATER_KEY = 'won-login-later';  // ログイン案内カードの「あとで」
const SIGNIN_LIMIT_MS = 120000;       // ポップアップが応答しない時に「処理中」を解除する保険

/**
 * deps: { store, loadSdk(), createAuth(sdk, config), config, toast(msg, opt), confirm(o, onOk), busy():bool,
 *         makeLocalAdapter(), readLocal():Promise<正規化済みの端末内データ>, storage, events, doc, sdkTimeoutMs, adapterTimeoutMs, backoff }
 */
export function createCloud(deps) {
  const { store, toast } = deps;
  const storage = deps.storage === undefined ? safeLocalStorage() : deps.storage;
  const events = deps.events === undefined ? (typeof window !== 'undefined' ? window : null) : deps.events;
  const { isMigrated, markMigrated, everMigrated, isLocalDirty, markLocalDirty } = createFlags(storage);
  const st = { sdk: 'idle', user: null, mode: 'local', switching: false, signingIn: false };     // sdk: idle | loading | ready | failed
  const subs = [];
  let A = null, adapter = null, chain = Promise.resolve(), startP = null, lastErr = { key: '', at: 0 }, migrating = false, retryOnline = false, signTimer = 0;

  const get = k => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (storage) { if (v == null) storage.removeItem(k); else storage.setItem(k, v); } } catch (e) { /* noop */ } };
  const notify = ev => subs.forEach(f => { try { f(ev || {}); } catch (e) { console.error(e); } });

  /** 同じ内容のエラーを連続で出さない（8秒） */
  function reportError(e) {
    const key = String((e && e.code) || (e && e.message) || e), now = Date.now();
    if (key === lastErr.key && now - lastErr.at < 8000) return;
    lastErr = { key, at: now };
    toast(firestoreErrorMessage(e), { ms: 6000 });
  }

  /** 保存先を切り替える。切替中は switching=true（入力をブロック）、完了時に {switched:true} を通知（画面を必ず作り直す） */
  async function switchTo(next, mode) {
    st.switching = true; notify();
    try { await store.useAdapter(next); }
    finally { st.mode = mode; st.switching = false; notify({ switched: true }); }
  }
  async function applyUser(user) {
    if (user) {
      if (st.user && st.user.uid === user.uid && st.mode === 'cloud') { st.user = user; notify(); return; }
      st.user = user; set(HINT_KEY, user.uid);
      adapter = new FirebaseAdapter(A.fs, A.db, user.uid, { onError: reportError, timeoutMs: deps.adapterTimeoutMs, events, doc: deps.doc, storage, backoff: deps.backoff });
      await switchTo(adapter, 'cloud');
      scheduleMigration(false);
    } else {
      const was = st.mode === 'cloud';
      st.user = null; set(HINT_KEY, null); adapter = null;
      if (was) await switchTo(deps.makeLocalAdapter(), 'local'); else { st.mode = 'local'; notify(); }
    }
  }

  /** SDK を読み込み、保存済みのログイン状態を復元する。最初の状態が確定したら解決（失敗しても reject しない） */
  function start(opt = {}) {
    if (startP) return startP;
    startP = new Promise(resolve => {
      st.sdk = 'loading'; notify();
      const limit = new Promise((_, rej) => setTimeout(() => rej(new Error('sdk-timeout')), deps.sdkTimeoutMs || 12000));
      Promise.race([deps.loadSdk(), limit]).then(sdk => {
        A = deps.createAuth(sdk, deps.config);
        st.sdk = 'ready'; notify();
        if (opt.afterRetry) toast('ログインの準備ができました。もう一度「Googleでログイン」を押してください', { ms: 5000 });
        let first = true;
        A.onUser(user => {
          chain = chain.then(() => applyUser(user)).catch(e => { console.error(e); }).then(() => { if (first) { first = false; resolve(); } });
        });
      }).catch(() => {
        st.sdk = 'failed'; startP = null; notify();
        if (!opt.silent) {
          toast(get(HINT_KEY)
            ? 'クラウドに接続できないため、端末内の記録を表示しています（オンラインで開き直すと同期されます）'
            : '同期機能を読み込めませんでした（オフライン）。記録はこの端末に保存されます', { ms: 6000 });
        }
        if (events && events.addEventListener && !retryOnline) {      // 電波が戻ったらもう一度だけ試す
          retryOnline = true;
          events.addEventListener('online', () => { retryOnline = false; if (st.sdk === 'failed') start({ silent: true }); }, { once: true });
        }
        resolve();
      });
    });
    return startP;
  }

  /* ---------- 端末内データの移行 ---------- */
  function scheduleMigration(manual) {
    if (!st.user || migrating) return;
    const uid = st.user.uid;
    if (!manual && isMigrated(uid) && !isLocalDirty()) return;
    migrating = true;
    const write = ops => runMigration(A.fs, A.db, uid, ops);
    const attempt = async () => {
      if (!st.user || st.user.uid !== uid) { migrating = false; return; }
      if (st.switching || (deps.busy && deps.busy())) { setTimeout(attempt, 1500); return; }      // 入力中・シート表示中・切替中は待つ
      let cloudInfo, local;
      try { local = await deps.readLocal(); cloudInfo = await inspectCloud(A.fs, A.db, uid); }
      catch (e) {
        migrating = false;
        const code = String((e && e.code) || '');
        if (code.includes('permission-denied')) { reportError(e); return; }
        if (manual) toast('クラウドに接続できないため確認できませんでした。オンラインの時にもう一度お試しください');
        else if (events && events.addEventListener) events.addEventListener('online', () => scheduleMigration(false), { once: true });   // 次回に持ち越し
        return;
      }
      const plan = planMigration(cloudInfo, local);
      // master が Firestore に無い初回は初期マスタを書き込む。「サーバーに無い」と確認できた時だけ（inspectCloud はサーバー直読み）
      const ensureMaster = async info => { if (!info.hasMaster) { try { await write([{ path: ['meta', 'master'], data: toPlain({ ...store.master(), updatedAt: Date.now() }) }]); } catch (e) { reportError(e); } } };
      if (plan.mode === 'none') {
        migrating = false; markMigrated(uid); await ensureMaster(cloudInfo);
        if (manual) toast('クラウドに追加する記録はありません');
        return;
      }
      deps.confirm({
        title: plan.mode === 'upload' ? '記録のアップロード' : 'この端末の記録の追加',
        msg: migrationMessage(plan) + '（この端末の中の記録は消えません）',
        ok: plan.mode === 'upload' ? 'アップロードする' : '追加する',
        onCancel: () => { migrating = false; markMigrated(uid); ensureMaster(cloudInfo); toast('あとで設定の「端末内の記録をクラウドへ追加」から実行できます', { ms: 4000 }); },
      }, async () => {
        try {
          // 実行の直前にサーバーをもう一度確認し、計画を立て直す（確認〜実行の間に他端末が書いた日を上書きしない）
          const fresh = await inspectCloud(A.fs, A.db, uid), plan2 = planMigration(fresh, local);
          if (plan2.mode === 'none') { markMigrated(uid); await ensureMaster(fresh); toast('クラウドに追加する記録はありませんでした'); return; }
          await write(migrationOps(plan2, local));
          markMigrated(uid);
          if (!plan2.master) await ensureMaster(fresh);
          toast('この端末の記録をクラウドに追加しました（' + plan2.days.length + '日分）');
        } catch (e) {
          const code = String((e && e.code) || '');
          if (code.includes('unavailable')) toast('クラウドに接続できないため追加できませんでした。オンラインの時に設定からもう一度お試しください', { ms: 6000 });
          else reportError(e);
        } finally { migrating = false; }
      });
    };
    attempt();
  }

  // ログイン歴のある端末で、未ログイン中に端末内へ書いた → 次回ログイン時にもう一度、移行を確認する
  store.onChange(ev => { if (ev.origin === 'local' && st.mode === 'local' && (ev.what === 'days' || ev.what === 'body') && everMigrated()) markLocalDirty(); });

  const endSignIn = () => { clearTimeout(signTimer); if (st.signingIn) { st.signingIn = false; notify(); } };

  return {
    /** switching = 保存先の切替中（入力不可）／signingIn = ログイン処理中（ボタンを処理中表示に） */
    state: () => ({ sdk: st.sdk, user: st.user, mode: st.mode, switching: st.switching, signingIn: st.signingIn }),
    /** cb(ev)。ev.switched = 保存先の切替が完了した（画面を必ず作り直すこと） */
    onChange(cb) { subs.push(cb); },
    /** 前回ログインしていたか（true なら起動時にクラウドの準備を待ってから描画する） */
    hadLogin: () => !!get(HINT_KEY),
    start,
    /** ログイン案内カードを出すか */
    showLoginCard: () => !st.user && st.mode === 'local' && !get(LATER_KEY) && !get(HINT_KEY),
    loginLater() { set(LATER_KEY, '1'); notify(); },
    /**
     * Google ログイン。タップのイベントハンドラから同期的に呼ぶこと（内部で await を挟まずに signInWithPopup を呼ぶ）
     */
    signIn() {
      if (st.user || st.signingIn) return;                 // 連打はここで無視（window.open を複数回呼ばない）
      if (st.sdk !== 'ready' || !A) {
        if (st.sdk === 'loading' || st.sdk === 'idle') { toast('ログインの準備中です。数秒後にもう一度お試しください'); if (st.sdk === 'idle') start({ silent: true }); return; }
        toast('オフラインのためログインできません。電波の良い場所でもう一度お試しください', { ms: 5000 });   // メッセージはこの1つだけ
        start({ silent: true, afterRetry: true });
        return;
      }
      let p;
      try { p = A.signIn(); } catch (e) { toast(authErrorMessage(e), { ms: 6000 }); return; }
      st.signingIn = true; notify();
      signTimer = setTimeout(endSignIn, SIGNIN_LIMIT_MS);
      Promise.resolve(p).then(u => { endSignIn(); if (u) toast((u.email || 'Google アカウント') + ' でログインしました'); },
        e => { endSignIn(); if (String((e && e.code) || '') !== 'auth/cancelled-popup-request') toast(authErrorMessage(e), { ms: 6000 }); });
    },
    /** 確認シート → signOut → 端末内保存に切替（Firestore のローカルキャッシュは消さない） */
    signOut() {
      if (!st.user || !A) return;
      const pend = store.syncState().pending;
      deps.confirm({
        title: 'ログアウト',
        msg: 'ログアウトすると、この端末では端末内の記録の表示に切り替わります。クラウドの記録は消えません。' + (pend ? '（未送信の記録が ' + pend + ' 件あります。次にログインした時に送信されます）' : ''),
        ok: 'ログアウトする',
      }, () => { Promise.resolve(A.signOut()).then(() => toast('ログアウトしました'), e => toast(authErrorMessage(e))); });
    },
    /** 設定画面から手動で移行をやり直す */
    migrateNow() { if (!st.user) return; if (migrating) { toast('確認中です。少しお待ちください'); return; } scheduleMigration(true); },
    /** 接続エラー時の再接続（設定画面のボタン） */
    reconnect() { store.reconnect(); toast('クラウドに再接続しています…'); },
    /** テスト用: 直列化された処理の完了を待つ */
    idle: () => chain,
  };
}

const toPlain = o => JSON.parse(JSON.stringify(o));
function safeLocalStorage() { try { return globalThis.localStorage; } catch (e) { return null; } }

/** アプリ全体で使うインスタンス（main.js が initCloud で作る。screens は cloud を参照する） */
export let cloud = null;
export function initCloud(deps) { cloud = createCloud(deps); return cloud; }
