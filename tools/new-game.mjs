// 新しいゲームの雛形を作る（企画はAI自身が考える。お題は無い）
//   node tools/new-game.mjs --maker claude --model claude-opus-5-5 --name "Claude Opus 5.5" --vendor Anthropic --via "Claude Code"
//   node tools/new-game.mjs --maker gpt --model <モデルID> --name "<表示名>" --vendor OpenAI --via "Codex"
// --maker はIDに入る制作者名（claude / gpt / gemini など）。出力: 作成したゲームID（例 2026-10-08-claude-1）
// --trigger scheduled … スケジュール実行（毎日の自動制作）で作るとき。人に頼まれて作るときは省略（manual）。
// 直前に `node tools/metrics.mjs mark` を実行していれば、その時刻を制作開始として引き継ぐ。
import fs from 'node:fs';
import crypto from 'node:crypto';
import { gameDir, jstNow, nextGameId, parseArgs, writeMeta, readJson, genres, DRAW_FILE } from './lib.mjs';
import { MARK_FILE } from './metrics.mjs';

const a = parseArgs();
if (!a.model || !a.name) {
  console.error('--model（モデルID）と --name（表示名）は必須です。例: --model claude-opus-5-5 --name "Claude Opus 5.5"');
  process.exit(1);
}
const now = jstNow();
if (!a.maker) { console.error('--maker（claude / gpt など）を指定してください'); process.exit(1); }
const id = nextGameId(a.maker, typeof a.date === 'string' ? a.date : now.date);
fs.mkdirSync(gameDir(id), { recursive: true });
const mark = readJson(MARK_FILE);
fs.rmSync(MARK_FILE, { force: true });
// 企画のくじ（tools/draw-genre.mjs）の結果を引き継ぐ。引いていなければここで引く（企画に使うこと）
let draw = readJson(DRAW_FILE);
fs.rmSync(DRAW_FILE, { force: true });
if (!draw) {
  const list = genres(), g = list[crypto.randomInt(list.length)];
  draw = { ja: g.ja, en: g.en, at: new Date().toISOString(), of: list.length };
  console.error(`くじを引いていなかったので、ここで引きました: ${draw.ja} / ${draw.en}（企画の候補の1つに使うこと）`);
}

writeMeta(id, {
  id,
  status: 'draft',
  title: '',
  genre: '',
  concept: '',
  howToPlay: '',
  libraryDecision: '',
  soundDecision: '',   // 音の判断（GAME_SPEC.md「音の判断」）
  // 企画の候補（GAME_SPEC.md「企画の順番とライブラリの判断」）。3つのうち1つはくじのジャンルで考え、fromDraw: true にする
  planning: {
    genreDraw: { ja: draw.ja, en: draw.en, of: draw.of },
    candidates: [{ idea: '', ideaEn: '', fromDraw: true }, { idea: '', ideaEn: '', fromDraw: false }, { idea: '', ideaEn: '', fromDraw: false }],
    chosen: null,
  },
  structure: { goal: '', ending: '', input: [] },   // 作品の構造（GAME_SPEC.md「作品の構造」）
  i18n: { en: { title: '', concept: '', howToPlay: '', libraryDecision: '', soundDecision: '' } },
  createdAt: now.iso,
  specVersion: 7,
  maker: String(a.maker).toLowerCase(),
  credits: [{ role: 'main', name: a.name, vendor: a.vendor || '', model: a.model, via: a.via || '' }],
  generation: {
    pipeline: a.pipeline || (a.via ? String(a.via) : 'manual'),
    trigger: a.trigger === 'scheduled' ? 'scheduled' : 'manual',
    startedAt: now.iso,
    metricsFrom: mark?.at || new Date().toISOString(),
    transcript: mark?.transcript || null,
    validationRuns: 0,
  },
});
console.log(id);
