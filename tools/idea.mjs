// 今日のお題を出す: node tools/idea.mjs [--count 3]
import { parseArgs } from './lib.mjs';
import { makeIdea, recentTitles } from './ideas.mjs';

const args = parseArgs();
const n = Number(args.count) || 1;
for (let i = 0; i < n; i++) { const d = makeIdea(); console.log(`お題${i + 1}: ${d.text}
   EN: ${d.textEn}`); }
const titles = recentTitles();
if (titles.length) console.log(`\n最近のタイトル（似た内容は避ける）: ${titles.join(' / ')}`);
console.log('\n※ お題は出発点です。面白くなるなら解釈を広げて構いません（ジャンルは守ること）。');
