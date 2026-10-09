// AIの自己判定を記録し、画像を圧縮してゲームを公開状態にする
//   node tools/review.mjs <id> --stars 1-5 --works ok|buggy|broken \
//        --comment "感想" --comment-en "English" \
//        --similar '<類似作品JSON>' --research "どう調べたか" --research-en "English" \
//        --thumb <サムネに使うステップ番号>
//
// stars（人間の評価と同じ星5段階）: 1=つまらない / 2=いまいち / 3=ふつう / 4=面白い / 5=とても面白い
// works  : ok=問題なく動いた / buggy=不具合はあるが遊べた / broken=遊べなかった
// 類似作品JSON: [{"title":"作品名","url":"https://…（確認できた場合のみ）","similarity":"高|中|低","note":"似ている点と違う点","note_en":"English"}]
//   本当に見つからなかった場合は '[]' とし、--research に調べた内容を書く。
// 公開には meta.json の title / genre / concept / howToPlay と、その英語版（i18n.en）が必要。
// 実行すると、プレイ画像は数枚だけ WebP に縮小して残し、残りは削除する（操作ログ session.json は残る）。
import fs from 'node:fs';
import path from 'node:path';
import { gameDir, readMeta, writeMeta, readJson, parseArgs, jstNow, settings, toWebp, dirSize, checkStructure, checkPlanning } from './lib.mjs';

const a = parseArgs();
const id = a._[0];
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!id) fail('使い方は tools/review.mjs の先頭コメントを参照');
const meta = readMeta(id);
const conf = settings();
const dir = gameDir(id);

const pick = (k, allowed) => { if (!allowed.includes(a[k])) fail(`--${k} は ${allowed.join(' / ')} のいずれか`); return a[k]; };
if (a.verdict && a.stars == null) fail('評価は星5段階になりました。--verdict ではなく --stars 1〜5 で指定してください（1=つまらない / 2=いまいち / 3=ふつう / 4=面白い / 5=とても面白い）');
const stars = Number(a.stars);
if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail('--stars は 1〜5 の整数（1=つまらない / 2=いまいち / 3=ふつう / 4=面白い / 5=とても面白い）');
const works = pick('works', ['ok', 'buggy', 'broken']);
const str = (k, min = 0) => { const v = a[k]; if (typeof v !== 'string' || v.length < min) fail(`--${k} を指定してください${min ? `（${min}文字以上）` : ''}`); return v; };
const comment = str('comment', 10), commentEn = str('comment-en', 10);

// 類似作品リサーチ（必須）
let similar;
try { similar = JSON.parse(str('similar')); } catch { fail('--similar のJSONが不正です'); }
if (!Array.isArray(similar)) fail('--similar は配列で指定してください');
similar = similar.slice(0, 5).map((s) => {
  const level = { high: '高', medium: '中', low: '低' }[s.similarity] || s.similarity;
  if (!['高', '中', '低'].includes(level)) fail(`similarity は 高/中/低 のいずれか: ${JSON.stringify(s)}`);
  const url = typeof s.url === 'string' && /^https?:\/\//.test(s.url) ? s.url : undefined;
  return { title: String(s.title || '').slice(0, 80), url, similarity: level, note: String(s.note || '').slice(0, 200), note_en: s.note_en ? String(s.note_en).slice(0, 300) : undefined };
});
const research = typeof a.research === 'string' ? a.research : '';
if (!similar.length && research.length < 10) fail('類似作品が0件の場合は --research に調べた内容を書いてください');

// ---------- プレイ画像の間引き・圧縮 ----------
const playDir = path.join(dir, 'ai-play');
const session = readJson(path.join(playDir, 'session.json'));
const steps = session?.steps || [];
const n = steps.length;
const thumbStep = a.thumb !== undefined ? Number(a.thumb) : n;
const keep = new Set([n, thumbStep].filter(Boolean));
for (let i = 1; keep.size < Math.min(conf.keepPlayImages, n) && i <= conf.keepPlayImages; i++) keep.add(Math.max(1, Math.round((i * n) / conf.keepPlayImages)));
const imgPath = (k, ext) => path.join(playDir, `step-${String(k).padStart(2, '0')}.${ext}`);
const existing = (k) => ['jpg', 'webp'].map((e) => imgPath(k, e)).find((p) => fs.existsSync(p));

const conversions = [];
const playLog = steps.map((st) => {
  let image;
  const src = existing(st.step);
  if (keep.has(st.step) && src) {
    image = `ai-play/step-${String(st.step).padStart(2, '0')}.webp`;
    if (!src.endsWith('.webp')) conversions.push({ src, dest: path.join(dir, image), ...conf.playImage });
  }
  return { step: st.step, action: st.desc, note: st.note, noteEn: st.noteEn || undefined, image, signals: st.signals?.length ? st.signals : undefined };
});
const thumbFrom = existing(thumbStep) || ['thumb.jpg', 'thumb.webp'].map((f) => path.join(dir, f)).find((p) => fs.existsSync(p));
if (thumbFrom) conversions.push({ src: thumbFrom, dest: path.join(dir, 'thumb.webp.tmp'), ...conf.thumb });
await toWebp(conversions);
if (thumbFrom) fs.renameSync(path.join(dir, 'thumb.webp.tmp'), path.join(dir, 'thumb.webp'));
fs.rmSync(path.join(dir, 'thumb.jpg'), { force: true });
if (fs.existsSync(playDir)) {
  const kept = new Set(playLog.filter((p) => p.image).map((p) => path.basename(p.image)));
  for (const f of fs.readdirSync(playDir)) if (/\.(jpg|webp)$/.test(f) && !kept.has(f)) fs.rmSync(path.join(playDir, f));
}

const main = meta.credits?.find((c) => c.role === 'main') || {};
meta.aiReview = {
  reviewer: { name: main.name, vendor: main.vendor, model: main.model },
  stars, works, comment, similar, research: research || undefined,
  i18n: { en: { comment: commentEn, research: typeof a['research-en'] === 'string' ? a['research-en'] : undefined } },
  method: n ? `スマホ縦画面で ${n} 手プレイ（時間を止めて1手ずつ操作）` : 'プレイなし',
  methodEn: n ? `Played ${n} moves on a portrait phone screen (time frozen between moves)` : 'Not played',
  playLog,
  reviewedAt: jstNow().iso,
};

const en = meta.i18n?.en || {};
// 仕様4以降は、ライブラリを使う／使わない判断の理由（libraryDecision）も必須
// 仕様6以降は、音の判断の理由（soundDecision）も必須
const keys = ['title', 'concept', 'howToPlay', ...((meta.specVersion || 0) >= 4 ? ['libraryDecision'] : []), ...((meta.specVersion || 0) >= 6 ? ['soundDecision'] : [])];
const missing = [
  ...['genre', ...keys].filter((k) => !meta[k]),
  ...keys.filter((k) => !en[k]).map((k) => `i18n.en.${k}`),
  // 仕様5以降は、作品の構造（structure）も必須
  ...((meta.specVersion || 0) >= 5 ? checkStructure(meta.structure) : []),
  // 仕様7以降は、企画の候補3つ（うち1つはくじのジャンル）と、選んだ候補も必須
  ...((meta.specVersion || 0) >= 7 ? checkPlanning(meta.planning, meta.genre) : []),
];
if (missing.length) console.warn(`⚠ meta.json の未記入項目: ${missing.join(', ')}（埋めてから再実行すると公開されます）`);
if (!meta.autoTest?.passed) console.warn('⚠ 自動テストに合格していません（node tools/validate.mjs で確認）');
if (!fs.existsSync(path.join(dir, 'thumb.webp'))) console.warn('⚠ サムネイルがありません');
if (!n) console.warn('⚠ 自己プレイがありません（node tools/play.mjs init <id>）');

if (!missing.length && meta.autoTest?.passed) {
  meta.status = 'published';
  meta.publishedAt ||= jstNow().iso;
}
meta.generation ||= {};
meta.generation.finishedAt = jstNow().iso;
writeMeta(id, meta);
const kb = dirSize(dir) / 1024;
console.log(`自己判定を記録しました: ${id}  状態=${meta.status}  判定=★${stars}  容量=${kb.toFixed(0)}KB`);
if (kb > conf.gameBudgetKB) console.warn(`⚠ 作品フォルダの容量が目安（${conf.gameBudgetKB}KB）を超えています`);
