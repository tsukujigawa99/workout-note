// store.js — ストアの共通インターフェース ＋ LocalAdapter（localStorage）
//
// 読み取りは同期（メモリキャッシュ）、書き込みは非同期（Promise<boolean>）。
// アダプタ（load / putDay / putBody / putMaster / putSettings / subscribe / dispose）を差し替えて保存先を切り替える。
//   未ログイン: LocalAdapter（このファイル）／ログイン中: FirebaseAdapter（store-firebase.js）— store.useAdapter() で切替
import { cleanDay, isEmptyDay, cleanBody, isEmptyBody, isKey, normName } from './calc.js';
import { defaultMaster, DEFAULT_SETTINGS, STEP_CHOICES, PART_COLORS } from './defaults.js';

export const KEEP_BACKUPS = 2;
export const KEYS = { days: 'won-days', body: 'won-body', master: 'won-master', settings: 'won-settings' };

/** 衝突しない新規ID（x + 時刻36進 + 連番 + 乱数）。連番で同一ミリ秒内の衝突も防ぐ */
let idSeq = 0;
export const newId = () => 'x' + Date.now().toString(36) + (idSeq++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 7).padEnd(5, '0');

const clone = o => JSON.parse(JSON.stringify(o));
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);

/* ---------- LocalAdapter ---------- */
export class LocalAdapter {
  /** storage: localStorage 互換オブジェクト（省略時は window.localStorage）。events: 'storage' イベントの購読先 */
  constructor(storage, events) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch (e) { storage = null; } }
    this.storage = storage || null;
    this.events = events === undefined ? (typeof window !== 'undefined' ? window : null) : events;
  }
  _read(name, issues) {
    let raw = null;
    try { raw = this.storage && this.storage.getItem(KEYS[name]); } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) {
      // JSON として壊れている → 元文字列を退避してから捨てる
      const saved = this.backup(name, raw);
      try { this.storage.removeItem(KEYS[name]); } catch (e2) { /* noop */ }
      if (issues) issues.push({ name, saved });
      return null;
    }
  }
  /** 読めなかったデータを won-<name>-corrupt-<timestamp> に退避。退避できたらそのキー名、失敗なら null */
  backup(name, raw) {
    const base = KEYS[name] + '-corrupt-' + Date.now();
    try {
      let key = base, i = 1;
      while (this.storage.getItem(key) !== null) key = base + '-' + (i++);
      this.storage.setItem(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
      this._pruneBackups(name);
      return key;
    } catch (e) { return null; }
  }
  /** 退避データは名前ごとに最新 KEEP_BACKUPS 件だけ残す（容量を食い潰さないため） */
  _pruneBackups(name) {
    try {
      const prefix = KEYS[name] + '-corrupt-', found = [];
      for (let i = 0; i < this.storage.length; i++) { const k = this.storage.key(i); if (k && k.startsWith(prefix)) found.push(k); }
      const order = k => { const a = k.slice(prefix.length).split('-'); return [+a[0] || 0, +a[1] || 0]; };   // [timestamp, 同一ミリ秒内の連番]
      found.sort((x, y) => { const a = order(x), b = order(y); return a[0] - b[0] || a[1] - b[1]; });
      found.slice(0, Math.max(0, found.length - KEEP_BACKUPS)).forEach(k => this.storage.removeItem(k));
    } catch (e) { /* 列挙できない環境では何もしない */ }
  }
  _write(name, data) {
    if (!this.storage) throw new Error('storage unavailable');
    this.storage.setItem(KEYS[name], JSON.stringify(data));   // 容量超過・プライベートモードでは例外
  }
  /** issues = JSON として読めず退避したもの [{name, saved}] */
  async load() {
    const issues = [];
    return { days: this._read('days', issues), body: this._read('body', issues), master: this._read('master', issues), settings: this._read('settings', issues), issues };
  }
  // 第3引数 all はキャッシュ全体（Local は丸ごと書く。Firestore は k 単位で書けばよい）
  async putDay(k, day, all) { this._write('days', all); }
  async putBody(k, rec, all) { this._write('body', all); }
  async putMaster(m) { this._write('master', m); }
  async putSettings(s) { this._write('settings', s); }
  /** 他タブ等からの変更通知。cb() を呼ぶとストアが再読込する */
  subscribe(cb) {
    if (!this.events || !this.events.addEventListener) return;
    const names = Object.values(KEYS);
    this._onStorage = e => { if (e.key === null || names.includes(e.key)) cb(); };
    this.events.addEventListener('storage', this._onStorage);
  }
  dispose() {
    if (this._onStorage && this.events && this.events.removeEventListener) this.events.removeEventListener('storage', this._onStorage);
    this._onStorage = null;
  }
}

/* ---------- 読み込みデータの検証 ---------- */
const masterShapeOk = m => isObj(m) && Array.isArray(m.parts) && Array.isArray(m.exercises);
function normMaster(m) {
  if (!masterShapeOk(m)) return defaultMaster();
  // 名称は trim＋40文字に切り詰め
  const parts = m.parts.filter(p => isObj(p) && p.id).map(p => {
    const o = { id: String(p.id), name: normName(p.name), color: /^#[0-9a-fA-F]{3,8}$/.test(p.color) ? p.color : PART_COLORS[0] };
    if (p.hidden) o.hidden = true;
    return o;
  });
  const exercises = m.exercises.filter(e => isObj(e) && e.id).map(e => {
    const o = { id: String(e.id), part: String(e.part || ''), name: normName(e.name) };
    if (e.hidden) o.hidden = true;
    return o;
  });
  return { parts, exercises, updatedAt: +m.updatedAt || 0 };
}
function normSettings(s) {
  const out = { ...DEFAULT_SETTINGS, updatedAt: 0 };
  if (isObj(s)) {
    if (STEP_CHOICES.includes(+s.step)) out.step = +s.step;
    const t = Math.round(+s.timerSec);
    if (Number.isFinite(t) && t >= 1 && t <= 3600) out.timerSec = t;
    out.updatedAt = +s.updatedAt || 0;
  }
  return out;
}
// 戻り値 { out, bad }: bad = 形の不正なデータを捨てた（呼び出し側で退避する）
function normDays(d) {
  const out = {}; let bad = d != null && !isObj(d);
  if (isObj(d)) Object.keys(d).forEach(k => {
    if (!isKey(k) || !isObj(d[k])) { bad = true; return; }
    const day = cleanDay(d[k]);
    if (isEmptyDay(day)) bad = true;
    else out[k] = { ...day, updatedAt: +d[k].updatedAt || 0 };
  });
  return { out, bad };
}
function normBodies(b) {
  const out = {}; let bad = b != null && !isObj(b);
  if (isObj(b)) Object.keys(b).forEach(k => {
    if (!isKey(k) || !isObj(b[k])) { bad = true; return; }
    const rec = cleanBody(b[k]);
    if (isEmptyBody(rec)) bad = true;
    else out[k] = { ...rec, updatedAt: +b[k].updatedAt || 0 };
  });
  return { out, bad };
}

/** アダプタから読んだ生データを正規化（LocalAdapter / FirebaseAdapter 共通。移行処理でも使う） */
export function normalizeAll(d) {
  const nd = normDays(d && d.days), nb = normBodies(d && d.body);
  return { days: nd.out, body: nb.out, master: normMaster(d && d.master), settings: normSettings(d && d.settings), hasMaster: masterShapeOk(d && d.master) };
}

/* ---------- ストア本体 ---------- */
export function createStore(initialAdapter) {
  let adapter = initialAdapter;
  let c = { days: {}, body: {}, master: defaultMaster(), settings: normSettings(null) };
  const subs = [], errs = [], notes = [], syncs = [];
  let switching = 0;                             // 保存先の切替中は一切書き込ませない
  /**
   * 書き込んでよいかの確認。だめな時は onError に { code } を通知して false を返す（キャッシュも変更しない）。
   *   switching = 保存先の切替中 ／ not-ready = クラウドの内容をまだ把握できていない（上書き事故の防止）
   */
  function blocked(what) {
    const code = switching ? 'switching' : (adapter.writable && !adapter.writable(what) ? 'not-ready' : '');
    if (!code) return false;
    const e = new Error(code); e.code = code;
    errs.forEach(f => f(e, what));
    return true;
  }
  const emit = (origin, what) => subs.forEach(f => { try { f({ origin, what }); } catch (e) { console.error(e); } });
  async function write(what, fn) {
    emit('local', what);
    try { await fn(); return true; }
    catch (e) { errs.forEach(f => f(e, what)); return false; }
  }
  async function reload() {
    const d = await adapter.load(), issues = (d.issues || []).slice();
    const nd = normDays(d.days), nb = normBodies(d.body), masterBad = d.master != null && !masterShapeOk(d.master);
    c = { days: nd.out, body: nb.out, master: normMaster(d.master), settings: normSettings(d.settings) };
    // 形の不正なデータを捨てる前に元データを退避し、整形後のデータで書き直す（次回以降は退避しない）
    const salvage = async (name, raw, put) => {
      issues.push({ name, saved: adapter.backup ? adapter.backup(name, raw) : null });
      try { await put(); } catch (e) { /* 書けなくても起動は続ける */ }
    };
    if (adapter.backup) {                        // 退避と書き直しは端末内保存の時だけ（クラウドのデータは書き換えない）
      if (nd.bad) await salvage('days', d.days, () => adapter.putDay(null, null, c.days));
      if (nb.bad) await salvage('body', d.body, () => adapter.putBody(null, null, c.body));
      if (masterBad) await salvage('master', d.master, () => adapter.putMaster(c.master));
    }
    if (issues.length) notes.forEach(f => f({ type: 'corrupt', issues }));
  }
  /** 変更通知・同期状態通知をつなぐ。差し替え済みの古いアダプタからの通知は無視する */
  function attach(a) {
    // kind = 'ready'（クラウドの内容を把握でき、書き込めるようになった → 画面は作り直す）| それ以外は通常の変更
    if (a.subscribe) a.subscribe(async kind => { if (a !== adapter) return; await reload(); if (a === adapter) emit('remote', kind === 'ready' ? 'ready' : 'all'); });
    if (a.onSync) a.onSync(() => { if (a === adapter) syncs.forEach(f => f()); });
  }
  return {
    /** キャッシュをメモリに展開 */
    async init() {
      await reload();
      attach(adapter);
    },
    /** 保存先を切り替える（ログイン／ログアウト時）。読み込み完了後に onChange(remote) と onSync を通知 */
    async useAdapter(next) {
      switching++;                             // 切替が終わるまで書き込み不可（表示は旧データ・書き込み先は新、というズレを作らない）
      try {
        const prev = adapter;
        adapter = next;
        if (prev && prev !== next && prev.dispose) { try { prev.dispose(); } catch (e) { /* noop */ } }
        await reload();
      } finally { switching--; }
      if (adapter !== next) return;            // 読み込み中にさらに切り替わった
      attach(next);
      emit('remote', 'switched');
      syncs.forEach(f => f());
    },
    /** 保存先の切替中か */
    isSwitching: () => switching > 0,
    /** クラウドとの接続エラー時に、今すぐ再接続を試みる */
    reconnect() { if (adapter.reconnect) adapter.reconnect(); },
    /** 同期の状態 { mode:'local'|'cloud', online, pending, error } */
    syncState() {
      if (adapter.syncState) return adapter.syncState();
      return { mode: 'local', online: typeof navigator === 'undefined' || navigator.onLine !== false, pending: 0, error: null, ready: true };
    },
    /** 同期状態が変わった時 cb() */
    onSync(cb) { syncs.push(cb); },
    /** cb({origin:'local'|'remote', what}) — local は自分の保存、remote は他タブ（将来はリモート）の変更 */
    onChange(cb) { subs.push(cb); },
    /** 書き込み失敗時 cb(error, what) */
    onError(cb) { errs.push(cb); },
    /** 読み込み時の通知 cb({type:'corrupt', issues:[{name, saved}]}) — 壊れたデータを退避した時 */
    onNotice(cb) { notes.push(cb); },

    days() { return c.days; },
    day(k) { return c.days[k] || null; },
    /** items が空かつ memo が空なら削除。無効セットは保存しない */
    saveDay(k, day) {
      if (!isKey(k) || blocked('days')) return Promise.resolve(false);
      const d = cleanDay(day);
      let stored = null;
      if (isEmptyDay(d)) delete c.days[k];
      else stored = c.days[k] = { ...d, updatedAt: Date.now() };
      return write('days', () => adapter.putDay(k, stored, c.days));
    },

    bodies() { return c.body; },
    body(k) { return c.body[k] || null; },
    /** w, f とも空なら削除 */
    saveBody(k, rec) {
      if (!isKey(k) || blocked('body')) return Promise.resolve(false);
      const r = cleanBody(rec);
      let stored = null;
      if (isEmptyBody(r)) delete c.body[k];
      else stored = c.body[k] = { ...r, updatedAt: Date.now() };
      return write('body', () => adapter.putBody(k, stored, c.body));
    },

    /**
     * 体組成の一部だけを更新（patch に含まれる項目だけ変える。'' や null はその項目の削除）。
     * 画面が古い内容を表示していても、触っていない項目（既存の w / f）を消さない
     */
    patchBody(k, patch) {
      const cur = c.body[k] || {}, next = { w: cur.w, f: cur.f };
      if (patch && 'w' in patch) next.w = patch.w;
      if (patch && 'f' in patch) next.f = patch.f;
      return this.saveBody(k, next);
    },

    master() { return c.master; },
    saveMaster(m) {
      if (blocked('master')) return Promise.resolve(false);
      c.master = { ...normMaster(clone(m)), updatedAt: Date.now() };
      return write('master', () => adapter.putMaster(c.master));
    },

    settings() { return c.settings; },
    saveSettings(s) {
      if (blocked('settings')) return Promise.resolve(false);
      c.settings = { ...normSettings({ ...c.settings, ...s }), updatedAt: Date.now() };
      return write('settings', () => adapter.putSettings(c.settings));
    },
  };
}

/** アプリ全体で使う既定のストア（フェーズ2でアダプタを差し替える） */
export const store = createStore(new LocalAdapter());
