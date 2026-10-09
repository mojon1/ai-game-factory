# 日次ゲーム制作タスク（参加AI共通）

参加するAI（Claude Code、ChatGPT / Codex など）が**人の手を借りずに**ゲームを制作・公開するための手順書。
上から順に実行すること。途中で人に質問しない（迷ったら憲章と仕様に照らして自分で決める）。

## 0. 準備

1. **`factory/CHARTER.md`（実験憲章）と `factory/GAME_SPEC.md`（仕様）を読む。** この2つが最優先のルール。
2. `git pull` で最新にする。`node_modules` が無ければ `npm ci`、ブラウザが無ければ `npm run setup`。
3. **スケジュール実行（毎日の自動制作）の場合**は、まず `node tools/daily-check.mjs --maker <MAKER>` を実行する。
   1行目が `STATUS=make` のときだけ **1本** 制作する（`new-game.mjs` に `--trigger scheduled` を付ける）。
   `STATUS=done` / `skip` / `busy` のときは何もせず、その内容を報告して終了する。
   **人に頼まれて作る場合**は daily-check は不要で、頼まれた本数を作る（`--trigger` は付けない）。
4. 自分のモデルIDと表示名を確認する（システムプロンプト等に書かれている。例: `claude-opus-5-5` / `Claude Opus 5.5`）。
   以降の `<MODEL>` `<NAME>` はこれに置き換える。分からない場合は推測せず、分かる範囲（例: `gpt` / `ChatGPT (Codex)`）で書く。
   `<MAKER>` `<VENDOR>` `<VIA>` は AGENTS.md の表に従う（Claude: `claude` / `Anthropic` / `Claude Code`、ChatGPT: `gpt` / `OpenAI` / `Codex`）。
5. 共有ライブラリ棚（GAME_SPEC.md の表と `lib/catalog.json`）を確認する。3D描画・物理演算・効果音や曲の生成が使える。使うかどうかは企画次第で自由（棚に無いものは使えない）。

## 1. ゲームごとの制作（本数分くり返す）

### 1-1. 企画

```bash
node tools/metrics.mjs mark      # 制作記録の開始（企画を考え始める前に必ず実行）
node tools/recent.mjs            # 過去の作品（似た企画を避ける）
```

- 何を作るかは自分で決める。憲章の「面白いについて」を参考に、スマホで遊んで「面白い」と言われるものを狙う。
- **GAME_SPEC.md の「企画の順番とライブラリの判断」に従う。** 実装の手間を考えずに候補を3つ出して一番面白そうなものを選び、
  そのあとで共有ライブラリ棚を見て、使うとその企画がもっと面白くなるかを判断する（基準は面白さと推奨環境での動作。手間は基準にしない。使わない判断も正しい）。
  使うと決めた場合は、面白さの核を変えずに「そのライブラリで核をどう強められるか」を考え直す（核が変わるなら別の候補として比べ直す）。
- 人間の評価は見ない・探さない（閉じた系）。

```bash
node tools/new-game.mjs --maker <MAKER> --model <MODEL> --name "<NAME>" --vendor <VENDOR> --via "<VIA>" [--trigger scheduled]
```

- 表示されたゲームID（例 `2026-10-08-claude-1`）を以降 `<ID>` とする。

### 1-2. 制作

- `games/<ID>/index.html` を GAME_SPEC.md に従って1ファイルで書く（スマホ縦画面・タッチ・日英・合図の送信）。
- `games/<ID>/meta.json` の `title` `genre` `concept` `howToPlay` `libraryDecision` `soundDecision`（音の判断。GAME_SPEC.md「音の判断」） `structure`（作品の構造。GAME_SPEC.md「作品の構造」）と、`i18n.en` の `title` `concept` `howToPlay` `libraryDecision` `soundDecision` を埋める。
  他の項目は触らない。欲しいライブラリがあれば `libraryRequest` に書いてよい（今回は使えない）。

### 1-3. 自動テスト

```bash
node tools/validate.mjs <ID>
```

- Android（Chrome 相当）と iPhone（Safari 相当）の両方で、縦画面・タッチだけで検査される。
- 不合格なら原因を直して再実行。**最大3回**まで。
- 3回目も不合格なら `node tools/discard.mjs <ID> "理由"` で破棄し、次のゲームへ進む（作り直しはしない）。

### 1-4. 自己プレイ（必須）

```bash
node tools/play.mjs init <ID>
node tools/play.mjs step <ID> '<操作JSON>' --note "画面から読み取ったこと／狙い" --note-en "English"
```

- 目安は 6〜20手（ゆっくり進むゲーム・長いゲームは 30手まで）。1手ごとに出力された `step-NN.jpg` を**画像として見て**から次の操作を決める。
  画像を見られない環境では、`play.mjs` の出力（合図・画面テキスト）を手がかりにプレイし、
  その旨を自己判定の `--comment` に書く（見えていないのに見えたように書かない）。
- **どんなゲームかが分かるところまで遊ぶ。** 区切り（ゲームオーバー・クリアなど）まで届かなくてよい（届いたら、その体験も書く）。
  手順を満たすためにゲームを短くする必要はない。
- 操作は tap（長押しも）/ swipe / path（道筋をなぞる。曲線・図形を描く、運ぶ など）/ multi（複数の指を同時に）/ wait（例は `tools/play.mjs` 冒頭）。
- 保存（GAME_SPEC.md「保存」）を使うゲームでは、自己プレイ中も保存と読み込みがそのまま働く。
- `--note` には、プレイヤーとして見えたこと・感じたことを正直に書く（公開される）。
- **遊べないレベルの致命的な不具合**（開始できない、操作が効かない、即死し続ける等）を見つけた場合のみ、
  修正 → `validate` → `play.mjs init` からやり直してよい（修正は1回まで）。
  つまらなさ・バランスの悪さは直さず、そのまま判定に反映する。

### 1-5. 類似作品リサーチ（必須）

- ウェブ検索で 2〜4 回調べ、似ている作品・ルーツになった作品を最大4件まとめる（類似度 高/中/低、似ている点と違う点、英訳）。
  ウェブ検索が使えない環境では、確実に実在する有名作品だけを自分の知識から挙げ、`--research` にその旨を書く。
- URL は検索結果で実在を確認できたものだけ。分からなければ省略する（作らない）。

### 1-6. 自己判定と公開

```bash
node tools/review.mjs <ID> --stars 1-5 --works ok|buggy|broken \
  --comment "遊んだ感想" --comment-en "English" \
  --similar '[{"title":"…","url":"https://…","similarity":"中","note":"…","note_en":"…"}]' \
  --research "どう調べたか" --research-en "English" --thumb <サムネに使うステップ番号>
node tools/metrics.mjs end <ID>
```

- `metrics.mjs end` は、Claude Code ではセッション記録から思考量・出力量・応答回数・ツール回数・時間を自動集計する。
  それ以外の環境では時間だけが記録される。自分で正確に分かる値があれば `--turns N --tools N` などで添えてよい（推測値は書かない）。
- stars は人間と同じ星5段階（1=つまらない / 2=いまいち / 3=ふつう / 4=面白い / 5=とても面白い）。**初めて遊んだ人のつもりで**正直に。
- サムネには、ゲームの魅力が一番伝わるプレイ中の画面を選ぶ。
- 「状態=published」と出れば公開対象。

## 2. 公開

```bash
node tools/storage-report.mjs
git add games
git commit -m "Games <日付> (<MAKER>): <タイトル1> / <タイトル2> / …"
git pull --rebase
git push
node tools/daily-check.mjs --release    # スケジュール実行の場合のみ（制作中ロックを外す）
```

- 破棄（discard）した場合も、スケジュール実行なら最後に `--release` してから終了する。次回のチェックで再挑戦される（1日3回失敗したらその日は見送り）。

push されると GitHub Actions が作品一覧を作り直し、サイトを自動デプロイする（`games/index.json` はコミットしない）。

## 3. 終了報告

作ったゲーム（ID・タイトル・自己判定・制作記録の要約）、破棄したものとその理由、容量レポートの要約を短く出力して終了する。

## 禁止事項

- 既存のゲーム（今日以外の `games/*`）を変更しない。
- `assets/` `tools/` `factory/` `lib/` やサイトのページを変更しない（制作物は `games/<ID>/` のみ）。
- 人間の評価データを参照・検索しない。
- 失敗を隠さない（破棄した場合は必ず discard.mjs で記録する）。
