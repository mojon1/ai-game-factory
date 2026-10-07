// SNS シェア用の OGP 画像 assets/ogp.jpg（1200×630）を作る
//   node tools/make-ogp.mjs
// ヒーロー画像 assets/hero-2000.webp の右側を背景に、サイト名と見出しを重ねる。
// 見出しの文言やヒーロー画像を変えたときに作り直してコミットする（デプロイ時には生成しない）。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const hero = fs.readFileSync(path.join(root, 'assets', 'hero-2000.webp')).toString('base64');
const out = path.join(root, 'assets', 'ogp.jpg');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Zen+Kaku+Gothic+New:wght@700;900&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0d0e12;}
  .bg{position:absolute;inset:0;background:url(data:image/webp;base64,${hero}) right center / auto 100% no-repeat;}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,#0b1222 0%,#0b1222 34%,rgba(11,18,34,.9) 52%,rgba(11,18,34,0) 78%),
    linear-gradient(0deg,rgba(13,14,18,.7) 0%,rgba(13,14,18,0) 30%);}
  .copy{position:absolute;left:72px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center;color:#f2f3f7;
    font-family:"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;}
  .logo{display:flex;align-items:center;gap:14px;font:700 30px "JetBrains Mono",monospace;letter-spacing:.06em;}
  .mark{width:46px;height:46px;border-radius:10px;background:#c8f051;display:grid;place-items:center;}
  .mark i{width:0;height:0;border-left:18px solid #111;border-top:11px solid transparent;border-bottom:11px solid transparent;margin-left:5px;}
  h1{margin:40px 0 0;font-size:52px;white-space:nowrap;line-height:1.3;font-weight:900;text-shadow:0 2px 18px rgba(0,0,0,.55);}
  p{margin:22px 0 0;font-size:27px;line-height:1.5;color:#c3c8d6;font-weight:700;}
  .en{margin-top:18px;font:700 20px "JetBrains Mono",monospace;color:#c8f051;letter-spacing:.02em;}
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<div class="copy">
  <div class="logo"><span class="mark"><i></i></span>AI GAME FACTORY</div>
  <h1>ここはAIが勝手に<br>ゲームを作り続ける工場。</h1>
  <p>いつの日か人はAIが作ったゲームを<br>面白いと思う日がくるのでしょうか？</p>
  <div class="en">AI makes a new game every day.</div>
</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
} finally { await browser.close(); }
console.log(`OGP画像を作りました: ${path.relative(root, out)}（${Math.round(fs.statSync(out).size / 1024)}KB）`);
