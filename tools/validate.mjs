// 自動テスト（人の手を介さず「問題なく動くか」を機械的に確認する）
//   node tools/validate.mjs <id>
// チェック内容: 外部リソース禁止 / 容量 / エラー /
//   PC（640×400）: 描画される・キーボードだけで開始して画面が変化する
//   スマホ（360×640 縦・タッチのみ）: 描画される・タップ/スワイプだけで開始して画面が変化する
// 結果は meta.autoTest / meta.platforms に保存し、thumb.jpg（仮サムネ）を生成する。合格なら終了コード 0。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameDir, readMeta, writeMeta, parseArgs, codeStats, jstNow, settings, launchBrowser } from './lib.mjs';
import { openSession } from './play-engine.mjs';

export const CHECK_EN = {
  'index.html が存在する': 'index.html exists',
  'コードが NKB 以下': 'Code size within limit',
  '外部リソース・通信を使っていない': 'No external resources or network calls',
  'alert/confirm/prompt/window.open を使っていない': 'No alert/confirm/prompt/window.open',
  'タッチ操作に対応したイベントを使っている': 'Uses touch-capable events',
  'touch-action を指定している': 'Sets touch-action',
  '言語パラメータ（lang）を読み取っている': 'Reads the lang parameter',
  '日本語/英語で表示が切り替わる（?lang=ja / ?lang=en）': 'Display switches between Japanese and English',
  'PC: 画面に描画されている': 'PC: renders on screen',
  'PC: キーボードだけで開始・操作でき、画面が変化する': 'PC: starts and responds with keyboard only',
  'PC: 操作後も描画が残っている': 'PC: still renders after input',
  'スマホ: 縦画面で描画されている': 'Mobile: renders in portrait',
  'スマホ: タッチだけで開始・操作でき、画面が変化する': 'Mobile: starts and responds with touch only',
  'スマホ: 操作後も描画が残っている': 'Mobile: still renders after input',
  'スマホ: 画面からはみ出してスクロールしない': 'Mobile: no overflow scrolling',
  'JavaScript エラーが出ない': 'No JavaScript errors',
};
const drawn = (i) => (i.canvasVariety ?? 99) > 1 || i.text.length > 0;

export async function validateGame(id, { browser } = {}) {
  const dir = gameDir(id);
  const htmlPath = path.join(dir, 'index.html');
  const checks = [];
  const add = (name, ok, detail = '', group = 'common') => checks.push({ name, ok, detail, group });

  if (!fs.existsSync(htmlPath)) {
    add('index.html が存在する', false);
    return { passed: false, checks, errors: [], platforms: { pc: false, mobile: false } };
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const stats = codeStats(html);
  const budget = Math.min(120, settings().gameBudgetKB / 2);
  add(`コードが ${budget}KB 以下`, stats.bytes < budget * 1024, `${(stats.bytes / 1024).toFixed(1)}KB`);
  const ext = html.match(/<(script|link|img|iframe|audio|video|source)[^>]+(src|href)=["']https?:\/\/[^"']+/i)
    || html.match(/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/)
    || html.match(/@import\s+url\(\s*['"]?https?:/i);
  add('外部リソース・通信を使っていない', !ext, ext ? ext[0].slice(0, 80) : '');
  const banned = html.match(/\b(alert|confirm|prompt)\s*\(|window\.open\s*\(/);
  add('alert/confirm/prompt/window.open を使っていない', !banned, banned ? banned[0] : '');
  add('タッチ操作に対応したイベントを使っている', /pointerdown|touchstart/i.test(html));
  add('touch-action を指定している', /touch-action\s*:\s*none/i.test(html));
  add('言語パラメータ（lang）を読み取っている', /get\(\s*['"]lang['"]\s*\)|[?&]lang=/.test(html));

  const own = !browser;
  browser ||= await launchBrowser();
  const errors = [];
  try {
    // ---- 日英切り替え: ?lang=ja と ?lang=en でタイトル画面の表示が変わるか ----
    {
      const shots = {};
      for (const lang of ['ja', 'en']) {
        const l = await openSession(id, { browser, frozen: true, device: 'pc', lang });
        try { shots[lang] = await l.page.screenshot({ type: 'jpeg', quality: 60 }); }
        finally { await l.close(); errors.push(...l.errors.map((e) => `[${lang}] ` + e)); }
      }
      add('日本語/英語で表示が切り替わる（?lang=ja / ?lang=en）', !shots.ja.equals(shots.en));
    }
    // ---- PC: キーボードで開始・操作 ----
    const s = await openSession(id, { browser, frozen: false, device: 'pc' });
    try {
      const first = await s.inspect();
      add('PC: 画面に描画されている', drawn(first), `canvas色数=${first.canvasVariety ?? '-'}`, 'pc');
      const before = await s.page.screenshot({ type: 'jpeg', quality: 60 });
      await s.act([{ keys: ['Space'], hold: 80 }, { keys: ['Enter'], hold: 80, wait: 200 }]);
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW'];
      for (let i = 0; i < 10; i++) await s.act({ keys: [keys[(Math.random() * keys.length) | 0]], hold: 150, wait: 50 });
      const after = await s.page.screenshot({ type: 'jpeg', quality: 60 });
      const info = await s.inspect();
      add('PC: キーボードだけで開始・操作でき、画面が変化する', !before.equals(after), '', 'pc');
      add('PC: 操作後も描画が残っている', drawn(info), `canvas色数=${info.canvasVariety ?? '-'}`, 'pc');
      // マウスでも反応するか（警告扱いにせず、記録のみ）
      await s.act([{ tap: [0.5, 0.6], hold: 80 }, { tap: [0.3, 0.6], hold: 200 }]);
      if (!fs.existsSync(path.join(dir, 'thumb.jpg')) && !fs.existsSync(path.join(dir, 'thumb.webp')) || process.argv.includes('--thumb')) {
        await s.page.screenshot({ path: path.join(dir, 'thumb.jpg'), type: 'jpeg', quality: 80 });
      }
    } finally {
      await s.close();
      errors.push(...s.errors);
    }

    // ---- スマホ: 縦画面・タッチだけで開始・操作 ----
    const m = await openSession(id, { browser, frozen: false, device: 'mobile' });
    try {
      const first = await m.inspect();
      add('スマホ: 縦画面で描画されている', drawn(first), `canvas色数=${first.canvasVariety ?? '-'}`, 'mobile');
      const before = await m.page.screenshot({ type: 'jpeg', quality: 60 });
      await m.act({ tap: [0.5, 0.5], hold: 80, wait: 300 });
      for (let i = 0; i < 8; i++) {
        const x = 0.15 + Math.random() * 0.7, y = 0.3 + Math.random() * 0.6;
        if (i % 3 === 2) await m.act({ swipe: [x, y, 1 - x, y], hold: 180, wait: 80 });
        else await m.act({ tap: [x, y], hold: 120 + ((Math.random() * 300) | 0), wait: 80 });
      }
      const after = await m.page.screenshot({ type: 'jpeg', quality: 60 });
      const info = await m.inspect();
      add('スマホ: タッチだけで開始・操作でき、画面が変化する', !before.equals(after), '', 'mobile');
      add('スマホ: 操作後も描画が残っている', drawn(info), `canvas色数=${info.canvasVariety ?? '-'}`, 'mobile');
      const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2 || document.documentElement.scrollHeight > innerHeight + 2);
      add('スマホ: 画面からはみ出してスクロールしない', !overflow, '', 'mobile');
    } finally {
      await m.close();
      errors.push(...m.errors.map((e) => '[スマホ] ' + e));
    }
  } finally {
    if (own) await browser.close();
  }
  const uniq = [...new Set(errors)];
  add('JavaScript エラーが出ない', uniq.length === 0, uniq.slice(0, 3).join(' | '));

  for (const c of checks) c.nameEn = CHECK_EN[c.name.replace(/\d+KB/, 'NKB')] || c.name;
  const ok = (g) => checks.filter((c) => c.group === g || c.group === 'common').every((c) => c.ok);
  return { passed: checks.every((c) => c.ok), checks, errors: uniq, code: stats, platforms: { pc: ok('pc'), mobile: ok('mobile') } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const id = args._[0];
  if (!id) { console.error('使い方: node tools/validate.mjs <id> [--thumb]'); process.exit(1); }
  const result = await validateGame(id);
  const meta = readMeta(id);
  meta.generation ||= {};
  meta.generation.validationRuns = (meta.generation.validationRuns || 0) + 1;
  meta.autoTest = { passed: result.passed, testedAt: jstNow().iso, version: 2, checks: result.checks, errors: result.errors };
  meta.platforms = result.platforms;
  meta.languages = result.checks.find((c) => c.name.startsWith('日本語/英語'))?.ok ? ['ja', 'en'] : ['ja'];
  if (result.code) meta.code = result.code;
  writeMeta(id, meta);
  for (const c of result.checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  if (result.errors.length) console.log('\nエラー詳細:\n - ' + result.errors.join('\n - '));
  console.log(`\n対応端末: PC ${result.platforms.pc ? '○' : '×'} / スマホ ${result.platforms.mobile ? '○' : '×'}`);
  console.log(result.passed ? '合格: 自動テストを通過しました' : '不合格: 上記を修正して再実行してください');
  process.exit(result.passed ? 0 : 2);
}
