// migrate.js — 端末内データ（won-*）のクラウドへの移行（初回ログイン時）
//   ・クラウドが空 ＆ 端末内に記録あり → 全部アップロード
//   ・クラウドにデータあり ＆ 端末内にも記録あり → クラウドに無い日付だけ追加（上書きしない。master/settings はクラウド優先）
//   ・端末内で追加した種目・部位は、クラウドのマスタに無ければ ID で追加する（既存は上書きしない）→「（不明な種目）」を作らない
//   ・端末内データは消さない（バックアップとして残す）
import { toFirestore, chunk } from './store-firebase.js';

const FLAG_KEY = 'won-migrated';      // { [uid]: 完了時刻 }
const DIRTY_KEY = 'won-local-dirty';  // ログイン歴のある端末で、未ログイン中に端末内へ書いた → 次回ログイン時にもう一度確認する

/* ---------- 純粋関数 ---------- */
const arr = a => (Array.isArray(a) ? a : []);
/**
 * クラウドのマスタに、端末内にしか無い部位・種目を ID で追加する（既存の項目は一切変更しない）。
 * 追加する種目の部位がクラウドに無ければ、その部位も追加する。戻り値 { master, added }（added = 追加した数）
 */
export function mergeMaster(cloudMaster, localMaster) {
  const parts = arr(cloudMaster && cloudMaster.parts).slice(), exercises = arr(cloudMaster && cloudMaster.exercises).slice();
  const partIds = new Set(parts.map(p => p && p.id)), exIds = new Set(exercises.map(e => e && e.id));
  const lp = arr(localMaster && localMaster.parts), le = arr(localMaster && localMaster.exercises);
  let added = 0;
  const addPart = p => { if (p && p.id && !partIds.has(p.id)) { parts.push({ ...p }); partIds.add(p.id); added++; } };
  le.forEach(e => {
    if (!e || !e.id || exIds.has(e.id)) return;
    addPart(lp.find(p => p && p.id === e.part));          // 部位が無い種目は部位も追加
    exercises.push({ ...e }); exIds.add(e.id); added++;
  });
  lp.forEach(addPart);                                     // 種目の無いカスタム部位も追加
  return { master: { ...(cloudMaster || {}), parts, exercises, updatedAt: Date.now() }, added };
}

/**
 * 移行計画を立てる。
 *   cloud: { dayKeys:[], bodyKeys:[], hasMaster, hasSettings, master }  ← サーバーから確認した内容（master = クラウドのマスタの中身）
 *   local: { days:{}, body:{}, master, settings, hasMaster }            ← 端末内データ（正規化済み）
 * 戻り値 { mode:'none'|'upload'|'merge', days:[key], bodies:[key], master:書き込むマスタ|null, settings:bool }
 */
export function planMigration(cloud, local) {
  const ld = Object.keys((local && local.days) || {}).sort(), lb = Object.keys((local && local.body) || {}).sort();
  const cd = new Set(cloud.dayKeys || []), cb = new Set(cloud.bodyKeys || []);
  const none = { mode: 'none', days: [], bodies: [], master: null, settings: false };
  if (!ld.length && !lb.length) return none;                       // 端末内に記録なし
  // マスタ: クラウドに無ければ端末内のものを送る。あれば、端末内にしか無い種目・部位だけを追加（クラウド優先）
  let master = null;
  if (local.hasMaster) {
    if (!cloud.hasMaster) master = local.master;
    else { const m = mergeMaster(cloud.master, local.master); if (m.added) master = m.master; }
  }
  if (!cd.size && !cb.size) return { mode: 'upload', days: ld, bodies: lb, master, settings: !cloud.hasSettings };   // クラウドが空 → 全部アップロード
  const days = ld.filter(k => !cd.has(k)), bodies = lb.filter(k => !cb.has(k));
  if (!days.length && !bodies.length) return none;                 // 追加するものが無い
  return { mode: 'merge', days, bodies, master, settings: false };
}
/** 確認シートの文言 */
export function migrationMessage(plan) {
  const b = plan.bodies.length ? '・体組成 ' + plan.bodies.length + '日分' : '';
  if (plan.mode === 'upload') return 'この端末の記録（' + plan.days.length + '日分' + b + '）をクラウドにアップロードします。';
  if (plan.mode === 'merge') return 'クラウドの記録を使います。この端末だけにある日（' + plan.days.length + '日分' + b + '）を追加しますか？';
  return '';
}
/** 書き込み操作の一覧 [{path:[...], data}]（uid より下のパス） */
export function migrationOps(plan, local) {
  const ops = [];
  plan.days.forEach(k => ops.push({ path: ['days', k], data: toFirestore(local.days[k]) }));
  plan.bodies.forEach(k => ops.push({ path: ['body', k], data: toFirestore(local.body[k]) }));
  if (plan.master) ops.push({ path: ['meta', 'master'], data: toFirestore(plan.master) });
  if (plan.settings) ops.push({ path: ['meta', 'settings'], data: toFirestore(local.settings) });
  return ops;
}

/* ---------- 端末のフラグ（storage = localStorage 互換。使えない環境では何も覚えない） ---------- */
export function createFlags(storage) {
  const read = () => { try { const o = JSON.parse(storage.getItem(FLAG_KEY)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  return {
    isMigrated: uid => !!read()[uid],
    /** 移行の確認が済んだ（実行・辞退・対象なしのいずれでも）。dirty も解除 */
    markMigrated(uid) { try { const o = read(); o[uid] = Date.now(); storage.setItem(FLAG_KEY, JSON.stringify(o)); storage.removeItem(DIRTY_KEY); } catch (e) { /* noop */ } },
    everMigrated: () => Object.keys(read()).length > 0,
    isLocalDirty: () => { try { return storage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } },
    markLocalDirty() { try { storage.setItem(DIRTY_KEY, '1'); } catch (e) { /* noop */ } },
  };
}

/* ---------- サーバー確認と書き込み ---------- */
/** クラウドの内容をサーバーに確認する（キャッシュではなく必ずサーバー。オフライン時は例外 → 呼び出し側で次回に持ち越し） */
export async function inspectCloud(fs, db, uid) {
  const [days, body, master, settings] = await Promise.all([
    fs.getDocsFromServer(fs.collection(db, 'users', uid, 'days')),
    fs.getDocsFromServer(fs.collection(db, 'users', uid, 'body')),
    fs.getDocFromServer(fs.doc(db, 'users', uid, 'meta', 'master')),
    fs.getDocFromServer(fs.doc(db, 'users', uid, 'meta', 'settings')),
  ]);
  const hasMaster = master.exists();
  return { dayKeys: days.docs.map(d => d.id), bodyKeys: body.docs.map(d => d.id), hasMaster, hasSettings: settings.exists(), master: hasMaster ? master.data() : null };
}
/** writeBatch を 500 件ごとに分けて投入。戻り値 = 書き込んだ件数 */
export async function runMigration(fs, db, uid, ops) {
  let n = 0;
  for (const part of chunk(ops, 500)) {
    const batch = fs.writeBatch(db);
    part.forEach(op => batch.set(fs.doc(db, 'users', uid, ...op.path), op.data));
    await batch.commit();
    n += part.length;
  }
  return n;
}
