// firebase-config.js — Firebase プロジェクトの設定値（公開前提の値。秘密情報ではない）
// データの保護は Firestore のセキュリティルール（リポジトリ直下 firestore.rules）で行う。
export const firebaseConfig = {
  apiKey: "AIzaSyCZGcng2Rdh4uKCIy7MmWH-pgChy5zvdpo",
  authDomain: "workout-note-b45cd.firebaseapp.com",
  projectId: "workout-note-b45cd",
  storageBucket: "workout-note-b45cd.firebasestorage.app",
  messagingSenderId: "524290976579",
  appId: "1:524290976579:web:226064487b5eaec07a5df6"
};

/** Firebase JS SDK のバージョン（gstatic CDN の ESM。sw.js の SDK_VERSION と必ず揃えること） */
export const SDK_VERSION = '12.19.0';
export const SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
export const SDK_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'];
