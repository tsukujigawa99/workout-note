// master.js — 部位・種目の管理（追加・名称変更・並び替え・非表示/再表示・部位の色）
import { rerender } from '../state.js';
import { store, newId } from '../store.js';
import { esc, ic, bar, toast, parts, exercises, exOf, partOf, dot } from '../ui.js';
import { PART_COLORS } from '../defaults.js';
import { moveItem, normName, findSameName, findSamePart } from '../calc.js';
import { promptSheet, closeSheet } from './sheets.js';
import { dupMsg } from './pick.js';

let editColor = PART_COLORS[0];
const dupPartMsg = dup => (dup.hidden ? '同じ名前の部位が非表示になっています（再表示できます）' : '同じ名前の部位が既にあります');

function save(next) { store.saveMaster({ ...store.master(), ...next }); rerender(true); }
const tag = hidden => (hidden ? '<span class="tag">非表示</span>' : '');
const mv = (act, id, dir, disabled, label) => '<button class="mbtn" data-act="' + act + '" data-arg="' + esc(id) + ',' + dir + '"' + (disabled ? ' disabled' : '') + ' aria-label="' + esc(label) + '">' + ic(dir < 0 ? 'up' : 'down') + '</button>';

function render() {
  const ps = parts();
  const blocks = ps.map((p, pi) => {
    const exs = exercises().filter(e => e.part === p.id);
    const rows = exs.map((e, i) => '<div class="row mrow' + (e.hidden ? ' off' : '') + '"><button class="t" data-act="meEdit" data-arg="' + esc(e.id) + '" aria-label="' + esc(e.name) + ' を編集"><b>' + esc(e.name) + tag(e.hidden) + '</b></button>'
      + mv('meMove', e.id, -1, i === 0, e.name + ' を上へ') + mv('meMove', e.id, 1, i === exs.length - 1, e.name + ' を下へ') + '</div>').join('');
    return '<div class="msect"><button class="mname' + (p.hidden ? ' off' : '') + '" data-act="mpEdit" data-arg="' + esc(p.id) + '" aria-label="部位 ' + esc(p.name) + ' を編集">' + dot(p.color) + '<span>' + esc(p.name) + tag(p.hidden) + '</span>' + ic('edit') + '</button>'
      + mv('mpMove', p.id, -1, pi === 0, p.name + ' を上へ') + mv('mpMove', p.id, 1, pi === ps.length - 1, p.name + ' を下へ') + '</div>'
      + '<div class="list">' + rows + '<button class="row add" data-act="meAdd" data-arg="' + esc(p.id) + '">' + ic('plus') + '種目を追加</button></div>';
  }).join('');
  return bar('部位・種目の管理', '') + '<div class="pad"><p class="note">名前をタップで編集、矢印で並び替え。非表示にしても過去の記録は残ります。</p>' + blocks
    + '<button class="btn sm ghost" data-act="mpAdd">' + ic('plus') + '部位を追加</button></div>';
}

const swatches = () => '<div class="lbl">色</div><div class="swatches" id="swatches" role="group" aria-label="部位の色">' + PART_COLORS.map(c => '<button class="sw' + (c === editColor ? ' on' : '') + '" data-act="mpColor" data-arg="' + c + '" style="background:' + c + '" aria-label="色 ' + c + '" aria-pressed="' + (c === editColor) + '"></button>').join('') + '</div>';
const hideBtn = (act, id, hidden) => '<button class="btn sm ghost" data-act="' + act + '" data-arg="' + esc(id) + '">' + (hidden ? '再表示する' : '非表示にする（過去の記録は残ります）') + '</button>';

const actions = {
  meAdd(partId) {
    if (!partOf(partId)) return;
    promptSheet({ title: '種目を追加', label: '種目名', placeholder: '例：ケーブルフライ', ok: '追加', emptyMsg: '種目名を入力してください' }, raw => {
      const name = normName(raw), dup = findSameName(exercises(), partId, name);
      if (dup) { toast(dupMsg(dup)); return false; }
      save({ exercises: exercises().concat([{ id: newId(), part: partId, name }]) });
      toast('「' + name + '」を追加しました');
    });
  },
  meEdit(id) {
    const e = exOf(id); if (!e) return;
    promptSheet({ title: '種目の編集', label: '種目名', value: e.name, focus: false, emptyMsg: '種目名を入力してください', footer: hideBtn('meToggle', id, e.hidden) }, raw => {
      const name = normName(raw), dup = findSameName(exercises(), e.part, name, id);
      if (dup) { toast(dupMsg(dup)); return false; }
      save({ exercises: exercises().map(x => (x.id === id ? { ...x, name } : x)) });
    });
  },
  meToggle(id) {
    const e = exOf(id); if (!e) return;
    save({ exercises: exercises().map(x => { if (x.id !== id) return x; const o = { ...x }; if (x.hidden) delete o.hidden; else o.hidden = true; return o; }) });
    closeSheet(); toast('「' + e.name + '」を' + (e.hidden ? '再表示しました' : '非表示にしました'));
  },
  meMove(a) {
    const [id, dir] = a.split(',');
    save({ exercises: moveItem(exercises(), id, +dir, (x, y) => x.part === y.part) });
  },
  mpAdd() {
    const used = new Set(parts().map(p => p.color));
    editColor = PART_COLORS.find(c => !used.has(c)) || PART_COLORS[0];
    promptSheet({ title: '部位を追加', label: '部位名', placeholder: '例：有酸素', maxlength: 12, ok: '追加', after: swatches(), emptyMsg: '部位名を入力してください' }, raw => {
      const name = normName(raw), dup = findSamePart(parts(), name);
      if (dup) { toast(dupPartMsg(dup)); return false; }
      save({ parts: parts().concat([{ id: newId(), name, color: editColor }]) });
      toast('部位「' + name + '」を追加しました');
    });
  },
  mpEdit(id) {
    const p = partOf(id); if (!p) return;
    editColor = p.color;
    promptSheet({ title: '部位の編集', label: '部位名', value: p.name, maxlength: 12, focus: false, after: swatches(), emptyMsg: '部位名を入力してください', footer: hideBtn('mpToggle', id, p.hidden) }, raw => {
      const name = normName(raw), dup = findSamePart(parts(), name, id);
      if (dup) { toast(dupPartMsg(dup)); return false; }
      save({ parts: parts().map(x => (x.id === id ? { ...x, name, color: editColor } : x)) });
    });
  },
  mpColor(c, t) {
    if (!PART_COLORS.includes(c)) return;
    editColor = c;
    document.querySelectorAll('#swatches .sw').forEach(b => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  },
  mpToggle(id) {
    const p = partOf(id); if (!p) return;
    save({ parts: parts().map(x => { if (x.id !== id) return x; const o = { ...x }; if (x.hidden) delete o.hidden; else o.hidden = true; return o; }) });
    closeSheet(); toast('部位「' + p.name + '」を' + (p.hidden ? '再表示しました' : '非表示にしました'));
  },
  mpMove(a) {
    const [id, dir] = a.split(',');
    save({ parts: moveItem(parts(), id, +dir) });
  },
};

export default { render, actions };
