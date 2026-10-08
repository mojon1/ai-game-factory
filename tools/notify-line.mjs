// 新しく公開された作品を LINE に通知する（デプロイ時に GitHub Actions から実行）
//   node tools/notify-line.mjs <公開前の index.json> <公開後の index.json> <サイトのURL> [--dry]
// --dry … 送らずに、送る内容を表示するだけ（動作確認用）
// 環境変数 LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID が無い場合は何もしない（Messaging API のプッシュ通知）。
// 公開前の一覧が取れなかった場合も、全作品を新作と誤認しないよう通知しない。
import { readJson } from './lib.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--dry');
const dry = process.argv.includes('--dry');
const [prevFile, nextFile, siteUrl = 'https://mojon1.github.io/ai-game-factory/'] = args;
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN, to = process.env.LINE_USER_ID;
if (!dry && (!token || !to)) { console.log('LINE の設定（Secrets）が無いため通知しません'); process.exit(0); }

const prev = readJson(prevFile);
const next = readJson(nextFile);
if (!prev?.games || !next?.games) { console.log('公開前／公開後の一覧が読めないため通知しません'); process.exit(0); }

const known = new Set(prev.games.map((g) => g.id));
const fresh = next.games.filter((g) => !known.has(g.id));
if (!fresh.length) { console.log('新作はありません'); process.exit(0); }

const base = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';
const lines = [`🎮 AI GAME FACTORY に新作が${fresh.length > 1 ? ` ${fresh.length} 本` : ''}公開されました`];
for (const g of fresh) {
  lines.push('', `「${g.title}」`, `制作: ${g.ai?.name || '不明'}`, `${base}game.html?id=${encodeURIComponent(g.id)}`);
}
const text = lines.join('\n').slice(0, 4900);   // 1メッセージの上限は5000文字
if (dry) { console.log(text); process.exit(0); }

const res = await fetch('https://api.line.me/v2/bot/message/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
});
if (!res.ok) {
  // 通知の失敗でデプロイを失敗扱いにはしない
  console.log(`::warning::LINE 通知に失敗しました (${res.status}) ${await res.text()}`);
} else {
  console.log(`LINE に通知しました: ${fresh.map((g) => g.id).join(', ')}`);
}
