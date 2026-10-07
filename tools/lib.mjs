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
