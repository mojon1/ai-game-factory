// 共通ユーティリティ（パス・メタデータ・ブラウザ起動）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAMES_DIR = process.env.GAMES_DIR ? path.resolve(process.env.GAMES_DIR) : path.join(ROOT, 'games');


export const gameDir = (id) => path.join(GAMES_DIR, id);
export const gameUrl = (id, lang) => pathToFileURL(path.join(gameDir(id), 'index.html')).href + (lang ? `?lang=${lang}` : '');

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export const readMeta = (id) => {
  const m = readJson(path.join(gameDir(id), 'meta.json'));
  if (!m) throw new Error(`meta.json が見つかりません: games/${id}/meta.json`);
  return m;
};
export const writeMeta = (id, meta) => writeJson(path.join(gameDir(id), 'meta.json'), meta);

export function listGameIds() {
  if (!fs.existsSync(GAMES_DIR)) return [];
  return fs.readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(GAMES_DIR, d.name, 'meta.json')))
    .map((d) => d.name)
    .sort();
}

// JST の日付・時刻
export function jstNow() {
  const d = new Date(Date.now() + 9 * 3600e3);
  const iso = d.toISOString().replace('Z', '+09:00').replace(/\.\d+/, '');
  return { date: iso.slice(0, 10), iso };
}

// ゲームID: <日付>-<制作者>-<連番>（例 2026-10-08-claude-1）。複数のAIが同じ日に作っても衝突しない。
export function nextGameId(maker, date = jstNow().date) {
  const slug = String(maker || 'ai').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'ai';
  let i = 1, id;
  do { id = `${date}-${slug}-${i++}`; } while (fs.existsSync(gameDir(id)));
  return id;
}

// 引数パーサ: --key value / --flag
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) out[k] = true; else { out[k] = v; i++; }
    } else out._.push(a);
  }
  return out;
}

// Playwright のブラウザ起動（同梱 Chromium → Edge → Chrome の順に試す）
export async function launchBrowser() {
  const { chromium } = await import('playwright');
  const tries = [{}, { channel: 'msedge' }, { channel: 'chrome' }];
  let lastErr;
  for (const opt of tries) {
    try { return await chromium.launch({ headless: true, ...opt }); } catch (e) { lastErr = e; }
  }
  throw new Error('ブラウザを起動できません。`npx playwright install chromium` を実行してください。\n' + lastErr?.message);
}

// サイトの iframe sandbox と同じ制約を再現（storage 不可）
export const SANDBOX_INIT = `(() => {
  for (const k of ['localStorage', 'sessionStorage']) {
    try { Object.defineProperty(window, k, { get() { throw new DOMException('sandboxed iframe: ' + k + ' is not available', 'SecurityError'); } }); } catch (e) {}
  }
  window.alert = window.confirm = window.prompt = () => { throw new Error('alert/confirm/prompt は使用禁止です'); };
  // 音の検査用: 音を鳴らし始めた時刻とループ再生（BGM）の数を記録する（鳴り方は変えない）
  // 鳴っている音（始まって、まだ終わっていないもの）も数え、「今、何か音が聞こえているか」を確かめられるようにする
  window.__agfAudio = { starts: [], loops: 0, playing: new Set() };
  const noteStart = (node) => {
    const a = window.__agfAudio;
    a.starts.push(performance.now());
    if (node.loop) a.loops++;
    a.playing.add(node);
    try { node.addEventListener('ended', () => a.playing.delete(node)); } catch (e) {}
  };
  // 検査用の WebKit（iPhone 相当）は Web Audio を持たない。実機の iPhone にはあるので、音の出ない代わりの部品を置き、
  // 「AudioContext が無い」という検査環境だけのエラーで不合格にならないようにする
  if (!window.AudioContext && !window.webkitAudioContext) {
    const PARAMS = /^(gain|frequency|detune|Q|pan|delayTime|playbackRate|offset|threshold|knee|ratio|attack|release|positionX|positionY|positionZ)$/;
    const param = () => new Proxy({ value: 0 }, { get: (t, k) => (k in t ? t[k] : () => param()), set: (t, k, v) => ((t[k] = v), true) });
    const node = () => {
      const n = new Proxy({}, {
        get(t, k) {
          if (k in t) return t[k];
          if (k === 'connect') return (d) => d || node();
          if (k === 'start') return () => noteStart(n);
          if (typeof k === 'string' && PARAMS.test(k)) return (t[k] = param());
          if (k === 'then' || typeof k === 'symbol') return undefined;
          return () => node();
        },
        set: (t, k, v) => ((t[k] = v), true),
      });
      return n;
    };
    class SilentAudioContext {
      constructor() {
        this.state = 'running'; this.sampleRate = 44100; this.destination = node(); this.listener = node(); this._t0 = performance.now();
        return new Proxy(this, { get: (t, k) => (k in t ? (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) : typeof k === 'string' && k.startsWith('create') ? () => node() : undefined) });
      }
      get currentTime() { return (performance.now() - this._t0) / 1000; }
      resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
      createBuffer(ch, len, sr) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => d[i], copyToChannel() {} }; }
      decodeAudioData() { return Promise.resolve(this.createBuffer(1, 1, 44100)); }
    }
    window.AudioContext = window.webkitAudioContext = SilentAudioContext;
    for (const name of ['GainNode', 'OscillatorNode', 'AudioBufferSourceNode', 'StereoPannerNode', 'BiquadFilterNode', 'DelayNode', 'ConvolverNode', 'DynamicsCompressorNode', 'WaveShaperNode', 'ConstantSourceNode', 'PannerNode', 'AnalyserNode']) {
      window[name] = function () { return node(); };
    }
  }
  try {
    // AudioBufferSourceNode は start を自分で持っているので、両方の prototype を包む
    for (const C of [window.AudioScheduledSourceNode, window.AudioBufferSourceNode]) {
      const P = C && C.prototype;
      if (!P || !Object.prototype.hasOwnProperty.call(P, 'start')) continue;
      const start = P.start;
      P.start = function (...args) { noteStart(this); return start.apply(this, args); };
    }
  } catch (e) {}
  // 3D（WebGL）の画面も検査で読み取れるように、描画内容を保持させる（見た目は変わらない）
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (/^(webgl2?|experimental-webgl)$/.test(type)) opts = { ...(opts || {}), preserveDrawingBuffer: true };
    return getContext.call(this, type, opts);
  };
})();`;

// 決定論的リプレイ用の乱数シード
export const SEEDED_RANDOM_INIT = (seed) => `(() => {
  let s = ${seed >>> 0} || 1;
  Math.random = function () { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

// 日次制作の設定（容量の上限など）
export function settings() {
  return {
    gamesPerDay: 3,
    thumb: { maxWidth: 300, maxHeight: 534, quality: 0.72 },     // 縦長（9:16）
    playImage: { maxWidth: 240, maxHeight: 427, quality: 0.6 },
    keepPlayImages: 4,
    gameMaxKB: 200,          // ゲーム本体（index.html）の容量上限
    gameBudgetKB: 400,       // 1作品フォルダの容量の目安（コード＋画像）
    siteBudgetMB: 900,       // GitHub Pages の上限 1GB に対する安全ライン
    ...readJson(path.join(ROOT, 'factory', 'settings.json'), {}),
  };
}

// 画像を WebP に縮小変換（追加ライブラリ不要。ブラウザの canvas でエンコード）
//   files: [{ src, dest, maxWidth, maxHeight, quality }]
export async function toWebp(files, browser = null) {
  if (!files.length) return;
  const own = !browser;
  browser ||= await launchBrowser();
  const page = await browser.newPage();
  try {
    for (const f of files) {
      const b64 = fs.readFileSync(f.src).toString('base64');
      const mime = f.src.endsWith('.png') ? 'image/png' : f.src.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      const out = await page.evaluate(async ({ b64, mime, mw, mh, q }) => {
        const img = new Image();
        img.src = `data:${mime};base64,${b64}`;
        await img.decode();
        const s = Math.min(1, mw / img.naturalWidth, mh / img.naturalHeight);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/webp', q).split(',')[1];
      }, { b64, mime, mw: f.maxWidth, mh: f.maxHeight, q: f.quality });
      fs.writeFileSync(f.dest, Buffer.from(out, 'base64'));
    }
  } finally {
    await page.close();
    if (own) await browser.close();
  }
}

export function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

export function codeStats(html) {
  return { bytes: Buffer.byteLength(html, 'utf8'), lines: html.split('\n').length };
}

// ゲームが読み込んでいる共有ライブラリ（<script src="../../lib/…">）を、棚の登録内容（名前・版）と合わせて返す
export function detectLibraries(html) {
  const shelf = readJson(path.join(ROOT, 'lib', 'catalog.json'), { libraries: [] }).libraries || [];
  const files = [...html.matchAll(/<script[^>]+src=["']\.\.\/\.\.\/lib\/([^"'?#]+)/gi)].map((m) => m[1]);
  return [...new Set(files)].map((file) => {
    const l = shelf.find((x) => x.file === file);
    return { name: l?.name || file, version: l?.version || null, file };
  });
}

// 作品の構造（meta.json の structure）。recent.mjs で過去作品の偏りを集計して、企画のときに見せる
export const STRUCTURE = {
  goal: { score: '点数を伸ばす', clear: 'クリアを目指す（ステージ・目標）', survive: 'できるだけ長く生き延びる', complete: '完成させる・集めきる', none: '目標なし（遊び場・体験）', other: 'その他' },
  ending: { time: '時間切れで終わる', fail: 'ミス・やられたら終わる', goal: '目標を達成したら終わる', limit: '手数・回数を使い切ったら終わる', none: '終わりなし（自分でやめる）', other: 'その他' },
  input: { tap: 'タップ', hold: '長押し', swipe: 'スワイプ・はじく', drag: 'ドラッグ・動かす', draw: 'なぞる・線を描く', multi: '複数の指' },
};
// 構造の記録が無い初期の作品は、後から付けた分類（factory/structure-backfill.json）を使う
export function structureOf(id, meta) {
  if (meta?.structure?.goal) return meta.structure;
  return readJson(path.join(ROOT, 'factory', 'structure-backfill.json'), {}).games?.[id] || null;
}
// structure の値が正しいか（問題があれば説明の配列を返す）
export function checkStructure(s) {
  const err = [];
  if (!s || typeof s !== 'object') return ['structure がありません'];
  if (!STRUCTURE.goal[s.goal]) err.push(`structure.goal は ${Object.keys(STRUCTURE.goal).join(' / ')} のいずれか`);
  if (!STRUCTURE.ending[s.ending]) err.push(`structure.ending は ${Object.keys(STRUCTURE.ending).join(' / ')} のいずれか`);
  if (!Array.isArray(s.input) || !s.input.length || s.input.length > 2 || !s.input.every((k) => STRUCTURE.input[k])) err.push(`structure.input は ${Object.keys(STRUCTURE.input).join(' / ')} から1〜2個の配列`);
  return err;
}

// ジャンルの一覧（factory/genres.json）と、企画のくじ
export const genres = () => readJson(path.join(ROOT, 'factory', 'genres.json'), { genres: [] }).genres;
export const genreEn = (ja) => genres().find((g) => g.ja === ja)?.en || null;
export const DRAW_FILE = path.join(ROOT, '.genre-draw.json');

// 企画の記録（meta.json の planning）が正しいか（問題があれば説明の配列を返す）
//   planning: { genreDraw: {ja, en}, candidates: [{ idea, ideaEn, fromDraw }, ×3], chosen: 0〜2 }
export function checkPlanning(p, genre) {
  const err = [];
  if (!p?.genreDraw?.ja) err.push('planning.genreDraw がありません（node tools/draw-genre.mjs でくじを引いてから new-game.mjs を実行）');
  const c = p?.candidates;
  if (!Array.isArray(c) || c.length !== 3) err.push('planning.candidates は候補3つの配列');
  else {
    if (c.some((x) => !x?.idea || !x?.ideaEn)) err.push('planning.candidates の各候補に idea と ideaEn（英訳）を書く');
    if (c.filter((x) => x?.fromDraw === true).length !== 1) err.push('planning.candidates のうち、くじのジャンルで考えた候補1つだけを fromDraw: true にする');
  }
  if (![0, 1, 2].includes(p?.chosen)) err.push('planning.chosen は作ることにした候補の番号（0〜2）');
  if (genre && !genres().some((g) => g.ja === genre)) err.push('genre は factory/genres.json の ja のいずれか');
  return err;
}
