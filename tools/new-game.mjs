// 新しいゲームの雛形を作る
//   node tools/new-game.mjs --model claude-opus-5-5 --name "Claude Opus 5.5" --vendor Anthropic \
//        --via "Claude Code" --prompt "お題の文章" --prompt-en "English prompt" [--date 2026-10-07]
// 出力: 作成したゲームID（games/<id>/ に meta.json の雛形）
import fs from 'node:fs';
import { gameDir, jstNow, nextGameId, parseArgs, writeMeta } from './lib.mjs';

const a = parseArgs();
if (!a.model || !a.name) {
  console.error('--model（モデルID）と --name（表示名）は必須です。例: --model claude-opus-5-5 --name "Claude Opus 5.5"');
  process.exit(1);
}
const now = jstNow();
const id = nextGameId(typeof a.date === 'string' ? a.date : now.date);
fs.mkdirSync(gameDir(id), { recursive: true });

writeMeta(id, {
  id,
  status: 'draft',
  title: '',
  genre: '',
  tags: [],
  description: '',
  howToPlay: '',
  controls: [],
  i18n: { en: { title: '', tags: [], description: '', howToPlay: '', controls: [] } },
  createdAt: now.iso,
  credits: [
    {
      role: 'main',
      name: a.name,
      vendor: a.vendor || '',
      model: a.model,
      via: a.via || '',
    },
  ],
  generation: {
    pipeline: a.pipeline || (a.via ? String(a.via) : 'manual'),
    prompt: typeof a.prompt === 'string' ? a.prompt : '',
    promptEn: typeof a['prompt-en'] === 'string' ? a['prompt-en'] : '',
    startedAt: now.iso,
    validationRuns: 0,
  },
});
console.log(id);
