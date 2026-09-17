// auth.js — Firebase SDK の読み込みと Google ログイン
//
// SDK は gstatic CDN の ESM を「動的 import」する（読み込めなくてもアプリは端末内保存で起動できる）。
// createAuth(sdk, config) は SDK モジュールを引数で受け取るので、tests/test.html ではモックに差し替えられる。
import { SDK_BASE, SDK_FILES } from './firebase-config.js';

/** gstatic から SDK を読み込む。戻り値 { app, auth, fs }（各モジュールの名前空間） */
export async function loadSdk() {
  const [app, auth, fs] = await Promise.all(SDK_FILES.map(f => import(SDK_BASE + f)));
  return { app, auth, fs };
}

/** 認証エラーを日本語にする */
export function authErrorMessage(e) {
  const code = String((e && e.code) || '');
  switch (code) {
    case 'auth/popup-blocked': return 'ログイン画面（ポップアップ）がブロックされました。ブラウザの設定でポップアップを許可してから、もう一度お試しください';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled': return 'ログインをキャンセルしました';
    case 'auth/network-request-failed': return 'ネットワークに接続できないためログインできませんでした。電波の良い場所でもう一度お試しください';
    case 'auth/unauthorized-domain': return 'Firebase の承認済みドメインに このサイトを追加してください（Firebase コンソール > Authentication > 設定 > 承認済みドメイン）';
    case 'auth/operation-not-allowed': return 'Firebase コンソールで Google ログインが有効になっていません（Authentication > ログイン方法）';
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported': return 'このブラウザではログインを利用できません（プライベートブラウズや Cookie の制限を確認してください）';
    case 'auth/user-disabled': return 'このアカウントは無効になっています';
    case 'auth/too-many-requests': return 'ログインの試行回数が多すぎます。時間をおいてもう一度お試しください';
    case 'auth/internal-error': return 'ログイン中にエラーが発生しました。時間をおいてもう一度お試しください';
    default: return 'ログインできませんでした' + (code ? '（' + code + '）' : '');
  }
}

/**
 * Firebase を初期化して、認証と Firestore の入口を返す。
 *   sdk = { app:{initializeApp}, auth:{getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged}, fs:{initializeFirestore, ...} }
 */
export function createAuth(sdk, config) {
  const app = sdk.app.initializeApp(config);
  // 永続化は SDK 既定（IndexedDB → 無ければ localStorage）。ログイン済みならオフラインでも起動できる
  const auth = sdk.auth.getAuth(app);
  const provider = new sdk.auth.GoogleAuthProvider();
  if (provider.setCustomParameters) provider.setCustomParameters({ prompt: 'select_account' });

  // Firestore: IndexedDB の永続キャッシュ（複数タブ対応）。使えない環境ではメモリキャッシュ
  const F = sdk.fs;
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) {
    try { db = F.initializeFirestore(app, { localCache: F.memoryLocalCache() }); }
    catch (e2) { db = F.getFirestore(app); }
  }

  const pick = u => (u ? { uid: u.uid, email: u.email || '', name: u.displayName || '' } : null);
  return {
    db, fs: F,
    user: () => pick(auth.currentUser),
    /** cb(user|null)。初回は保存済みのログイン状態の復元後に呼ばれる */
    onUser(cb) { return sdk.auth.onAuthStateChanged(auth, u => cb(pick(u)), () => cb(null)); },
    /**
     * Google ログイン。必ずタップのイベントハンドラ内から「同期的に」呼ぶこと
     * （await を挟むとポップアップがブロックされる）。signInWithRedirect は Safari で失敗するため使わない。
     */
    signIn() { return sdk.auth.signInWithPopup(auth, provider).then(r => pick(r.user)); },
    signOut() { return sdk.auth.signOut(auth); },
  };
}
