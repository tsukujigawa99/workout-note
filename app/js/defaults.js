// defaults.js — 初期の部位・種目マスタ、設定初期値
export const APP_NAME = 'WorkOut Note';
export const APP_VERSION = '1.3.0';   // sw.js の CACHE_VERSION も合わせて上げること

export const DEFAULT_PARTS = [
  { id: 'chest', name: '胸', color: '#E07A3F' },
  { id: 'back', name: '背中', color: '#3F7FBF' },
  { id: 'sho', name: '肩', color: '#8A63C9' },
  { id: 'arm', name: '腕', color: '#2FA38A' },
  { id: 'leg', name: '脚', color: '#C9A227' },
  { id: 'abs', name: '腹', color: '#6B7A8F' },
];

export const DEFAULT_EXERCISES = [
  ['bp', 'chest', 'ベンチプレス'], ['idp', 'chest', 'インクラインダンベルプレス'], ['fly', 'chest', 'ダンベルフライ'], ['dip', 'chest', 'ディップス'], ['pu', 'chest', 'プッシュアップ'],
  ['dl', 'back', 'デッドリフト'], ['lat', 'back', 'ラットプルダウン'], ['row', 'back', 'ベントオーバーロウ'], ['chin', 'back', '懸垂'],
  ['sp', 'sho', 'ショルダープレス'], ['sr', 'sho', 'サイドレイズ'], ['rr', 'sho', 'リアレイズ'],
  ['bc', 'arm', 'バーベルカール'], ['ic', 'arm', 'インクラインカール'], ['pd', 'arm', 'ケーブルプレスダウン'],
  ['sq', 'leg', 'スクワット'], ['lp', 'leg', 'レッグプレス'], ['lc', 'leg', 'レッグカール'], ['add', 'leg', 'ヒップアダクター'],
  ['ab', 'abs', 'アブローラー'], ['cc', 'abs', 'ケーブルクランチ'],
].map(a => ({ id: a[0], part: a[1], name: a[2] }));

/** 部位の色プリセット（先頭6色は初期部位の色） */
export const PART_COLORS = ['#E07A3F', '#3F7FBF', '#8A63C9', '#2FA38A', '#C9A227', '#6B7A8F', '#D2527F', '#5B9E3A', '#3AA6B9', '#A0664B'];

export const STEP_CHOICES = [1, 1.25, 2.5, 5];
export const TIMER_PRESETS = [60, 90, 120, 180];
export const DEFAULT_SETTINGS = { step: 2.5, timerSec: 90 };

export function defaultMaster() {
  return { parts: DEFAULT_PARTS.map(p => ({ ...p })), exercises: DEFAULT_EXERCISES.map(e => ({ ...e })), updatedAt: 0 };
}
