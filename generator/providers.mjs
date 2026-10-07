// AIプロバイダ（無料で使えるもののみ）
//   gemini : Google AI Studio の無料APIキー（GEMINI_API_KEY）
//   openai : OpenAI互換API。GitHub Models（GITHUB_TOKEN で GPT 系が無料枠で使える）、Ollama（ローカル）、
//            Groq / OpenRouter の無料モデルなど
//   mock   : 動作確認用のダミー（APIを呼ばない）
//
// chat(messages) の messages は [{ role: 'system'|'user'|'assistant', text, images?: [base64jpeg] }]
// 戻り値: { text, usage: { input, output }, modelVersion }
import fs from 'node:fs';

export function createProvider(cfg) {
  const key = cfg.apiKeyEnv ? process.env[cfg.apiKeyEnv] : '';
  if (cfg.apiKeyEnv && !key && cfg.type !== 'mock') throw new Error(`環境変数 ${cfg.apiKeyEnv} が未設定です（${cfg.id}）`);
  if (cfg.type === 'gemini') return gemini(cfg, key);
  if (cfg.type === 'openai') return openai(cfg, key);
  if (cfg.type === 'mock') return mock(cfg);
  throw new Error('未対応のプロバイダ種別: ' + cfg.type);
}

async function withRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!/429|500|502|503|504|overloaded|rate/i.test(String(e.message))) throw e;
      const wait = 15000 * (i + 1);
      console.log(`  …混雑/制限のため ${wait / 1000}秒待って再試行 (${e.message.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

function gemini(cfg, key) {
  const base = cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  return {
    vision: cfg.vision !== false,
    async chat(messages, { maxTokens, temperature, json, search } = {}) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n\n');
      const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }, ...(m.images || []).map((b64) => ({ inline_data: { mime_type: 'image/jpeg', data: b64 } }))],
      }));
      const body = {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: temperature ?? cfg.temperature ?? 1,
          maxOutputTokens: maxTokens ?? cfg.maxTokens ?? 32768,
          ...(json && !search ? { responseMimeType: 'application/json' } : {}),
        },
      };
      return withRetry(async () => {
        const r = await fetch(`${base}/models/${cfg.model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const d = await r.json();
        const parts = d.candidates?.[0]?.content?.parts || [];
        return {
          text: parts.filter((p) => !p.thought).map((p) => p.text || '').join(''),
          usage: { input: d.usageMetadata?.promptTokenCount, output: (d.usageMetadata?.candidatesTokenCount || 0) + (d.usageMetadata?.thoughtsTokenCount || 0) },
          modelVersion: d.modelVersion || cfg.model,
        };
      });
    },
  };
}

function openai(cfg, key) {
  const base = (cfg.baseUrl || 'https://models.github.ai/inference').replace(/\/$/, '');
  return {
    vision: cfg.vision !== false,
    async chat(messages, { maxTokens, temperature, json } = {}) {
      const msgs = messages.map((m) => ({
        role: m.role,
        content: m.images?.length
          ? [{ type: 'text', text: m.text }, ...m.images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }))]
          : m.text,
      }));
      const body = { model: cfg.model, messages: msgs, temperature: temperature ?? cfg.temperature ?? 1, max_tokens: maxTokens ?? cfg.maxTokens ?? 4000, ...(json && cfg.jsonMode !== false ? { response_format: { type: 'json_object' } } : {}) };
      return withRetry(async () => {
        const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`${cfg.id} ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const d = await r.json();
        return { text: d.choices?.[0]?.message?.content || '', usage: { input: d.usage?.prompt_tokens, output: d.usage?.completion_tokens }, modelVersion: d.model || cfg.model };
      });
    },
  };
}

// 動作確認用: 固定のゲームを返し、プレイでは Space とランダム移動、採点は中間値
function mock(cfg) {
  const html = fs.readFileSync(new URL('./fixtures/mock-game.html', import.meta.url), 'utf8');
  let turn = 0;
  return {
    vision: true,
    async chat(messages, { json } = {}) {
      const last = messages[messages.length - 1].text;
      if (last.includes('"similar":[')) {
        return { text: JSON.stringify({ similar: [{ title: 'モック類似作品', similarity: '中', note: 'パイプライン確認用' }], research: 'モック' }), usage: {}, modelVersion: 'mock' };
      }
      if (json && last.includes('"action"')) {
        const mobile = last.includes('スマホ');
        const keys = ['ArrowLeft', 'ArrowRight', 'Space'];
        const action = mobile ? { tap: [0.2 + 0.3 * (turn++ % 3), 0.7], hold: 300 } : { keys: [keys[turn++ % 3]], hold: 300 };
        return { text: JSON.stringify({ observation: 'モック: 画面を確認', action, note: 'モックの操作' }), usage: {}, modelVersion: 'mock' };
      }
      if (json) return { text: JSON.stringify({ playable_pc: 2, playable_mobile: 2, fun: 3, quality: 3, originality: 3, comment: 'モックによる仮の採点です。パイプライン確認用。', comment_en: 'Placeholder review by the mock provider for pipeline testing.', good: 'なし', bad: 'なし', thumb: 1 }), usage: {}, modelVersion: 'mock' };
      return { text: '```json\n{"title":"モック・ドッジ","genre":"アクション","tags":["テスト"],"description":"パイプライン確認用のモックゲーム。落ちてくるブロックを避ける。","howToPlay":"左右に動いて避ける。","controls":[{"input":"← →","action":"移動"}],"i18n":{"en":{"title":"Mock Dodge","tags":["test"],"description":"A mock game for testing the pipeline. Dodge falling blocks.","howToPlay":"Move left and right to dodge.","controls":[{"input":"← →","action":"Move"}]}}}\n```\n\n```html\n' + html + '\n```', usage: { input: 0, output: 0 }, modelVersion: 'mock' };
    },
  };
}
