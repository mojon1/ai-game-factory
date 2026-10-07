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

## ChatGPT（Codex）で参加する場合 / Notes for Codex

- 変更は `games/<自分のID>/` だけをまとめた**1つのプルリクエスト**として出す（直接 main に push できない環境の場合）。
  PR のタイトルは `Games <日付> (gpt): <タイトル>`、本文には DAILY_TASK.md の「終了報告」を書く。
- `--maker gpt --vendor OpenAI --via "Codex"`。モデル名は分かる範囲で正確に（推測しない）。
- 自己プレイのスクリーンショットを画像として見られない場合は、DAILY_TASK.md の代替手順に従い、そのことを正直に書く。
- **PR は自動で公開される。** GitHub Actions（`.github/workflows/auto-publish.yml`）が自動テストをやり直し、合格すればそのままマージ・公開する（人間は関与しない）。
  自動公開の条件: 変更が新しい `games/<ID>/` と `games/_failures.json` への追記（破棄の記録）だけであること、meta.json の `status` が `published` であること、下書き（draft）PR でないこと。
  条件を外れた PR（既存作品の修正、作品フォルダ以外の変更など）は自動公開されず、理由がコメントされて人間の確認待ちになる。

## 人間に頼まれてサイトを改修する場合 / When a human asks you to work on the site

上の「守ること」は**ゲーム制作のときのルール**。人間から明示的にサイト（デザイン・画像・ページ）の改修を頼まれた場合は、
頼まれた範囲に限ってサイトのファイルを変更してよい。そのときは次を守る。

- 変更は頼まれた範囲だけ。ゲーム（`games/*`）・実験憲章・仕様・ツールは、頼まれない限り変更しない。
- **1つのプルリクエスト**にまとめ、何を変えたかを本文に書く（他のAIと同じファイルを同時に触らないため）。
- 文字は画像に焼き込まず HTML のテキストにする（日英切り替えのため。文言は `assets/i18n.js` の辞書に日英両方を書く）。
- 画像は `assets/` に WebP で置き、1枚 300KB 以下を目安にする。HTML から参照するときは `?v=__V__` を付ける（デプロイ時に版番号へ置き換わり、古いキャッシュが残らない）。
- スマホ（縦長）と PC の両方で崩れないこと。既存の配色（`assets/style.css` の `:root` の色）に合わせる。

## 制作者名（--maker）/ Maker names

| AI | --maker | --vendor |
| --- | --- | --- |
| Claude（Claude Code） | `claude` | Anthropic |
| ChatGPT / GPT（Codex など） | `gpt` | OpenAI |
| Gemini | `gemini` | Google |

ゲームIDは `<日付>-<maker>-<連番>`（例 `2026-10-08-gpt-1`）になり、複数のAIが同じ日に作っても衝突しない。
