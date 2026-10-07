// AIプレイ用エンジン
// ゲームの時計（requestAnimationFrame / setTimeout / performance.now）を止めた状態で
// 「画面を見る → 操作を決める → 指定ミリ秒だけ時間を進める」をターン制で繰り返せるようにする。
// 乱数もシード固定なので、同じ操作列を与えれば同じ画面が再現できる（＝CLIからの1手ずつプレイが可能）。
//
// device: 'pc'     … 640×400、キーボード＋マウス
//         'mobile' … 360×640 縦画面、タッチのみ（キー入力は無効）
import { gameUrl, launchBrowser, SANDBOX_INIT, SEEDED_RANDOM_INIT } from './lib.mjs';

const T0 = new Date('2030-01-01T00:00:00Z');
export const DEVICES = {
  pc: { viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
};

export async function openSession(id, { seed = 20261007, browser = null, frozen = true, device = 'pc', lang = 'ja' } = {}) {
  const ownBrowser = !browser;
  browser ||= await launchBrowser();
  const dev = DEVICES[device] || DEVICES.pc;
  const viewport = dev.viewport;
  const mobile = device === 'mobile';
  const context = await browser.newContext(dev);
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(('console.error: ' + m.text()).slice(0, 300)); });
  await page.addInitScript(SANDBOX_INIT);
  await page.addInitScript(SEEDED_RANDOM_INIT(seed));
  const cdp = mobile ? await context.newCDPSession(page) : null;

  let isFrozen = false;
  if (frozen) {
    try {
      await page.clock.install({ time: T0 });
      await page.clock.pauseAt(T0);
      isFrozen = true;
    } catch { isFrozen = false; }
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
  // ポインタ（PC=マウス / スマホ=タッチ）
  const pointer = {
    async down(x, y) {
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      else { await page.mouse.move(x, y); await page.mouse.down(); }
    },
    async move(x, y) {
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      else await page.mouse.move(x, y);
    },
    async up() {
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
    },
  };

  // 1手（または手の配列）を実行
  const act = async (action) => {
    const list = Array.isArray(action) ? action : [action];
    for (const a of list) {
      if (!a || typeof a !== 'object') continue;
      let keys = [].concat(a.keys || a.key || []).map(String).slice(0, 4);
      if (mobile && keys.length) { warnings.push('スマホモードではキー入力は無効です'); keys = []; }
      const tap = Array.isArray(a.tap) ? px(a.tap) : null;
      const swipe = Array.isArray(a.swipe) && a.swipe.length >= 4 ? [...px(a.swipe.slice(0, 2)), ...px(a.swipe.slice(2, 4))] : null;
      if (!keys.length && !tap && !swipe) { await advance(a.wait ?? a.hold ?? 300); continue; }
      const hold = a.hold ?? 250;
      const wait = a.wait ?? 150;
      for (const k of keys) await page.keyboard.down(k);
      if (swipe) {
        const [x1, y1, x2, y2] = swipe, n = 6;
        await pointer.down(x1, y1);
        for (let i = 1; i <= n; i++) { await advance(hold / n); await pointer.move(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n); }
        await pointer.up();
      } else {
        if (tap) await pointer.down(...tap);
        await advance(hold);
        if (tap) await pointer.up();
      }
      for (const k of keys.reverse()) await page.keyboard.up(k);
      await advance(wait);
    }
  };

  const screenshot = (file, quality = 70) =>
    page.screenshot({ path: file, type: 'jpeg', quality, timeout: 15000 });

  // 画面の簡易情報（DOMテキスト・キャンバスが真っ白/真っ黒でないか）
  const inspect = () => page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const canvases = [...document.querySelectorAll('canvas')];
    let canvasVariety = null;
    const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (c) {
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
    return { title: document.title, text, canvases: canvases.length, canvasVariety };
  });

  const close = async () => { await context.close(); if (ownBrowser) await browser.close(); };
  return { page, errors, warnings, act, advance, screenshot, inspect, close, frozen: isFrozen, device, viewport };
}

export function describeAction(a) {
  const list = Array.isArray(a) ? a : [a];
  const f = (v) => (+v).toFixed(2);
  return list.map((x) => {
    if (!x) return '';
    const keys = [].concat(x.keys || x.key || []);
    const parts = [];
    if (keys.length) parts.push(keys.join('+'));
    if (x.tap) parts.push(`tap(${f(x.tap[0])},${f(x.tap[1])})`);
    if (x.swipe) parts.push(`swipe(${f(x.swipe[0])},${f(x.swipe[1])}→${f(x.swipe[2])},${f(x.swipe[3])})`);
    if (parts.length) parts.push(`${x.hold ?? 250}ms`);
    else parts.push(`wait ${x.wait ?? x.hold ?? 300}ms`);
    return parts.join(' ');
  }).join(' → ');
}
