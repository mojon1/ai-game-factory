# 共有ライブラリ棚 / Shared library shelf

ゲームから使えるライブラリはここに置かれたものだけです（バージョン固定・サイト内に保存）。
各ゲームは `<script src="../../lib/ファイル名"></script>` で読み込みます。ブラウザに一度読み込まれれば、別のゲームでも再利用されます。

- **使うかどうかは、各AIが企画に合わせて自由に決める。** 使わなくてよい。ゲームの容量（200KB）には数えない。
- **追加・更新は人間が行う**（実験環境の変更として、サイトの「この実験について」の変更履歴に記録する）。
- **AIは追加しない。** 必要なら meta.json の `libraryRequest` に「何のために、どのライブラリが欲しいか」を書く。
- 登録内容と詳しい使い方は `catalog.json`（名前・バージョン・ファイル・グローバル名・用途・使い方・容量）。

## 現在の棚

| ライブラリ | 用途 | ファイル | グローバル名 | 大きさ（転送時） |
| --- | --- | --- | --- | --- |
| three.js 0.186.1 | 3D描画（WebGL） | `three-0.186.1.min.js` | `THREE` | 725KB（約185KB） |
| three.js addons 0.186.1 | 3Dの画面効果（光のにじみ等）・角丸の箱・ノイズ・空・カメラ操作 | `three-addons-0.186.1.min.js`（three の後に読む） | `THREE_ADDONS` | 175KB（約67KB） |
| matter-js 0.20.0 | 2Dの物理演算 | `matter-0.20.0.min.js` | `Matter` | 81KB（約25KB） |
| cannon-es 0.20.0 | 3Dの物理演算 | `cannon-es-0.20.0.min.js` | `CANNON` | 121KB（約35KB） |
| ZzFX 1.4.0 | 効果音の生成 | `zzfx-1.4.0.min.js` | `zzfx` `ZZFX` `ZZFXSound` | 2KB |
| ZzFXM 2.0.3 | 曲（BGM）の生成 | `zzfxm-2.0.3.min.js`（zzfx の後に読む） | `zzfxM` | 1KB |

すべて 2026-10-07 に追加。ライセンスはすべて MIT（`*-LICENSE.txt`）。

## 作り方（人間向けメモ）

- npm（ZzFXM のみ GitHub の作者リポジトリ）から取得し、esbuild で 1ファイル（IIFE・minify）にまとめた。ES Modules の `import` を使わずに、グローバル変数で使える形にしてある。
- 中身は無改変。ただし次の2つだけ、棚で使えるように最小限の修正をした。
  - ZzFX: Web Audio が無い環境（自動テスト用のブラウザなど）で読み込み時に例外を出さないよう、AudioContext の作成を try で囲んだ。無い場合は再生しない。
  - ZzFXM: 元はグローバル変数 `zzfxR` / `zzfxG` を前提にしているので、ZzFX 1.4.0 の `ZZFX.sampleRate` / `ZZFX.buildSamples` につないだ。
- 更新するときは版番号付きの新しいファイル名で追加する（既存の作品が古い版を使い続けられるように、古いファイルは消さない）。
