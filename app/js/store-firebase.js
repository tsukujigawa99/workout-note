// store-firebase.js — FirebaseAdapter（Firestore 保存）と、そのための純粋関数
//
// 設計原則:「クラウドのデータを絶対に壊さない」
//   ・メモリ上の一覧は、毎回スナップショット全体（自分の未送信書き込みも含む）から作り直す
//     → 移行バッチ・別タブ・遅れて届いた最初のスナップショットも必ず取り込まれる
//   ・クラウドの内容を正しく把握できるまで（ready になるまで）は、その種類のデータを書き込ませない
//     ready = サーバー由来のスナップショットを受信済み、または「この端末で同期済みの永続キャッシュ」由来と判断できた時
//   ・リスナーがエラーになったらバックオフ付きで張り直す
//
// Firestore の関数群は引数 fs で受け取る（SDK を直接 import しない）。
//   本番: auth.js が gstatic の SDK を動的 import して渡す ／ テスト: tests/test.html のモックを渡す
// 構造:  users/{uid}/days/{YYYY-MM-DD}  users/{uid}/body/{YYYY-MM-DD}  users/{uid}/meta/master  users/{uid}/meta/settings

/* ---------- 純粋関数（tests/test.html でテスト） ---------- */

/** Firestore に渡せる形にする: undefined のフィールドは省く（null は可）。NaN/Infinity は null。元データは変更しない */
export function toFirestore(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.map(x => { const y = toFirestore(x); return y === undefined ? null : y; });   // 配列内の undefined は null に
  if (typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => { const y = toFirestore(v[k]); if (y !== undefined) out[k] = y; });
    return out;
  }
  if (typeof v === 'function' || typeof v === 'symbol') return undefined;
  return v;
}

const canon = v => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { if (v[k] !== undefined) o[k] = canon(v[k]); }); return o; }
  return v;
};
/** キー順や undefined の有無に左右されない内容比較（再描画が必要かどうかの判定に使う） */
export const sameData = (a, b) => JSON.stringify(canon(a === undefined ? null : a)) === JSON.stringify(canon(b === undefined ? null : b));

/**
 * 最初のスナップショットを「クラウドの内容を正しく反映している」と信頼してよいか。
 *   fromCache=false（サーバー由来）→ 信頼する
 *   fromCache=true → この端末で以前サーバーと同期した記録(synced)がある時だけ。ただし前回は中身があったのに
 *                    今回が空なら信頼しない（永続キャッシュが使えずメモリキャッシュになっている等）
 *   synced = 前回サーバー同期時の件数（コレクション）／存在したか 0|1（ドキュメント）。未同期なら null
 */
export function isTrustedSnapshot({ fromCache, size, synced }) {
  if (!fromCache) return true;
  if (synced == null) return false;
  return synced === 0 ? true : size > 0;
}

/** 送信待ち件数 = スナップショット上で未送信のドキュメント ∪ 送信中の書き込み（同じドキュメントは1件と数える） */
export function countPending(snapshotPaths, inflightPaths) {
  const all = new Set();
  (snapshotPaths || []).forEach(p => all.add(p));
  (inflightPaths || []).forEach(p => all.add(p));
  return all.size;
}
/** 同期状態。ready = すべての種類のデータを書き込める状態か */
export function calcSyncState({ online, snapshotPaths, inflightPaths, error, ready }) {
  return { mode: 'cloud', online: online !== false, pending: countPending(snapshotPaths, inflightPaths), error: error || null, ready: ready !== false };
}
/** 同期状態の表示文言。loggedIn=false は端末内保存 */
export function syncLabel(st, loggedIn) {
  if (!loggedIn || !st || st.mode !== 'cloud') return '端末内に保存';
  if (st.error) return st.error.code === 'permission-denied' ? 'エラー（権限がありません）' : 'エラー（接続できません）';
  if (!st.ready) return '読み込み中…';
  if (!st.online) return st.pending ? 'オフライン（送信待ち ' + st.pending + ' 件）' : 'オフライン';
  return st.pending ? '送信待ち ' + st.pending + ' 件' : '同期済み';
}
/** ホームのヘッダに出す短い表示。出す必要が無ければ ''（読み込み中・未送信あり・オフライン・エラーの時だけ） */
export function syncBadge(st, loggedIn) {
  if (!loggedIn || !st || st.mode !== 'cloud') return '';
  if (st.error) return '同期エラー';
  if (!st.ready) return 'クラウドの記録を読み込み中…';
  if (!st.online) return st.pending ? 'オフライン・送信待ち ' + st.pending : 'オフライン';
  return st.pending ? '送信待ち ' + st.pending : '';
}
/** Firestore のエラーを、原因が分かる日本語にする */
export function firestoreErrorMessage(e) {
  const code = String((e && e.code) || '').replace(/^firestore\//, '');
  if (code === 'permission-denied') return 'クラウドの記録を読み書きできません（権限エラー）。Firebase コンソールで Firestore のセキュリティルールが適用されているか確認してください';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'クラウドに接続できません。電波の良い場所で自動的に再送されます';
  if (code === 'resource-exhausted') return 'Firebase の無料枠の上限に達した可能性があります。時間をおいて再度お試しください';
  if (code === 'unauthenticated') return 'ログインの有効期限が切れました。設定からログインし直してください';
  if (code === 'failed-precondition') return 'クラウドのデータベースを利用できません。Firebase コンソールで Firestore が有効か確認してください';
  return 'クラウドとの同期でエラーが発生しました' + (code ? '（' + code + '）' : '');
}
/** 配列を size 件ごとに分割（writeBatch は1回 500 件まで） */
export function chunk(list, size = 500) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/* ---------- FirebaseAdapter ---------- */
export const NAMES = ['days', 'body', 'master', 'settings'];
const SYNCED_KEY = 'won-synced';            // { [uid]: { days:n, body:n, master:0|1, settings:0|1 } } 前回サーバーと同期した時の件数
const DEFAULT_BACKOFF = [5000, 15000, 60000];

export class FirebaseAdapter {
  /**
   * fs: { collection, doc, onSnapshot, setDoc, deleteDoc }（Firestore モジュラーAPI互換）
   * db: Firestore インスタンス / uid: ログイン中のユーザーID
   * opt: { onError(e), timeoutMs, isOnline(), events, doc, storage, backoff:[ms...] }
   *   events = online/offline の購読先（既定 window）／doc = visibilitychange の購読先（既定 document）／storage = 同期済みの記録先
   */
  constructor(fs, db, uid, opt = {}) {
    this.fs = fs; this.db = db; this.uid = uid;
    this.onError = opt.onError || (() => {});
    this.timeoutMs = opt.timeoutMs == null ? 5000 : opt.timeoutMs;
    this.isOnline = opt.isOnline || (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    this.events = opt.events === undefined ? (typeof window !== 'undefined' ? window : null) : opt.events;
    this.docEvents = opt.doc === undefined ? (typeof document !== 'undefined' ? document : null) : opt.doc;
    this.storage = opt.storage === undefined ? safeStorage() : opt.storage;
    this.backoff = opt.backoff || DEFAULT_BACKOFF;
    this.raw = { days: {}, body: {}, master: null, settings: null };
    this.seen = { days: false, body: false, master: false, settings: false };     // 最初の応答（スナップショットかエラー）が来たか
    this.ready = { days: false, body: false, master: false, settings: false };    // 書き込んでよいか（信頼できるスナップショット受信済み）
    this.snapPending = { days: [], body: [], master: [], settings: [] };
    this.errors = {};              // name → { code, message }
    this.retryCount = {}; this.retryTimer = {};
    this.unsub = {};
    this.inflight = new Map();     // path → 送信中の書き込み数
    this.cb = null; this.syncCbs = [];
    this.started = null; this.loadReturned = false; this.disposed = false;
    this._lastSync = '';
  }
  col(name) { return this.fs.collection(this.db, 'users', this.uid, name); }
  ref(name, id) { return this.fs.doc(this.db, 'users', this.uid, name, id); }

  /** 最初の応答が揃うか、タイムアウトしたら解決。以後は現在の生データを返す（遅れて届いた分は subscribe の通知で反映） */
  async load() {
    if (!this.started) this.started = this._start();
    await this.started;
    this.loadReturned = true;
    return { days: this.raw.days, body: this.raw.body, master: this.raw.master, settings: this.raw.settings, issues: [] };
  }
  _start() {
    return new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => this._finish(), this.timeoutMs);     // オフライン等で待ち続けないための保険
      this._finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
      NAMES.forEach(n => this._listen(n));
      if (this.events && this.events.addEventListener) {
        this._net = e => { this._sync(); if (e && e.type === 'online') this.reconnect(); };
        this.events.addEventListener('online', this._net); this.events.addEventListener('offline', this._net);
      }
      if (this.docEvents && this.docEvents.addEventListener) {
        this._vis = () => { if (!this.docEvents.hidden) this.reconnect(); };
        this.docEvents.addEventListener('visibilitychange', this._vis);
      }
    });
  }
  _listen(name) {
    if (this.disposed) return;
    const isCol = name === 'days' || name === 'body';
    this._unlisten(name);
    try {
      this.unsub[name] = this.fs.onSnapshot(isCol ? this.col(name) : this.ref('meta', name), { includeMetadataChanges: true },
        snap => this._onSnap(name, isCol, snap), e => this._onErr(name, e));
    } catch (e) { this._onErr(name, e); }
  }
  _unlisten(name) { const u = this.unsub[name]; this.unsub[name] = null; try { if (typeof u === 'function') u(); } catch (e) { /* noop */ } }

  _onSnap(name, isCol, snap) {
    if (this.disposed) return;
    const fromCache = !!(snap.metadata && snap.metadata.fromCache);
    // スナップショット全体から作り直す（差分適用はしない。自分の未送信書き込みもレイテンシ補償で含まれている）
    let next, size, pend;
    if (isCol) {
      next = {}; snap.docs.forEach(d => { next[d.id] = d.data(); });
      size = snap.docs.length; pend = snap.docs.filter(d => d.metadata.hasPendingWrites).map(d => name + '/' + d.id);
    } else {
      next = snap.exists() ? snap.data() : null;
      size = next ? 1 : 0; pend = snap.metadata && snap.metadata.hasPendingWrites ? ['meta/' + name] : [];
    }
    const changed = !sameData(this.raw[name], next);      // 内容が同じなら再描画しない（自分の書き込みの折り返し・メタデータだけの変化）
    this.raw[name] = next; this.snapPending[name] = pend;
    if (this.errors[name]) delete this.errors[name];       // 成功したらエラー解除
    this.retryCount[name] = 0; clearTimeout(this.retryTimer[name]);
    if (!fromCache) this._recordSynced(name, size);
    const wasReady = this.ready[name];
    if (!wasReady && isTrustedSnapshot({ fromCache, size, synced: this._synced(name) })) this.ready[name] = true;
    this.seen[name] = true;
    if (NAMES.every(n => this.seen[n])) this._finish();
    if (this.loadReturned && this.cb) {
      if (!wasReady && this.ready[name]) this.cb('ready');   // 書き込めるようになった（遅れて届いた最初のスナップショットを含む）→ 画面を作り直す
      else if (changed) this.cb('change');
    }
    this._sync();
  }
  _onErr(name, e) {
    if (this.disposed) return;
    this._unlisten(name);
    this.errors[name] = { code: String((e && e.code) || 'unknown').replace(/^firestore\//, ''), message: String((e && e.message) || '') };
    this.seen[name] = true;
    if (NAMES.every(n => this.seen[n])) this._finish();
    this.onError(e);
    // バックオフ付きで張り直す（5秒→15秒→60秒→以後60秒ごと）
    const i = this.retryCount[name] || 0, wait = this.backoff[Math.min(i, this.backoff.length - 1)];
    this.retryCount[name] = i + 1;
    clearTimeout(this.retryTimer[name]);
    this.retryTimer[name] = setTimeout(() => { if (this.errors[name]) this._listen(name); }, wait);
    this._sync();
  }
  /** エラー中のリスナーを今すぐ張り直す（online 復帰・画面復帰・設定の「再接続」） */
  reconnect() {
    if (this.disposed) return;
    Object.keys(this.errors).forEach(name => { clearTimeout(this.retryTimer[name]); this._listen(name); });
  }

  /* ----- 同期済みの記録（fromCache のスナップショットを信頼してよいかの判断材料） ----- */
  _syncedAll() { try { const o = JSON.parse(this.storage.getItem(SYNCED_KEY)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  _synced(name) { const u = this._syncedAll()[this.uid]; return u && typeof u[name] === 'number' ? u[name] : null; }
  _recordSynced(name, size) {
    try {
      const all = this._syncedAll(), u = all[this.uid] || {};
      if (u[name] === size) return;
      u[name] = size; all[this.uid] = u; this.storage.setItem(SYNCED_KEY, JSON.stringify(all));
    } catch (e) { /* 記録できなくても動作は続ける（次回はサーバー応答を待つだけ） */ }
  }

  /** その種類のデータを書き込んでよいか（クラウドの内容を把握できているか）。what = days | body | master | settings */
  writable(what) { return !!this.ready[what]; }

  /** 書き込みは await しない（オフライン時は Promise が解決しないため）。失敗は onError で通知 */
  _write(path, fn) {
    this.inflight.set(path, (this.inflight.get(path) || 0) + 1);
    const done = () => { const n = (this.inflight.get(path) || 1) - 1; if (n > 0) this.inflight.set(path, n); else this.inflight.delete(path); this._sync(); };
    let p;
    try { p = fn(); } catch (e) { done(); this.onError(e); return; }
    Promise.resolve(p).then(done, e => { done(); this.onError(e); });
    this._sync();
  }
  _notReady() { const e = new Error('not-ready'); e.code = 'not-ready'; return e; }
  async putDay(k, day) {
    if (!k) return;
    if (!this.ready.days) throw this._notReady();        // 二重の安全装置（通常は store 側の writable() で止まる）
    if (day) this.raw.days[k] = day; else delete this.raw.days[k];
    this._write('days/' + k, () => (day ? this.fs.setDoc(this.ref('days', k), toFirestore(day)) : this.fs.deleteDoc(this.ref('days', k))));
  }
  async putBody(k, rec) {
    if (!k) return;
    if (!this.ready.body) throw this._notReady();
    if (rec) this.raw.body[k] = rec; else delete this.raw.body[k];
    this._write('body/' + k, () => (rec ? this.fs.setDoc(this.ref('body', k), toFirestore(rec)) : this.fs.deleteDoc(this.ref('body', k))));
  }
  async putMaster(m) { if (!this.ready.master) throw this._notReady(); this.raw.master = m; this._write('meta/master', () => this.fs.setDoc(this.ref('meta', 'master'), toFirestore(m))); }
  async putSettings(s) { if (!this.ready.settings) throw this._notReady(); this.raw.settings = s; this._write('meta/settings', () => this.fs.setDoc(this.ref('meta', 'settings'), toFirestore(s))); }

  /** 変更通知 cb(kind)。kind = 'change'（内容が変わった）| 'ready'（書き込めるようになった） */
  subscribe(cb) { this.cb = cb; }
  onSync(cb) { this.syncCbs.push(cb); }
  syncState() {
    const snap = [].concat(this.snapPending.days, this.snapPending.body, this.snapPending.master, this.snapPending.settings);
    const firstErr = NAMES.map(n => this.errors[n]).find(Boolean) || null;
    return calcSyncState({ online: this.isOnline(), snapshotPaths: snap, inflightPaths: [...this.inflight.keys()], error: firstErr, ready: NAMES.every(n => this.ready[n]) });
  }
  _sync() {
    const key = JSON.stringify(this.syncState());
    if (key === this._lastSync) return;          // 変化した時だけ通知
    this._lastSync = key;
    this.syncCbs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  }
  dispose() {
    this.disposed = true;
    NAMES.forEach(n => { this._unlisten(n); clearTimeout(this.retryTimer[n]); });
    this.cb = null; this.syncCbs = [];
    if (this._finish) this._finish();
    if (this._net && this.events && this.events.removeEventListener) { this.events.removeEventListener('online', this._net); this.events.removeEventListener('offline', this._net); }
    if (this._vis && this.docEvents && this.docEvents.removeEventListener) this.docEvents.removeEventListener('visibilitychange', this._vis);
  }
}

function safeStorage() { try { return globalThis.localStorage; } catch (e) { return null; } }
