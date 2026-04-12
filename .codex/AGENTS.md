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

## 譜面 parser の外部参照先
- 本リポジトリの譜面ビューアおよび `web/score-parser-runtime` の parser 挙動は、beatoraja で使用実績のある `jbms-parser` を最優先の参照先とする。
- `jbms-parser` の upstream は `https://github.com/exch-bms2/jbms-parser`、ローカル参照先は `D:\\github-clone\\jbms-parser` とする。
- `bemuse` はブラウザ実装として非常に参考になるため、BMS/BMSON の取り回しや viewer 寄りの挙動を確認したいときの主要参照先とする。
- `bemuse` の upstream は `https://github.com/bemusic/bemuse`、ローカル参照先は `D:\\github-clone\\bemuse\\packages\\bms` と `D:\\github-clone\\bemuse\\packages\\bmson` とする。
- parser や timing の解釈で迷った場合は、まず `jbms-parser` を確認し、その上でブラウザ実装上の参考として `bemuse` を照合する。
- これらはリポジトリ外の参照先なので、parser 挙動を調査・変更する際はこの節を前提知識として扱う。

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
- preview の見た目・graph・hover/click/pin・score viewer 連携は `shared/preview-runtime/` を source of truth とする。
- dev page 固有の source は `site/dev/score-viewer/src/`、userscript 固有の source は `tampermonkey/src/` に置く。
- `site/dev/score-viewer/app.js` と `tampermonkey/bms_info_extender.user.js` は build 出力であり、手編集しない。
- preview 挙動の修正は共通 preview source または adapter source を直し、`npm run build:preview-targets` を実行して両出力を同期する。
- preview を変更したら、少なくとも dev page と userscript の両方で同じ挙動になっているか確認する。
- userscript adapter のトップレベル実行文は bootstrap 周辺だけに寄せ、到達不能な実行文を残さない。
- preview runtime の破棄責務は「SPA の URL 変化時」と「同一ページ内の remount 前 cleanup」に分けて明示する。

## Game モード描画の外部参照先
- Game モードの描画意味論は、beatoraja の `LaneRenderer` を最優先の参照先とする。
- upstream は `https://github.com/exch-bms2/beatoraja`、ローカル参照先は `D:\\github-clone\\beatoraja` とする。
- 主な確認対象は `D:\\github-clone\\beatoraja\\src\\bms\\player\\beatoraja\\play\\LaneRenderer.java` とする。
- `SCROLL`、`STOP`、BPM 変化、LN body / end、marker、可視範囲の打ち切り条件を調整する際は、まず `LaneRenderer` の timeline 走査と座標計算を確認する。
- Time モード / Editor モードは preview 独自都合を許容するが、Game モードの描画差異は原則として beatoraja を基準に判断する。

## リリース運用
- 日常開発で parser を変更したときは、`web/score-parser-runtime` を更新し、関連テスト後に `script/sync_score_parser_current.ps1` を実行して `site/score-parser/current/` だけを同期する。
- 日常開発では `web/score-parser-runtime/package.json` の version は原則上げない。固定版 `site/score-parser/vx.x.x/` の生成も行わない。
- `site/score-parser/vx.x.x/` の生成はリリース作業としてのみ行い、既存の `v*` snapshot は凍結扱いとする。
- fixed version の公開は `script/release_score_parser.ps1 -ParserVersion x.y.z -UserscriptVersion a.b.c` を使う。
- release script は以下をまとめて行う。
  - `web/score-parser-runtime/package.json` の version 更新
  - `site/score-parser/vx.x.x/` の新規生成
  - 既存の同名 `v*` がある場合の上書き禁止ガード
  - `script/sync_score_parser_current.ps1` による `current` の再同期
  - userscript が参照する parser version の更新
  - userscript 自体の version 更新と再 build
- userscript や本番向け参照先は常に固定版 `/score-parser/vx.x.x/` を使い、`current` は dev viewer 用と考える。
