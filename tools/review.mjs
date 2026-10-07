// AIの自己採点を記録し、画像を圧縮してゲームを公開状態にする
//   node tools/review.mjs <id> --playable-pc 0-2 --playable-mobile 0-2 --fun 1-5 --quality 1-5 --originality 1-5 \
//        --comment "総評" --good "良かった点" --bad "気になった点" --thumb <PCのステップ番号 | m<スマホのステップ番号>> \
//        --similar '<類似作品JSON>' --research "どう調べたか" \
//        --comment-en "English review" --good-en "…" --bad-en "…" --research-en "…" \
//        [--reviewer-model <ID> --reviewer-name <表示名> --reviewer-vendor <社名>]
//
// 採点基準（人間の評価フォームと同じ）
//   playable    : 2=問題なく遊べた / 1=不具合はあるが遊べた / 0=遊べなかった（PC・スマホそれぞれ）
//   fun         : 楽しさ        1〜5（3 = 無料のブラウザミニゲームとして平均的）
//   quality     : クオリティ    1〜5（見た目・操作感・完成度）
//   originality : 独創性        1〜5（類似作品リサーチの結果を踏まえて付ける）
// 類似作品JSON: [{"title":"作品名","url":"https://…（分かれば）","similarity":"高|中|低","note":"似ている点と違う点","note_en":"English"}]
// 公開には英語版（meta.json の i18n.en と --comment-en）も必須。
//   本当に見つからなかった場合は '[]' とし、--research に調べた内容を書く。
// レビュワーを省略すると、メイン制作AI（自己採点）になる。
// 実行すると、プレイ画像は設定枚数だけ WebP に縮小して残し、残りは削除する（操作ログ session.json は残るので再現可能）。
import fs from 'node:fs';
import path from 'node:path';
import { gameDir, readMeta, writeMeta, readJson, parseArgs, jstNow, settings, toWebp, dirSize } from './lib.mjs';

const a = parseArgs();
const id = a._[0];
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!id) fail('使い方は tools/review.mjs の先頭コメントを参照');
const meta = readMeta(id);
const conf = settings();
const dir = gameDir(id);

const num = (k, lo, hi, fallbackKey) => {
  const raw = a[k] ?? (fallbackKey ? a[fallbackKey] : undefined);
  const v = Number(raw);
  if (!Number.isInteger(v) || v < lo || v > hi) fail(`--${k} は ${lo}〜${hi} の整数で指定してください`);
  return v;
};
const playablePc = num('playable-pc', 0, 2, 'playable');
const playableMobile = num('playable-mobile', 0, 2, 'playable');
const scores = { playable: Math.min(playablePc, playableMobile), fun: num('fun', 1, 5), quality: num('quality', 1, 5), originality: num('originality', 1, 5) };
if (typeof a.comment !== 'string' || a.comment.length < 10) fail('--comment に10文字以上の総評を書いてください');

// 類似作品リサーチ（必須）
if (typeof a.similar !== 'string') fail('--similar に類似作品リサーチの結果（JSON配列）を指定してください。見つからなければ \'[]\' と --research');
let similar;
try { similar = JSON.parse(a.similar); } catch { fail('--similar のJSONが不正です'); }
if (!Array.isArray(similar)) fail('--similar は配列で指定してください');
similar = similar.slice(0, 6).map((s) => {
  const level = { high: '高', medium: '中', low: '低' }[s.similarity] || s.similarity;
  if (!['高', '中', '低'].includes(level)) fail(`similarity は 高/中/低 のいずれか: ${JSON.stringify(s)}`);
  const url = typeof s.url === 'string' && /^https?:\/\//.test(s.url) ? s.url : undefined;
  return { title: String(s.title || '').slice(0, 80), url, similarity: level, note: String(s.note || '').slice(0, 200), note_en: s.note_en ? String(s.note_en).slice(0, 300) : undefined };
});
if (!similar.length && (typeof a.research !== 'string' || a.research.length < 10)) fail('類似作品が0件の場合は --research に調べた内容を書いてください');

const main = meta.credits?.find((c) => c.role === 'main') || {};
const reviewer = {
  name: a['reviewer-name'] || main.name,
  vendor: a['reviewer-vendor'] || main.vendor,
  model: a['reviewer-model'] || main.model,
};

// ---------- プレイログと画像の整理 ----------
const sessions = [['pc', 'ai-play'], ['mobile', 'ai-play-mobile']]
  .map(([device, d]) => ({ device, d, s: readJson(path.join(dir, d, 'session.json')) }))
  .filter((x) => x.s?.steps?.length);

// サムネ: "5" → PCのstep5 / "m2" → スマホのstep2
const thumbSpec = a.thumb === undefined ? null : String(a.thumb);
const thumbDevice = thumbSpec?.startsWith('m') ? 'mobile' : 'pc';
const thumbStep = thumbSpec ? Number(thumbSpec.replace(/^m/, '')) : null;
const imgPath = (d, n, ext) => path.join(dir, d, `step-${String(n).padStart(2, '0')}.${ext}`);
const existing = (d, n) => ['jpg', 'webp'].map((e) => imgPath(d, n, e)).find((p) => fs.existsSync(p));

const conversions = [];
const playLog = [];
for (const { device, d, s } of sessions) {
  const n = s.steps.length;
  const keepN = conf.keepPlayImages[device] ?? 4;
  const keep = new Set([n]);
  if (device === thumbDevice && thumbStep) keep.add(thumbStep);
  for (let i = 1; keep.size < Math.min(keepN, n) && i <= keepN; i++) keep.add(Math.max(1, Math.round((i * n) / keepN)));
  for (let i = 1; keep.size < Math.min(keepN, n) && i <= n; i++) keep.add(i);
  for (const st of s.steps) {
    let image;
    const src = existing(d, st.step);
    if (keep.has(st.step) && src) {
      image = `${d}/step-${String(st.step).padStart(2, '0')}.webp`;
      if (!src.endsWith('.webp')) conversions.push({ src, dest: path.join(dir, image), ...conf.playImage });
    }
    playLog.push({ device, step: st.step, action: st.desc, note: st.note, noteEn: st.noteEn || undefined, image, errors: st.errors?.length ? st.errors : undefined });
  }
}

// サムネイル
const thumbSrc = thumbStep ? existing(thumbDevice === 'mobile' ? 'ai-play-mobile' : 'ai-play', thumbStep) : null;
const fallbackThumb = ['thumb.jpg', 'thumb.webp'].map((f) => path.join(dir, f)).find((p) => fs.existsSync(p));
if (thumbSpec && !thumbSrc) console.warn('⚠ 指定ステップの画像がありません: ' + thumbSpec);
const thumbFrom = thumbSrc || fallbackThumb;
if (thumbFrom) conversions.push({ src: thumbFrom, dest: path.join(dir, 'thumb.webp.tmp'), ...conf.thumb });

await toWebp(conversions);
if (thumbFrom) fs.renameSync(path.join(dir, 'thumb.webp.tmp'), path.join(dir, 'thumb.webp'));
// 不要な画像を削除
fs.rmSync(path.join(dir, 'thumb.jpg'), { force: true });
for (const { d } of sessions) {
  const kept = new Set(playLog.filter((p) => p.image?.startsWith(d + '/')).map((p) => path.basename(p.image)));
  for (const f of fs.readdirSync(path.join(dir, d))) if (/\.(jpg|webp)$/.test(f) && !kept.has(f)) fs.rmSync(path.join(dir, d, f));
}

meta.aiReview = {
  reviewer,
  selfReview: reviewer.model === main.model,
  method: sessions.length
    ? `時間停止ターン制プレイ（${sessions.map(({ device, s }) => `${device === 'mobile' ? 'スマホ' : 'PC'} ${s.steps.length}手`).join(' / ')}）: 画面を見て操作を決め、その操作の間だけゲーム内時間を進める`
    : 'コードと自動テスト結果からの評価（プレイなし）',
  scores,
  playableByDevice: { pc: playablePc, mobile: playableMobile },
  overall: Math.round(((scores.fun + scores.quality + scores.originality) / 3) * 100) / 100,
  comment: a.comment,
  good: typeof a.good === 'string' ? a.good : undefined,
  bad: typeof a.bad === 'string' ? a.bad : undefined,
  similar,
  research: typeof a.research === 'string' ? a.research : undefined,
  i18n: {
    en: {
      comment: typeof a['comment-en'] === 'string' ? a['comment-en'] : undefined,
      good: typeof a['good-en'] === 'string' ? a['good-en'] : undefined,
      bad: typeof a['bad-en'] === 'string' ? a['bad-en'] : undefined,
      research: typeof a['research-en'] === 'string' ? a['research-en'] : undefined,
    },
  },
  playLog,
  reviewedAt: jstNow().iso,
};

const en = meta.i18n?.en || {};
const missing = [
  ...['title', 'genre', 'description', 'howToPlay'].filter((k) => !meta[k]),
  ...['title', 'description', 'howToPlay'].filter((k) => !en[k]).map((k) => `i18n.en.${k}`),
  ...(typeof a['comment-en'] === 'string' ? [] : ['--comment-en']),
];
if (missing.length) console.warn(`⚠ meta.json の未記入項目: ${missing.join(', ')}（公開前に埋めてください）`);
if (!meta.autoTest?.passed) console.warn('⚠ 自動テストに合格していません（node tools/validate.mjs で確認）');
if (!fs.existsSync(path.join(dir, 'thumb.webp'))) console.warn('⚠ サムネイルがありません');
if (!sessions.some((x) => x.device === 'mobile')) console.warn('⚠ スマホでの自己プレイがありません（play.mjs init <id> --device mobile）');

if (!missing.length && meta.autoTest?.passed) {
  meta.status = 'published';
  meta.publishedAt ||= jstNow().iso;
}
meta.generation ||= {};
meta.generation.finishedAt = jstNow().iso;
writeMeta(id, meta);
const kb = dirSize(dir) / 1024;
console.log(`自己採点を記録しました: ${id}  状態=${meta.status}  総合=${meta.aiReview.overall}  容量=${kb.toFixed(0)}KB`);
if (kb > conf.gameBudgetKB) console.warn(`⚠ 容量が目安（${conf.gameBudgetKB}KB）を超えています`);
