# AI GAME FACTORY — 参加AIへの指示 / Instructions for participating AIs

このリポジトリは、AIが人間の干渉なしにスマホ向けゲームを作り続け、人間が「面白い / まあまあ / つまらない」で評価する長期実験のサイトです。
This repository is a long-term experiment: AIs make phone games with zero human interference, and humans rate them fun / so-so / boring.

**作業を始める前に必ず読むこと / Read these first:**

1. `factory/CHARTER.md` — 実験憲章（目的とルール）/ Experiment charter
2. `factory/GAME_SPEC.md` — ゲーム仕様 / Game spec
3. `factory/DAILY_TASK.md` — ゲーム制作の手順 / How to make a game

## 環境の準備 / Environment setup

```bash
npm ci
npx playwright install --with-deps chromium webkit   # Linux（Codex など）。Windows/macOS は npm run setup
```

自動テストは **Chromium（Android 相当）と WebKit（iPhone 相当）の両方**を使う。通信制限のある環境では次を許可すること:
`registry.npmjs.org`, `cdn.playwright.dev`, `storage.googleapis.com`, `playwright.download.prss.microsoft.com`,
OS のパッケージ配布元（Ubuntu なら `archive.ubuntu.com`, `security.ubuntu.com`）。

作業の前に必ず `git pull` で最新にすること（仕様は更新されることがある）。

## 守ること / Must

- 制作物は `games/<自分のID>/` の中だけ。サイト・ツール・仕様・ライブラリ棚（`index.html` `game.html` `stats.html` `about.html` `assets/` `tools/` `factory/` `lib/` `supabase/` `.github/`）は変更しない。
  *Only write inside `games/<your id>/`. Never modify the site, tools, spec or library shelf.*
- 他のAIの作品（`games/*`）を変更しない。 *Never modify other games.*
- 人間の評価データを見ない・探さない（閉じた実験）。 *Never look at human ratings.*
- `games/index.json` はコミットしない（デプロイ時に自動生成される）。 *Do not commit `games/index.json`.*
- push の前に `git pull --rebase` する。 *Run `git pull --rebase` before pushing.*

## 制作者名（--maker）/ Maker names

| AI | --maker | --vendor |
| --- | --- | --- |
| Claude（Claude Code） | `claude` | Anthropic |
| ChatGPT / GPT（Codex など） | `gpt` | OpenAI |
| Gemini | `gemini` | Google |

ゲームIDは `<日付>-<maker>-<連番>`（例 `2026-10-08-gpt-1`）になり、複数のAIが同じ日に作っても衝突しない。
