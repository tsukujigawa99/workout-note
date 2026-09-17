// timer.js — インターバルタイマー（終了時刻ベース。画面遷移しても継続）
let audio = null;
const tickCbs = [], doneCbs = [];
let handle = 0;

export const timer = {
  sec: 90,          // 次に START する秒数
  end: 0,           // 終了時刻(ms)。0 = 停止中
  running() { return this.end > 0; },
  remaining() { return Math.max(0, Math.ceil((this.end - Date.now()) / 1000)); },
  setSec(v) { const n = Math.round(+v); if (Number.isFinite(n) && n >= 1) this.sec = Math.min(3600, n); return this.sec; },
  onTick(cb) { tickCbs.push(cb); },
  onDone(cb) { doneCbs.push(cb); },
  /** 必ずユーザー操作（タップ）の中から呼ぶこと（iOS の音声解禁のため） */
  start(sec) {
    if (sec != null) this.setSec(sec);
    unlockAudio();
    clearInterval(handle);
    this.end = Date.now() + this.sec * 1000;
    handle = setInterval(check, 250);
  },
  stop() { clearInterval(handle); handle = 0; this.end = 0; },
};

function check() {
  if (!timer.end) return;
  if (Date.now() >= timer.end) {
    timer.stop();
    beep();
    doneCbs.forEach(f => f());
  } else tickCbs.forEach(f => f(timer.remaining()));
}
// バックグラウンドから復帰した瞬間にも判定する（iOS は裏で setInterval が止まる）
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

function unlockAudio() {
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    if (!audio) audio = new A();
    if (audio.state === 'suspended') audio.resume();
    // 無音に近い短い音を鳴らして解禁状態にしておく
    const o = audio.createOscillator(), g = audio.createGain();
    g.gain.value = 0.0001; o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.05);
  } catch (e) { /* 音が使えない環境では画面表示のみ */ }
}

function beep() {
  try {
    if (audio) {
      if (audio.state === 'suspended') audio.resume();
      [0, .25, .5].forEach(t => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(.2, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + t + .2);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .22);
      });
    }
  } catch (e) { /* noop */ }
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* noop */ }
}

export const mmss = left => String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
