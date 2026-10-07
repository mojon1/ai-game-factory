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
  const synth = (type, x, y) => page.evaluate(({ type, x, y }) => {
    const el = document.elementFromPoint(x, y) || document.body;
    const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1 };
    el.dispatchEvent(new PointerEvent(type, init));
    const mouse = { pointerdown: 'mousedown', pointermove: 'mousemove', pointerup: 'mouseup' }[type];
    el.dispatchEvent(new MouseEvent(mouse, init));
    if (type === 'pointerup') el.dispatchEvent(new MouseEvent('click', init));
  }, { type, x, y });
  const touch = {
    down: (x, y) => (cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }) : synth('pointerdown', x, y)),
    move: (x, y) => (cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }) : synth('pointermove', x, y)),
    up: (x, y) => (cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) : synth('pointerup', x, y)),
  };

  // 1手（または手の配列）を実行
  const act = async (action) => {
    const list = Array.isArray(action) ? action : [action];
    for (const a of list) {
      if (!a || typeof a !== 'object') continue;
      const tap = Array.isArray(a.tap) ? px(a.tap) : null;
      const swipe = Array.isArray(a.swipe) && a.swipe.length >= 4 ? [...px(a.swipe.slice(0, 2)), ...px(a.swipe.slice(2, 4))] : null;
      if (!tap && !swipe) { await advance(a.wait ?? a.hold ?? 300); continue; }
      const hold = a.hold ?? 120;
      const wait = a.wait ?? 150;
      if (swipe) {
        const [x1, y1, x2, y2] = swipe, n = 6;
        await touch.down(x1, y1);
        for (let i = 1; i <= n; i++) { await advance(hold / n); await touch.move(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n); }
        await touch.up(x2, y2);
      } else {
        await touch.down(...tap);
        await advance(hold);
        await touch.up(...tap);
      }
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
    return `wait ${x.wait ?? x.hold ?? 300}ms`;
  }).join(' → ');
}
