# 日次ゲーム制作タスク（Claude Code 用）

このファイルは、スケジュール実行された Claude Code が**人の手を借りずに**今日のゲームを制作・公開するための手順書。
上から順に実行すること。途中で人に質問しない（判断に迷ったら、この手順書の方針で決めて進める）。
ローカル実行・クラウド実行のどちらでも同じ手順で動く。

## 0. 準備

- 作業フォルダ: このリポジトリのルート（`factory/` の1つ上）
- `git pull` で最新にする。`node_modules` が無ければ `npm ci`。
  クラウド環境などでブラウザが無い場合は `npx playwright install chromium`（失敗したら `npx playwright install --with-deps chromium`）。
- 制作本数: `factory/settings.json` の `gamesPerDay`（既定 3 本）
- 自分のモデルIDと表示名を確認する（システムプロンプトに書かれている。例: `claude-opus-5-5` / `Claude Opus 5.5`）。
  以降の `<MODEL>` `<NAME>` はこれに置き換える。推測で別のモデル名を書かないこと。
- `factory/GAME_SPEC.md` を読み、仕様を把握する。**PC とスマホの両対応は必須。**

## 1. ゲームごとの制作（本数分くり返す）

### 1-1. お題と雛形

```bash
node tools/idea.mjs
node tools/new-game.mjs --model <MODEL> --name "<NAME>" --vendor Anthropic --via "Claude Code" --pipeline claude-code --prompt "<お題>" --prompt-en "<EN のお題>"
node tools/cost.mjs start <ID>
```

- 表示されたゲームID（例 `2026-10-08-01`）を以降 `<ID>` とする。
- `cost.mjs start` で制作コストの計測を始める（必ず雛形作成の直後に実行）。
- 最近のタイトルと似た内容にならないようにする。

### 1-2. 制作

- `games/<ID>/index.html` を GAME_SPEC.md に従って1ファイルで書く。
  最初から **横長PC（キーボード）と縦長スマホ（タッチのみ）の両方** を想定してレイアウトと操作を設計する。
- `games/<ID>/meta.json` の `title` `genre` `tags` `description` `howToPlay` `controls` を埋める（他の項目は触らない）。
  `controls` には PC 用とスマホ用の操作を両方書く。
- **日本語と英語の両対応**: ゲーム内の文字は `?lang=ja|en` で切り替える（GAME_SPEC.md 6.）。
  `meta.json` の `i18n.en` にも英語版の `title` `tags` `description` `howToPlay` `controls` を書く。

### 1-3. 自動テスト

```bash
node tools/validate.mjs <ID>
```

- PC（キーボードのみ）とスマホ（縦画面・タッチのみ）の両方で検査される。
- 不合格なら原因を直して再実行。**最大3回**まで。
- 3回目も不合格なら `node tools/discard.mjs <ID> "理由"` で破棄し、次のゲームへ進む（作り直しはしない）。

### 1-4. 自己プレイ（PC とスマホの両方・必須）

```bash
# PC（640×400・キーボード＋マウス）: 6〜10手
node tools/play.mjs init <ID>
node tools/play.mjs step <ID> '<操作JSON>' --note "画面から読み取ったこと／この操作の狙い" --note-en "English"

# スマホ（360×640 縦・タッチのみ）: 3〜5手
node tools/play.mjs init <ID> --device mobile
node tools/play.mjs step <ID> '{"tap":[0.5,0.8],"hold":120}' --device mobile --note "…"
```

- 1手ごとに出力された `step-NN.jpg` を**画像として見て**から次の操作を決める。
- タイトル画面→プレイ→（可能なら）ゲームオーバーやクリアまで体験する。
- 操作JSONの書き方は `tools/play.mjs` 冒頭のコメント参照（tap / swipe / keys / wait）。ゲーム内時間は操作中しか進まない。
- スマホではキー入力が無効になる。タッチだけで遊べるか、文字やボタンが小さすぎないか、表示が重ならないかを確認する。
- `--note` には、プレイヤーとして見えたこと・考えたことを日本語で正直に書く（サイトで公開される）。
- **プレイ中に「遊べない」レベルの致命的な不具合**（開始できない、操作が効かない、即死し続ける等）を見つけた場合のみ、
  コードを修正 → `validate` → 両方の `play.mjs init` からやり直してよい（修正は1回まで）。
  バランスの悪さ・地味さ・スマホでの見づらさなどは修正せず、そのまま採点に反映する。

### 1-5. 類似作品リサーチ（必須）

アイデアは無から生まれない。自己採点の前に、似ている作品・ルーツになった作品を調べる。

- WebSearch で 2〜4 回検索する（例: 「<中心のメカニクス> browser game」「<ジャンル> <ひねり> game」、日本語でも1回）。
- 見つかった作品のうち、似ているものを最大4件選び、類似度（高/中/低）と「似ている点・違う点」をまとめる。
  定番の元祖（例: パックマン、テトリス）がルーツなら「低〜中」で挙げてよい。
- URL は検索結果で実在を確認できたものだけを書く。分からなければ省略する（作らない）。
- 類似度「高」の作品があれば、独創性は 1〜2 にする。

### 1-6. 自己採点と公開

```bash
node tools/review.mjs <ID> --playable-pc <0-2> --playable-mobile <0-2> --fun <1-5> --quality <1-5> --originality <1-5> \
  --comment "総評" --good "良かった点" --bad "気になった点" --thumb <PCのステップ番号> \
  --similar '[{"title":"作品名","url":"https://…","similarity":"高","note":"似ている点と違う点"}]' \
  --research "どう調べたか（検索語など）と、独創性の判断理由" \
  --comment-en "English review" --good-en "…" --bad-en "…" --research-en "…"
node tools/cost.mjs end <ID>
```

- 類似作品JSONの各項目には英語の説明 `note_en` も付ける。
- `cost.mjs end` で、`start` からここまでに使ったトークン数とAPI定価換算の金額（円・ドル）が記録される。

採点の心構え:

- **作者としてではなく、初めて遊んだプレイヤーとして**採点する。自分の作品をひいきしない。
- 基準: 3 = 無料のブラウザミニゲームとして平均的。5 はめったに付けない。
- 実際のプレイ体験（何点取れたか、どこで詰まったか、スマホで遊びにくい点）を根拠にする。
- サムネには、ゲームの魅力が一番伝わる PC プレイ中の画面を選ぶ。
- 実行すると画像が WebP に圧縮され、余分なプレイ画像は削除される。「状態=published」と出れば公開対象。
- 容量の警告が出た場合は、そのまま記録に残す（後から直さない）。

## 2. 公開

```bash
node tools/build-index.mjs
node tools/storage-report.mjs
git add -A
git commit -m "Daily games <日付>: <タイトル1> / <タイトル2> / <タイトル3>"
git push
```

push されると GitHub Actions がサイトを自動デプロイする。

## 3. 終了報告

最後に、作ったゲーム（ID・タイトル・自己採点の総合・PC/スマホの遊べた度・制作コスト）、破棄したものがあればその理由、
容量レポートの要約を短くまとめて出力して終了する。

## 禁止事項

- 既存のゲーム（今日以外の `games/*`）を変更しない。
- `assets/` `tools/` `factory/` やサイトのページを変更しない（制作物は `games/<ID>/` のみ）。
- 人間の評価データを参照・操作しない。
- 失敗を隠さない（破棄した場合は必ず discard.mjs で記録する）。
- 画像・音声などのファイルを追加しない（すべてコードで描画する）。
