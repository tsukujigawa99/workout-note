// calc.js — 純粋関数のみ（DOM / ストア非依存）。tests/test.html から import してテストする。

/* ---------- 日付ユーティリティ（すべてローカル時刻。toISOString は使わない） ---------- */
export const pad = n => String(n).padStart(2, '0');
export const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const todayKey = (now = new Date()) => dateKey(now);
export const fromKey = k => { const a = String(k).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
export const isKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && dateKey(fromKey(k)) === k;
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addDaysKey = (k, n) => dateKey(addDays(fromKey(k), n));
export const slash = k => String(k).replace(/-/g, '/');
export const md = k => String(k).slice(5).replace('-', '/');
export const monthPrefix = (y, m) => y + '-' + pad(m + 1);      // m は 0 始まり
export function shiftMonth(y, m, delta) {
  const d = new Date(y, m + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}
/** 月カレンダーのセル（日曜始まり・週単位）。m は 0 始まり */
export function calendarCells(y, m) {
  const first = new Date(y, m, 1), start = addDays(first, -first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    cells.push({ key: dateKey(d), day: d.getDate(), out: d.getMonth() !== m });
  }
  return cells;
}

/* ---------- 数値フォーマット ---------- */
function roundTo(n, digits) {
  const p = Math.pow(10, digits), v = Number(n) || 0;
  return Math.round(v * p + (v >= 0 ? 1e-7 : -1e-7)) / p;   // 48.125 → 48.13 を浮動小数誤差から守る
}
export const f1 = n => roundTo(n, 1).toFixed(1);
export const f2 = n => roundTo(n, 2).toFixed(2);
/** 重量表示: 通常は小数1桁。1.25kg 刻みなど小数2桁が必要な値だけ2桁 */
export function fw(w) {
  const v = roundTo(w == null ? 0 : w, 2);
  return Math.round(v * 100) % 10 === 0 ? v.toFixed(1) : v.toFixed(2);
}
export const ton = kg => f2(kg / 1000);

/* ---------- 入力値の正規化 ---------- */
export const W_MAX = 999.5, R_MAX = 999;
/** 重量: 空→null、非数・負数→null（無視）、0〜999.5 に収め小数2桁に丸め */
export function normW(v) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(W_MAX, roundTo(n, 2));
}
/** 回数: 空→null、非数・負数→null（無視）、0〜999 の整数に丸め */
export function normR(v) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(R_MAX, Math.round(n));
}
/** 体組成の値: 空・0以下・非数→undefined、上限で打ち切り、小数1桁 */
export function normBodyVal(v, max) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(max, roundTo(n, 1));
}
export function stepWeight(w, delta) { return Math.min(W_MAX, Math.max(0, roundTo((w || 0) + delta, 2))); }
export function stepReps(r, delta) { return Math.min(R_MAX, Math.max(0, Math.round((r || 0) + delta))); }

/* ---------- 1RM・ボリューム ---------- */
/** 推定1RM = w × (1 + r/40) */
export const rm = (w, r) => (Number(w) || 0) * (40 + Number(r)) / 40;
/** 有効セット: r > 0（w が空なら 0kg 扱い） */
export const isValidSet = s => !!s && typeof s.r === 'number' && Number.isFinite(s.r) && s.r > 0;
export const setW = s => (s && typeof s.w === 'number' && Number.isFinite(s.w) ? s.w : 0);
export const validSets = it => (it && Array.isArray(it.sets) ? it.sets.filter(isValidSet) : []);
export const itemVol = it => validSets(it).reduce((a, s) => a + setW(s) * s.r, 0);
export const itemRM = it => validSets(it).reduce((a, s) => Math.max(a, rm(setW(s), s.r)), 0);
export const dayVol = day => (day && Array.isArray(day.items) ? day.items.reduce((a, it) => a + itemVol(it), 0) : 0);
export const isTrained = day => !!(day && Array.isArray(day.items) && day.items.some(it => validSets(it).length > 0));
/** 1RM から n 回挙げられる目安重量 */
export const weightForReps = (oneRm, n) => oneRm / (1 + n / 40);

/* ---------- 期間集計（tKey = 今日のキー） ---------- */
/** 今日から from 日前〜to 日前（両端含む）の合計ボリューム。rangeVol(days,t,0,6) = 今日を含む直近7日 */
export function rangeVol(days, tKey, from, to) {
  let t = 0;
  for (let i = from; i <= to; i++) t += dayVol(days[addDaysKey(tKey, -i)]);
  return t;
}
/** 週別バー: 今日起点で7日ずつ n 本 [今週, 1週前, ...] */
export const weeklyVols = (days, tKey, n = 6) => Array.from({ length: n }, (_, i) => rangeVol(days, tKey, i * 7, i * 7 + 6));
export const totalVol = days => Object.keys(days).reduce((a, k) => a + dayVol(days[k]), 0);
export const monthDays = (days, y, m) => { const p = monthPrefix(y, m) + '-'; return Object.keys(days).filter(k => k.startsWith(p) && isTrained(days[k])).length; };
export const totalDays = days => Object.keys(days).filter(k => isTrained(days[k])).length;
export const VEHICLES = { car: 1500, bus: 15000, plane: 350000 };
export const vehicles = (kg, unitKg) => f1(kg / unitKg);
/** range 日前以降か（range=0 は全期間） */
export const inRange = (k, tKey, range) => !range || k >= addDaysKey(tKey, -range);

/** 種目の履歴（新しい順）。beforeKey 指定時はその日より前のみ */
export function exHistory(days, exId, beforeKey) {
  return Object.keys(days).filter(k => !beforeKey || k < beforeKey).sort().reverse()
    .map(k => ({ k, it: (days[k].items || []).find(i => i.ex === exId && validSets(i).length > 0) }))
    .filter(x => x.it);
}
/** beforeKey より前の実施日（新しい順）。当日・未来日は含まない */
export function recentTrainedKeys(days, beforeKey, limit = 30) {
  return Object.keys(days).filter(k => k < beforeKey && isTrained(days[k])).sort().reverse().slice(0, limit);
}

/* ---------- グラフ・RM計算機・ルーティング補助 ---------- */
/** グラフの目盛り: 実データの 最小・中間・最大（重複は除く） */
export function chartTicks(ys) {
  if (!ys.length) return [];
  const mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
  return mn === mx ? [mn] : [mn, (mn + mx) / 2, mx];
}
/** RM計算機の回数: 1〜999 の整数（空・非数は null） */
export function normRmReps(v) { const r = normR(v); return r == null ? null : Math.max(1, r); }

/** 記録できる日付の範囲: 2000-01-01 〜 今日+1年 */
export const DATE_MIN = '2000-01-01';
export function dateMax(tKey) { const d = fromKey(tKey); return dateKey(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())); }
export const isUsableDate = (k, tKey) => isKey(k) && k >= DATE_MIN && k <= dateMax(tKey);

const ROUTES = ['home', 'pick', 'entry', 'history', 'analysis', 'body', 'settings', 'master'];
/**
 * hash を解釈する（種目の実在チェックは呼び出し側）。未知の画面は null。
 *   #/pick/<date>  #/entry/<date>/<exId>  #/history/<exId>   不正・範囲外（2000-01-01〜今日+1年 の外）の日付は tKey（今日）にフォールバック
 */
export function parseHash(hash, tKey) {
  const dec = s => { try { return decodeURIComponent(s); } catch (e) { return ''; } };
  const a = String(hash || '').replace(/^#\/?/, '').split('/').map(dec), name = a[0] || 'home';
  if (!ROUTES.includes(name)) return null;
  const r = { name, date: null, ex: null };
  if (name === 'pick') r.date = isUsableDate(a[1], tKey) ? a[1] : tKey;
  else if (name === 'entry') {
    if (a.length >= 3) { r.date = isUsableDate(a[1], tKey) ? a[1] : tKey; r.ex = a[2] || null; }
    else { r.date = tKey; r.ex = a[1] || null; }          // 旧形式 #/entry/<exId>
  } else if (name === 'history') r.ex = a[1] || null;
  r.hash = '#/' + name + (r.date ? '/' + r.date : '') + (r.ex ? '/' + encodeURIComponent(r.ex) : '');
  return r;
}
/** sessionStorage に保存した選択日の復元。保存した日と同じ日のうちだけ有効（翌日は今日に戻す） */
export function restoreDate(raw, tKey) {
  try { const o = JSON.parse(raw); return o && o.on === tKey && isUsableDate(o.date, tKey) ? o.date : tKey; } catch (e) { return tKey; }
}

/* ---------- マスタ名称 ---------- */
export const NAME_MAX = 40;
export const normName = s => String(s == null ? '' : s).trim().slice(0, NAME_MAX);
/** 同名の部位があればそれを返す（exceptId は自分自身を除外） */
export function findSamePart(parts, name, exceptId) {
  const n = normName(name);
  return parts.find(p => p.id !== exceptId && normName(p.name) === n) || null;
}
/** 同じ部位に同名の種目があればそれを返す（exceptId は自分自身を除外） */
export function findSameName(exercises, part, name, exceptId) {
  const n = normName(name);
  return exercises.find(e => e.part === part && e.id !== exceptId && normName(e.name) === n) || null;
}

/* ---------- 保存前の整形 ---------- */
const normSet = s => ({ w: normW(s.w), r: normR(s.r), memo: String(s.memo == null ? '' : s.memo), assist: !!s.assist });
/** 無効セット・空の種目を除いた日データを返す（元データは変更しない） */
export function cleanDay(day) {
  const items = (day && Array.isArray(day.items) ? day.items : [])
    .map(it => ({ ex: it && it.ex, sets: (it && Array.isArray(it.sets) ? it.sets : []).map(normSet).filter(isValidSet) }))
    .filter(it => it.ex && it.sets.length);
  return { memo: String(day && day.memo != null ? day.memo : ''), items };
}
export const isEmptyDay = day => !day || (!(day.items && day.items.length) && String(day.memo || '').trim() === '');
export function cleanBody(rec) {
  const out = {}, w = normBodyVal(rec && rec.w, 999.9), f = normBodyVal(rec && rec.f, 100);
  if (w !== undefined) out.w = w;
  if (f !== undefined) out.f = f;
  return out;
}
export const isEmptyBody = rec => !rec || (rec.w === undefined && rec.f === undefined);
/** コピー用: 有効セットの重量・回数のみ（メモ・補助はコピーしない） */
export const copySets = it => validSets(it).map(s => ({ w: s.w == null ? null : s.w, r: s.r, memo: '', assist: false }));
/** src の日のメニューを dst にコピー（dst に既にある種目は追加しない）。新しい day を返す */
export function mergeCopyDay(dst, src) {
  const out = cleanDay(dst || { memo: '', items: [] });
  let added = 0;
  ((src && src.items) || []).forEach(it => {
    const sets = copySets(it);
    if (sets.length && !out.items.some(x => x.ex === it.ex)) { out.items.push({ ex: it.ex, sets }); added++; }
  });
  return { day: out, added };
}

/* ---------- マスタ並び替え ---------- */
/** list 内の id の要素を、same(a,b) が真の隣接グループ内で dir(-1/+1) 方向へ入れ替えた新配列を返す */
export function moveItem(list, id, dir, same = () => true) {
  const out = list.slice(), i = out.findIndex(x => x.id === id);
  if (i < 0) return out;
  let j = i + dir;
  while (j >= 0 && j < out.length && !same(out[i], out[j])) j += dir;
  if (j < 0 || j >= out.length) return out;
  const t = out[i]; out[i] = out[j]; out[j] = t;
  return out;
}
