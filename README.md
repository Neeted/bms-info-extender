# BMS Info Extender

LR2IR、MinIR、Mocha、STELLAVERSE で BMS の詳細情報を補完表示する userscript と、その周辺ツール群をまとめたリポジトリです。

## 使い方

ブラウザに Tampermonkey を入れている状態で以下のリンクを開くと、userscript のインストール確認が表示されます。

[https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js](https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js)

更新時は `@updateURL` / `@downloadURL` により自動更新される想定です。

## 概要

この userscript は、対応サイトの曲ページや投票ページに以下の情報を追加表示します。

- SHA256 / MD5 / BMSID などの識別子
- BPM、TOTAL、判定難易度、機能フラグ、レーン別ノーツ数
- ノーツ分布グラフ、BPM / STOP / SCROLL マーカー
- グラフと連動する譜面ビューワ
- LR2IR、MinIR、Mocha、STELLAVERSE、BMS SEARCH などへの補助リンク

現在の実装では、userscript に組み込まれた preview runtime により、グラフと譜面ビューワが連動します。dev page 側も同じ preview runtime を使っており、下半分の preview 挙動は userscript と一致する前提で管理しています。

## リポジトリについて

このリポジトリには、利用者向けの userscript だけでなく、userscript が参照する静的アセット、ブラウザ用譜面 parser、データ加工用スクリプトが含まれています。

- 利用者向けのメインコンテンツは `tampermonkey/bms_info_extender.user.js` です。
- userscript から参照する譜面データは `site/score/` に gzip で配置され、静的配信されます。
- userscript や dev page から参照する browser 向け parser は `site/score-parser/` に配置されます。
- それらの元となる parser source は `web/score-parser-runtime/` にあります。
- メタデータや譜面アセットの加工、ID 対応付け、アップロード補助は主に `script/` 配下の Python / PowerShell / Node スクリプトで行います。

## 主なディレクトリ

- `tampermonkey/`
  利用者へ配布する userscript 本体と、その build source を置いています。
- `shared/preview-runtime/`
  userscript と dev page で共通利用する preview runtime です。BMS 情報パネル、グラフ、譜面ビューワの挙動はここを source of truth としています。
- `site/dev/score-viewer/`
  parser と preview runtime の検証用 dev page です。上段は diagnostics、下段は userscript と共通の preview です。
- `site/score/`
  userscript / dev page が取得する gzip 圧縮済み譜面データを配置します。
- `site/score-parser/`
  browser 向け parser runtime の配布物を配置します。`current/` は開発用、`vX.Y.Z/` は固定版です。
- `web/score-parser-runtime/`
  BMS / BMSON をブラウザ上で扱う parser runtime の source、fixtures、テストです。
- `script/`
  メタデータ圧縮、譜面圧縮、ID マッピング、R2 アップロード、preview build、score-parser 同期などの補助スクリプトです。
- `data/`
  ローカル作業用の設定や中間データ置き場として使う想定のディレクトリです。

## 開発メモ

- preview runtime の source of truth は `shared/preview-runtime/` です。
- dev page 用 `site/dev/score-viewer/app.js` と userscript 用 `tampermonkey/bms_info_extender.user.js` は build 生成物です。
- preview 関連を変更したら `npm run build:preview-targets` を実行して両方を更新します。
- 生成物の整合確認は `npm run check:generated` で行えます。
- score-parser の source of truth は `web/score-parser-runtime/` です。
- `site/score-parser/current/` は Git 管理対象外の開発用ミラーで、`script/sync_score_parser_current.ps1` で同期します。
- Python 系スクリプトの設定は `config.ini.sample` を `data/config.ini` へコピーして調整する想定です。

## データと実装の前提

- メタデータの元ネタは beatoraja 側の DB や手元の譜面資産です。
- 情報は MD5 / SHA256 / BMSID を使って引ける前提で加工しています。
- 譜面 parser の挙動確認では `jbms-parser` を優先参照し、ブラウザ実装上の参考として `bemuse` も参照しています。
- 手元に存在しない譜面や、未加工の譜面には対応していません。

## ライセンス

本リポジトリ内で作成したコードおよび付随ドキュメントは [MIT License](./LICENSE) です。
