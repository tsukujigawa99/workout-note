# WorkOut Note フェーズ2仕様：Firebase 同期＋Googleログイン

- 作成: PM　／　宛先: 開発担当・テスト担当
- 前提: `docs/02_開発仕様書.md`（store インターフェース、データモデル）

## 1. 方針

- 既存の `store` インターフェースはそのまま。`FirebaseAdapter` を追加し、**ログイン中は Firestore、未ログイン時は従来の LocalAdapter** を使う。画面側(screens)は原則変更しない。
- Firebase JS SDK は **モジュラーAPI を gstatic CDN の ESM から import**（ビルドなし）。バージョンは1つに固定（`https://www.gstatic.com/firebasejs/<ver>/firebase-app.js` / `firebase-auth.js` / `firebase-firestore.js`。実在する最新安定版を HTTP 200 で確認して決める）。Analytics は使わない。
- SDK は **動的 import**。読み込み失敗（初回オフライン等）でもアプリは LocalAdapter で起動し、トーストで知らせる。
- 公開先は `https://tsukujigawa99.github.io/workout-note/`（GitHub Pages、サブパス配信）。

## 2. 設定値（公開前提の値。`app/js/firebase-config.js` に置く）

```js
export const firebaseConfig = {
  apiKey: "AIzaSyCZGcng2Rdh4uKCIy7MmWH-pgChy5zvdpo",
  authDomain: "workout-note-b45cd.firebaseapp.com",
  projectId: "workout-note-b45cd",
  storageBucket: "workout-note-b45cd.firebasestorage.app",
  messagingSenderId: "524290976579",
  appId: "1:524290976579:web:226064487b5eaec07a5df6"
};
```

## 3. 認証

- Google ログインは **`signInWithPopup`**（`signInWithRedirect` は authDomain が別オリジンのため Safari のサードパーティストレージ制限で失敗するので使わない）。ポップアップはユーザーのタップ起点で同期的に開くこと（await を挟んでから呼ばない。SDK は起動時に先読みしておく）。
- 認証状態の永続化は SDK 既定（IndexedDB）→ 無ければ `browserLocalPersistence`。ログイン済みならオフラインでも起動できること。
- 失敗時のメッセージ: ポップアップブロック／キャンセル／ネットワーク／未承認ドメイン（`auth/unauthorized-domain` →「Firebase の承認済みドメインに このサイトを追加してください」）を日本語で出し分け。
- ログアウト: 確認シート → `signOut` → LocalAdapter に切替。Firestore のローカルキャッシュは消さない。

## 4. 画面

- **初回起動（未ログイン）**: ホームの上にログイン案内カードを表示（「Googleでログインすると iPhone と PC で記録が同期されます」「Googleでログイン」ボタン、「あとで」）。「あとで」を押したら端末に記憶し、以後は設定画面からログイン。全画面のログイン壁にはしない。
- **設定 > アカウント／同期**: ログイン状態（メールアドレス表示）、同期の状態（「同期済み」「送信待ち n 件」「オフライン」）、ログイン／ログアウト。
- ホームのヘッダ付近に、未送信の書き込みがある時／オフライン時だけ小さな状態表示（邪魔にならない大きさ）。

## 5. Firestore 構造とアダプタ

```
users/{uid}/days/{YYYY-MM-DD}     { memo, items:[{ex, sets:[{w,r,memo,assist}]}], updatedAt }
users/{uid}/body/{YYYY-MM-DD}     { w?, f?, updatedAt }
users/{uid}/meta/master           { parts, exercises, updatedAt }
users/{uid}/meta/settings         { step, timerSec, updatedAt }
```

- `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`。IndexedDB が使えない環境ではメモリキャッシュにフォールバック。
- `init()`: days・body コレクションと meta 2ドキュメントに `onSnapshot`（`includeMetadataChanges: true`）。**最初のスナップショット（キャッシュ由来でよい）が揃った時点で init 完了**とし、オフラインでも待ち続けない（タイムアウト保険あり）。以後の変更はメモリキャッシュ更新 → `onChange` で再描画。
- 読みは同期（メモリ）、書きは `setDoc` / `deleteDoc` を **await しない**（オフライン時は解決しないため）。`.catch` で権限エラー等をトースト通知。空になった日・体組成は `deleteDoc`。
- `undefined` を Firestore に渡さない（`w`/`f` 未入力はフィールドごと省く。`null` は可）。読み込んだデータは LocalAdapter と同じ正規化関数を通す。
- 送信待ち件数: `snapshot.metadata.hasPendingWrites` / docChanges から算出。`navigator.onLine` と合わせて同期状態を `store.syncState()` で返し、変化時に通知。
- **入力中の再描画でフォーカスを飛ばさない**: 自分の書き込みに由来するスナップショット（`hasPendingWrites` または内容が手元と同一）では再描画しない。他端末からの変更でも、セット入力画面でその日のその種目を編集中なら、手元の入力中データを優先し、画面を作り直さない（戻った時に反映）。
- master が Firestore に無い初回は `defaults.js` の初期マスタを書き込む（ただし下の移行を先に判定）。

## 6. 端末内データの移行（初回ログイン時）

- ログイン直後、サーバー到達後に判定（オフラインなら次回に持ち越し。`getDocsFromServer` 等で「クラウドが本当に空か」を確認してから）。
  - クラウドが空 ＆ 端末内に記録あり → 確認シート「この端末の記録（n日分）をクラウドにアップロードします」→ `writeBatch`（500件ごとに分割）で days/body/master/settings を投入。
  - クラウドに既にデータあり ＆ 端末内にも記録あり → 「クラウドの記録を使います。この端末だけにある日（n日分）を追加しますか？」→ **クラウドに無い日付だけ**追加（上書きしない）。master/settings はクラウド優先。
  - 移行済みフラグを端末に記録。端末内データ（won-*）は消さない（バックアップとして残す）。

## 7. セキュリティルール（`firestore.rules` としてリポジトリにも保存。適用は依頼者がコンソールで貼り付け）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 8. Service Worker

- `CACHE_VERSION` を上げる。アプリシェルに `firebase-config.js`、アダプタ等の新規ファイルを追加。
- **Firebase SDK（gstatic の3ファイル＋それらが内部で import する URL）をインストール時にキャッシュ**し、オフライン起動時もキャッシュから返す（cache-first。バージョン固定URLなので不変）。キャッシュ取得に失敗しても SW のインストール自体は失敗させない。
- `firestore.googleapis.com`・`identitytoolkit.googleapis.com`・`securetoken.googleapis.com`・`apis.google.com`・`*.firebaseapp.com` 等の API/認証通信は **SW で一切触らない**（respondWith しない）。

## 9. テスト

- `tests/test.html`: FirebaseAdapter のうち純粋に切り出せる部分（Firestore 用のデータ整形＝undefined 除去、移行対象日の算出、同期状態の算出、バッチ分割）を関数化してテスト。
- 実ログインを伴う確認は依頼者の操作が必要（エージェントはログインできない）。未ログイン状態での回帰（フェーズ1の全機能が従来どおり動く、SDK 読み込み失敗時も起動する、コンソールエラー無し）は必ず確認。
- `APP_VERSION` は 1.1.0。
