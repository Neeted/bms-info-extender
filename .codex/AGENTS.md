# AGENTS

## 基本方針
- Codex の応答は原則日本語で行う。
- ソースコード内コメントは原則日本語で記述する。
- コミットメッセージは原則日本語で記述する。
- 例外は、外部仕様・既存命名・英語固定の技術要件に従う必要がある場合のみとする。

## score-parser の責務分離
- 手編集するのは `web/score-parser-runtime` のみとする。
- `site/score-parser/current/` は dev viewer 用の最新版ミラーであり、Git 管理対象外とする。
- `site/score-parser/vx.x.x/` は配布用 snapshot とし、通常作業では編集しない。

## score-parser 変更時の手順
- `web/score-parser-runtime` を編集する。
- 関連テストを実行する。
- `script/sync_score_parser_current.ps1` を実行し、`site/score-parser/current/` を同期する。
- source、`current`、`v*` を別々に手編集しない。

## dev viewer の参照ルール
- dev viewer の既定 parserVersion は `current` とする。
- `parserVersion=current` のときは `/score-parser/current/score_loader.js` を参照する。
- 明示的に版番号を指定したときのみ `/score-parser/vx.x.x/` を参照する。
- userscript や本番向け参照先は版固定を維持する。

## preview runtime の共通化ルール
- dev page の下半分 preview と userscript の preview は実装差を出さない。
- preview の見た目・graph・hover/click/pin・score viewer 連携は共通 preview source を source of truth とする。
- `site/dev/score-viewer/lib/generated/preview-runtime.generated.js` と userscript へ埋め込まれる generated preview runtime は手編集しない。
- preview 挙動の修正は共通 preview source を直し、`script/build_preview_runtime.mjs` を実行して両出力を同期する。
- preview を変更したら、少なくとも dev page と userscript の両方で同じ挙動になっているか確認する。

## リリース運用
- `site/score-parser/vx.x.x/` の生成はリリース作業としてのみ行う。
- 既存の `v*` snapshot は凍結扱いとし、通常の不具合修正では更新しない。
- 新版公開時は、正常な source を基準に snapshot を生成する。
