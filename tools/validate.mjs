// 自動テスト（人の手を介さず「スマホで問題なく動くか」を機械的に確認する）
//   node tools/validate.mjs <id> [--thumb]
// Android（Chromium）と iPhone（WebKit）の両方で、縦画面・タッチだけで検査する。
// 結果は meta.autoTest に保存し、thumb.jpg（仮サムネ）を生成する。合格なら終了コード 0。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, gameDir, readMeta, writeMeta, readJson, parseArgs, codeStats, jstNow, settings, detectLibraries } from './lib.mjs';
import { openSession, launch } from './play-engine.mjs';

export const CHECK_EN = {
  'index.html が存在する': 'index.html exists',
  '容量が上限以内': 'Size within limit',
  '外部リソース・通信を使っていない': 'No external resources or network calls',
  '共有ライブラリ以外のファイルを読み込んでいない': 'Loads no files except the shared library shelf',
  'alert/confirm/prompt/window.open を使っていない': 'No alert/confirm/prompt/window.open',
  'Pointer Events でタッチ操作に対応している': 'Touch input via Pointer Events',
  'touch-action を指定している': 'Sets touch-action',
  '日本語/英語で表示が切り替わる': 'Display switches between Japanese and English',
  'Android: 描画されている': 'Android: renders',
  'Android: タッチで開始・操作でき、画面が変化する': 'Android: starts and responds to touch',
  'Android: 画面からはみ出さない': 'Android: no overflow',
  'iPhone: 描画されている': 'iPhone: renders',
  'iPhone: タッチで開始・操作でき、画面が変化する': 'iPhone: starts and responds to touch',
  'iPhone: 画面からはみ出さない': 'iPhone: no overflow',
  'プレイ開始の合図（start）を送っている': 'Sends the play "start" signal',
  '音を鳴らす仕組みがある（BGM・効果音）': 'Has sound (BGM and sound effects)',
  'サイトの音のオン/オフに対応している': "Follows the site's sound on/off",
  'Android: BGMが鳴っている（操作していない間も音が続く）': 'Android: BGM plays (sound continues without input)',
  'JavaScript エラーが出ない': 'No JavaScript errors',
};
const drawn = (i) => (i.canvasVariety ?? 99) > 1 || i.text.length > 0;

// 1端末分の検査: タップで開始 → ランダムなタップ・長押し・スワイプ → 画面の変化を確認
async function deviceCheck(id, device, browser, add, label, checkBgm = false) {
  const s = await openSession(id, { browser, frozen: false, device });
  try {
    const first = await s.inspect();
    add(`${label}: 描画されている`, drawn(first), `canvas色数=${first.canvasVariety ?? '-'}`);
    const before = await s.page.screenshot({ type: 'jpeg', quality: 60 });
    await s.act({ tap: [0.5, 0.5], hold: 80, wait: 300 });
    if (checkBgm) {
      // BGM: 開始してから何も操作しない間も、音が鳴り続けているか（ループ再生か、新しい音が鳴り始めている）
      const t0 = await s.page.evaluate(() => performance.now());
      await s.page.waitForTimeout(2500);
      const au = await s.page.evaluate((t) => ({ idle: (window.__agfAudio?.starts || []).filter((x) => x > t).length, loops: window.__agfAudio?.loops || 0, all: (window.__agfAudio?.starts || []).length }), t0);
      add(`${label}: BGMが鳴っている（操作していない間も音が続く）`, au.loops > 0 || au.idle >= 2, `操作なし2.5秒間に鳴り始めた音=${au.idle} / ループ再生=${au.loops} / 合計=${au.all}`);
    }
    for (let i = 0; i < 8; i++) {
      const x = 0.15 + Math.random() * 0.7, y = 0.3 + Math.random() * 0.6;
      if (i % 3 === 2) await s.act({ swipe: [x, y, 1 - x, y], hold: 180, wait: 80 });
      else await s.act({ tap: [x, y], hold: 100 + ((Math.random() * 300) | 0), wait: 80 });
    }
    const after = await s.page.screenshot({ type: 'jpeg', quality: 60 });
    const info = await s.inspect();
    add(`${label}: タッチで開始・操作でき、画面が変化する`, !before.equals(after) && drawn(info), `canvas色数=${info.canvasVariety ?? '-'}`);
    add(`${label}: 画面からはみ出さない`, !info.overflow);
    return { errors: s.errors.map((e) => `[${label}] ${e}`), signals: s.signals, page: s.page, close: () => s.close() };
  } catch (e) {
    await s.close();
    throw e;
  }
}

export async function validateGame(id) {
  const dir = gameDir(id);
  const htmlPath = path.join(dir, 'index.html');
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  if (!fs.existsSync(htmlPath)) {
    add('index.html が存在する', false);
    return { passed: false, checks, errors: [] };
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const stats = codeStats(html);
  const maxKB = settings().gameMaxKB;
  add('容量が上限以内', stats.bytes <= maxKB * 1024, `${(stats.bytes / 1024).toFixed(1)}KB / ${maxKB}KB`);
  const ext = html.match(/<(script|link|img|iframe|audio|video|source)[^>]+(src|href)=["']https?:\/\/[^"']+/i)
    || html.match(/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/)
    || html.match(/@import\s+url\(\s*['"]?https?:/i);
  add('外部リソース・通信を使っていない', !ext, ext ? ext[0].slice(0, 80) : '');
  // 相対パスで読み込めるのは共有ライブラリ棚（lib/catalog.json に載っているファイル）だけ
  const shelf = new Set((readJson(path.join(ROOT, 'lib', 'catalog.json'), { libraries: [] }).libraries || []).map((l) => l.file));
  const local = [...html.matchAll(/<(?:script|link|img|audio|video|source)[^>]+(?:src|href)=["'](?!https?:|data:|#)([^"']+)/gi)].map((m) => m[1]);
  const offShelf = local.filter((p) => !(p.startsWith('../../lib/') && shelf.has(p.slice('../../lib/'.length))));
  add('共有ライブラリ以外のファイルを読み込んでいない', offShelf.length === 0, offShelf.slice(0, 3).join(', '));
  const banned = html.match(/\b(alert|confirm|prompt)\s*\(|window\.open\s*\(/);
  add('alert/confirm/prompt/window.open を使っていない', !banned, banned ? banned[0] : '');
  add('Pointer Events でタッチ操作に対応している', /pointerdown/i.test(html));
  // 仕様6以降: BGM と効果音が必須。サイトの「音のオン/オフ」の合図（agf: 'sound'）に従う
  const v6 = (readMeta(id)?.specVersion || 0) >= 6;
  if (v6) {
    add('音を鳴らす仕組みがある（BGM・効果音）', /AudioContext|\bzzfx\b|ZZFX/.test(html));
    add('サイトの音のオン/オフに対応している', /['"]sound['"]/.test(html) && /addEventListener\(\s*['"]message['"]|onmessage\s*=/.test(html));
  }
  add('touch-action を指定している', /touch-action\s*:\s*none/i.test(html));

  const errors = [];
  const signals = [];
  const chromium = await launch('chromium');
  const webkit = await launch('webkit');
  try {
    // 日英切り替え: ?lang=ja と ?lang=en でタイトル画面が変わるか
    const shots = {};
    for (const lang of ['ja', 'en']) {
      const l = await openSession(id, { browser: chromium, frozen: true, lang });
      try { shots[lang] = await l.page.screenshot({ type: 'jpeg', quality: 60 }); }
      finally { await l.close(); errors.push(...l.errors.map((e) => `[${lang}] ${e}`)); }
    }
    add('日本語/英語で表示が切り替わる', !shots.ja.equals(shots.en));

    // Android
    const a = await deviceCheck(id, 'android', chromium, add, 'Android', v6);   // 音の確認は Chromium のみ（検査用の WebKit は音を出せない）
    if (!fs.existsSync(path.join(dir, 'thumb.jpg')) && !fs.existsSync(path.join(dir, 'thumb.webp')) || process.argv.includes('--thumb')) {
      await a.page.screenshot({ path: path.join(dir, 'thumb.jpg'), type: 'jpeg', quality: 80, scale: 'css' });
    }
    errors.push(...a.errors); signals.push(...a.signals);
    await a.close();
    // iPhone
    const i = await deviceCheck(id, 'iphone', webkit, add, 'iPhone');
    errors.push(...i.errors); signals.push(...i.signals);
    await i.close();
  } finally {
    await chromium.close();
    await webkit.close();
  }
  add('プレイ開始の合図（start）を送っている', signals.some((s) => s.agf === 'start'));
  const uniq = [...new Set(errors)];
  add('JavaScript エラーが出ない', uniq.length === 0, uniq.slice(0, 3).join(' | '));
  for (const c of checks) c.nameEn = CHECK_EN[c.name] || c.name;

  return { passed: checks.every((c) => c.ok), checks, errors: uniq, code: stats };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const id = args._[0];
  if (!id) { console.error('使い方: node tools/validate.mjs <id> [--thumb]'); process.exit(1); }
  const result = await validateGame(id);
  const meta = readMeta(id);
  meta.generation ||= {};
  meta.generation.validationRuns = (meta.generation.validationRuns || 0) + 1;
  meta.autoTest = { passed: result.passed, testedAt: jstNow().iso, version: 3, checks: result.checks, errors: result.errors };
  if (result.code) meta.code = result.code;
  const htmlFile = path.join(gameDir(id), 'index.html');
  if (fs.existsSync(htmlFile)) meta.libraries = detectLibraries(fs.readFileSync(htmlFile, 'utf8'));   // 使用ライブラリ（作品ページの仕様に表示）
  writeMeta(id, meta);
  for (const c of result.checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  if (result.errors.length) console.log('\nエラー詳細:\n - ' + result.errors.join('\n - '));
  console.log(result.passed ? '\n合格: 自動テストを通過しました' : '\n不合格: 上記を修正して再実行してください');
  process.exit(result.passed ? 0 : 2);
}
