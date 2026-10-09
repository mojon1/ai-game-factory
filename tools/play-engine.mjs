// AIプレイ用エンジン（スマホ専用）
// ゲームの時計（requestAnimationFrame / setTimeout / performance.now）を止めた状態で
// 「画面を見る → 操作を決める → 指定ミリ秒だけ時間を進める」をターン制で繰り返せるようにする。
// 乱数もシード固定なので、同じ操作列を与えれば同じ画面が再現できる（＝CLIからの1手ずつプレイが可能）。
//
// device: 'android' … Chromium（Android の Chrome 相当）360×640・タッチ
//         'iphone'  … WebKit（iPhone の Safari 相当）375×667・タッチ
import { gameUrl, SANDBOX_INIT, SEEDED_RANDOM_INIT } from './lib.mjs';

const T0 = new Date('2030-01-01T00:00:00Z');
export const DEVICES = {
  android: { engine: 'chromium', context: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' } },
  iphone: { engine: 'webkit', context: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } },
};

// ブラウザ起動（Chromium は同梱 → Edge → Chrome の順に試す）
const browsers = {};
export async function launch(engine = 'chromium') {
  const pw = await import('playwright');
  if (engine === 'webkit') return pw.webkit.launch({ headless: true });
  let lastErr;
  for (const opt of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await pw.chromium.launch({ headless: true, ...opt }); } catch (e) { lastErr = e; }
  }
  throw new Error('ブラウザを起動できません。`npm run setup` を実行してください。\n' + lastErr?.message);
}

export async function openSession(id, { seed = 20261007, browser = null, frozen = true, device = 'android', lang = 'ja' } = {}) {
  const dev = DEVICES[device] || DEVICES.android;
  const ownBrowser = !browser;
  browser ||= await launch(dev.engine);
  const viewport = dev.context.viewport;
  const context = await browser.newContext(dev.context);
  const page = await context.newPage();
  const errors = [];
  const signals = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(('console.error: ' + m.text()).slice(0, 300));
    if (m.text().startsWith('__agf__')) signals.push(JSON.parse(m.text().slice(7)));
  });
  await page.addInitScript(SANDBOX_INIT);
  await page.addInitScript(SEEDED_RANDOM_INIT(seed));
  // ゲームが parent.postMessage で送る合図（start / end）を記録する
  await page.addInitScript(`addEventListener('message', (e) => { if (e.data && e.data.agf) console.log('__agf__' + JSON.stringify(e.data)); });`);
  // 保存（仕様の「保存」）: サイトの代わりに、このセッションの間だけ覚えておき、load に loaded で答える
  await page.addInitScript(`(() => {
    let saved = null;
    addEventListener('message', (e) => {
      const d = e.data; if (!d || typeof d !== 'object') return;
      if (d.agf === 'load') postMessage({ agf: 'loaded', data: saved }, '*');
      if (d.agf === 'save') { try { const t = JSON.stringify(d.data); if (t.length <= 16384) saved = JSON.parse(t); } catch (err) {} }
    });
  })();`);
  const cdp = dev.engine === 'chromium' ? await context.newCDPSession(page) : null;

  let isFrozen = false;
  if (frozen) {
    try { await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0); isFrozen = true; } catch { isFrozen = false; }
  }
  await page.goto(gameUrl(id, lang), { waitUntil: 'load' });

  const advance = async (ms) => {
    ms = Math.max(0, Math.min(10000, Math.round(ms)));
    if (!ms) return;
    if (!isFrozen) return page.waitForTimeout(ms);
    // 時間停止中はゲーム内の例外が runFor から投げられるので、記録して続行する
    try { await page.clock.runFor(ms); } catch (e) {
      errors.push(String(e?.message || e).split('\n')[0].replace(/^clock\.runFor: /, '').slice(0, 300));
    }
  };
  await advance(600);

  const px = (p) => [Math.max(0, Math.min(1, +p[0] || 0)) * viewport.width, Math.max(0, Math.min(1, +p[1] || 0)) * viewport.height];
  // タッチ: Chromium は本物のタッチイベント（CDP）、WebKit は Pointer Events を合成して送る
  // pts: [[x, y], ...]（指ごとの位置。指の番号 = 配列の順番）
  const synth = (type, pts) => page.evaluate(({ type, pts }) => {
    pts.forEach(([x, y], i) => {
      const el = document.elementFromPoint(x, y) || document.body;
      const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: i + 1, pointerType: 'touch', isPrimary: i === 0, buttons: type === 'pointerup' ? 0 : 1 };
      el.dispatchEvent(new PointerEvent(type, init));
      if (i > 0) return;   // マウスの互換イベントは1本目の指だけ
      const mouse = { pointerdown: 'mousedown', pointermove: 'mousemove', pointerup: 'mouseup' }[type];
      el.dispatchEvent(new MouseEvent(mouse, init));
      if (type === 'pointerup') el.dispatchEvent(new MouseEvent('click', init));
    });
  }, { type, pts });
  const tp = (pts) => pts.map(([x, y], i) => ({ x, y, id: i + 1 }));
  const touch = {
    down: (pts) => (cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts) }) : synth('pointerdown', pts)),
    move: (pts) => (cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(pts) }) : synth('pointermove', pts)),
    up: (pts) => (cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) : synth('pointerup', pts)),
  };
  // 折れ線の上を、全体の長さに対する割合 t（0〜1）で進んだ位置
  const along = (path, t) => {
    if (path.length === 1) return path[0];
    const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
    let d = t * seg.reduce((a, b) => a + b, 0);
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) { const r = seg[i] ? Math.min(1, d / seg[i]) : 1; return [path[i][0] + (path[i + 1][0] - path[i][0]) * r, path[i][1] + (path[i + 1][1] - path[i][1]) * r]; }
      d -= seg[i];
    }
    return path[path.length - 1];
  };
  // 1本以上の指を、それぞれの道筋に沿って同時に動かす（hold ミリ秒かけて、最初から最後まで）
  const stroke = async (paths, hold) => {
    const n = Math.max(6, Math.min(40, Math.round(hold / 30)));
    await touch.down(paths.map((p) => p[0]));
    for (let i = 1; i <= n; i++) { await advance(hold / n); await touch.move(paths.map((p) => along(p, i / n))); }
    await touch.up(paths.map((p) => p[p.length - 1]));
  };

  // 1手（または手の配列）を実行
  const act = async (action) => {
    const list = Array.isArray(action) ? action : [action];
    for (const a of list) {
      if (!a || typeof a !== 'object') continue;
      const pts = (arr) => (Array.isArray(arr) ? arr.filter((p) => Array.isArray(p) && p.length >= 2).slice(0, 60).map(px) : []);
      const tap = Array.isArray(a.tap) ? px(a.tap) : null;
      const swipe = Array.isArray(a.swipe) && a.swipe.length >= 4 ? [px(a.swipe.slice(0, 2)), px(a.swipe.slice(2, 4))] : null;
      const path = pts(a.path);
      const multi = Array.isArray(a.multi) ? a.multi.slice(0, 3).map(pts).filter((p) => p.length) : [];
      const hold = a.hold ?? (path.length || multi.length ? 400 : 120);
      const wait = a.wait ?? 150;
      if (multi.length) await stroke(multi, hold);          // 複数の指（それぞれ道筋。1点なら押したまま）
      else if (path.length) await stroke([path], hold);     // 1本の指で道筋をなぞる
      else if (swipe) await stroke([swipe], hold);
      else if (tap) { await touch.down([tap]); await advance(hold); await touch.up([tap]); }
      else { await advance(a.wait ?? a.hold ?? 300); continue; }
      await advance(wait);
    }
  };

  const screenshot = (file, quality = 70) =>
    page.screenshot({ path: file, type: 'jpeg', quality, timeout: 15000, scale: 'css' });

  // 画面の簡易情報（DOMテキスト・キャンバスに何か描かれているか）
  const inspect = () => page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const canvases = [...document.querySelectorAll('canvas')];
    let canvasVariety = null;
    const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (c && c.width && c.height) {
      try {
        // 縮小すると細い文字や小さな図形が消えるので、実寸の画素を間引きながら色の種類を数える
        const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
        const g = tmp.getContext('2d'); g.drawImage(c, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set();
        const step = Math.max(1, Math.floor(Math.sqrt((c.width * c.height) / 40000)));
        for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) {
          const i = (y * c.width + x) * 4;
          set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
        }
        canvasVariety = set.size;
      } catch { canvasVariety = -1; }
    }
    const overflow = document.documentElement.scrollWidth > innerWidth + 2 || document.documentElement.scrollHeight > innerHeight + 2;
    return { title: document.title, text, canvases: canvases.length, canvasVariety, overflow };
  });

  const close = async () => { await context.close(); if (ownBrowser) await browser.close(); };
  return { page, errors, signals, act, advance, screenshot, inspect, close, frozen: isFrozen, device, viewport };
}

export function describeAction(a) {
  const list = Array.isArray(a) ? a : [a];
  const f = (v) => (+v).toFixed(2);
  return list.map((x) => {
    if (!x) return '';
    if (x.tap) return `tap(${f(x.tap[0])},${f(x.tap[1])}) ${x.hold ?? 120}ms`;
    if (x.swipe) return `swipe(${f(x.swipe[0])},${f(x.swipe[1])}→${f(x.swipe[2])},${f(x.swipe[3])}) ${x.hold ?? 120}ms`;
    const line = (p) => p.map((q) => `${f(q[0])},${f(q[1])}`).join('→');
    if (Array.isArray(x.path)) return `path(${line(x.path)}) ${x.hold ?? 400}ms`;
    if (Array.isArray(x.multi)) return `multi(${x.multi.map((p) => line(p)).join(' | ')}) ${x.hold ?? 400}ms`;
    return `wait ${x.wait ?? x.hold ?? 300}ms`;
  }).join(' → ');
}
