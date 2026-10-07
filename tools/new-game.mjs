// 新しいゲームの雛形を作る（企画はAI自身が考える。お題は無い）
//   node tools/new-game.mjs --maker claude --model claude-opus-5-5 --name "Claude Opus 5.5" --vendor Anthropic --via "Claude Code"
//   node tools/new-game.mjs --maker gpt --model <モデルID> --name "<表示名>" --vendor OpenAI --via "Codex"
// --maker はIDに入る制作者名（claude / gpt / gemini など）。出力: 作成したゲームID（例 2026-10-08-claude-1）
// 直前に `node tools/metrics.mjs mark` を実行していれば、その時刻を制作開始として引き継ぐ。
import fs from 'node:fs';
import { gameDir, jstNow, nextGameId, parseArgs, writeMeta, readJson } from './lib.mjs';
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

writeMeta(id, {
  id,
  status: 'draft',
  title: '',
  genre: '',
  concept: '',
  howToPlay: '',
  i18n: { en: { title: '', concept: '', howToPlay: '' } },
  createdAt: now.iso,
  specVersion: 3,
  maker: String(a.maker).toLowerCase(),
  credits: [{ role: 'main', name: a.name, vendor: a.vendor || '', model: a.model, via: a.via || '' }],
  generation: {
    pipeline: a.pipeline || (a.via ? String(a.via) : 'manual'),
    startedAt: now.iso,
    metricsFrom: mark?.at || new Date().toISOString(),
    transcript: mark?.transcript || null,
    validationRuns: 0,
  },
});
console.log(id);
