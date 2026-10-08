// 新しく公開された作品を LINE に通知する（デプロイ時に GitHub Actions から実行。Messaging API のプッシュ通知）
//   node tools/notify-line.mjs send <公開前の index.json> <公開後の index.json> <サイトのURL> [--dry]
//        … 新作を LINE に送る。--dry は送らずに送る内容を表示するだけ（動作確認用）
//   node tools/notify-line.mjs test <サイトのURL> [--dry]
//        … 最新の作品を例にしたテスト通知を1通送る（設定の確認用）
// 環境変数 LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID が無い場合は送らない。
// 公開前の一覧が取れなかった場合も、全作品を新作と誤認しないよう送らない。
// リンクには openExternalBrowser=1 を付け、LINE 内ではなく端末の標準ブラウザで開く。
import fs from 'node:fs';
import path from 'node:path';
import { GAMES_DIR, readJson } from './lib.mjs';

const dry = process.argv.includes('--dry');
const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--dry');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN, to = process.env.LINE_USER_ID;

function freshGames(prevFile, nextFile) {
  const prev = readJson(prevFile), next = readJson(nextFile);
  if (!prev?.games || !next?.games) return null;
  const known = new Set(prev.games.map((g) => g.id));
  return next.games.filter((g) => !known.has(g.id));
}

// 1作品ぶんのカード（画像・タイトル・制作AI・あそぶボタン）
function bubble(g, base, test) {
  const link = `${base}game.html?id=${encodeURIComponent(g.id)}&openExternalBrowser=1`;
  const jpg = path.join(GAMES_DIR, g.id, 'line-thumb.jpg');
  const b = {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: test ? 'テスト通知（表示の確認用）' : '新しいゲームが公開されました', size: 'xs', color: '#888888' },
        { type: 'text', text: `「${g.title}」`, weight: 'bold', size: 'lg', wrap: true },
        { type: 'text', text: `制作: ${g.ai?.name || '不明'}`, size: 'xs', color: '#888888', wrap: true },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical',
      contents: [{ type: 'button', style: 'primary', color: '#222222', height: 'sm', action: { type: 'uri', label: 'あそぶ', uri: link } }],
    },
  };
  // 画像はデプロイ時に作った JPEG（tools/line-thumbs.mjs）。無ければ画像なしで送る
  if (fs.existsSync(jpg)) b.hero = { type: 'image', url: `${base}games/${encodeURIComponent(g.id)}/line-thumb.jpg`, size: 'full', aspectRatio: '9:16', aspectMode: 'cover', action: { type: 'uri', label: 'あそぶ', uri: link } };
  return b;
}

async function push(games, base, test = false) {
  const list = games.slice(0, 12);   // カルーセルは最大12枚
  const altText = (list.length === 1
    ? `${test ? '【テスト】' : ''}新しいゲーム「${list[0].title}」が公開されました`
    : `新しいゲームが ${list.length} 本公開されました：${list.map((g) => `「${g.title}」`).join('')}`).slice(0, 400);
  const contents = list.length === 1 ? bubble(list[0], base, test) : { type: 'carousel', contents: list.map((g) => bubble(g, base, test)) };
  const message = { type: 'flex', altText, contents };
  if (dry) { console.log(JSON.stringify(message, null, 2)); return; }
  if (!token || !to) { console.log('LINE の設定（Secrets）が無いため通知しません'); return; }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [message] }),
  });
  // 通知の失敗でデプロイを失敗扱いにはしない
  if (!res.ok) console.log(`::warning::LINE 通知に失敗しました (${res.status}) ${await res.text()}`);
  else console.log(`LINE に通知しました: ${list.map((g) => g.id).join(', ')}`);
}

const siteBase = (u = 'https://mojon1.github.io/ai-game-factory/') => (u.endsWith('/') ? u : u + '/');

if (cmd === 'send') {
  const fresh = freshGames(args[0], args[1]);
  if (!fresh) console.log('公開前／公開後の一覧が読めないため通知しません');
  else if (!fresh.length) console.log('新作はありません');
  else await push(fresh, siteBase(args[2]));
} else if (cmd === 'test') {
  const idx = readJson(path.join(GAMES_DIR, 'index.json'));
  if (!idx?.games?.length) console.log('作品がありません');
  else await push([idx.games[0]], siteBase(args[0]), true);
} else {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(1);
}
