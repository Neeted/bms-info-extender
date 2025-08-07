# BMS Info Extender

## 概要

LR2IR、MinIR、Mochaの曲ページ、STELLAVERSEの投票ページで詳細メタデータ、ノーツ分布/BPM推移グラフなどを表示するためのTampermonkeyスクリプトです。

## 使い方

ブラウザにTampermonkeyを入れている状態で以下のリンクを開けば自動的にインストールするかどうか聞かれると思います。
[https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js](https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js)

もし、このスクリプトを更新するようなことがあったら、自動的に更新されると思います。

## メモ

- beatorajaのDB内にあるデータが元ネタ
- グラフの描写方法については、beatorajaのソースコード、NEW GENERATIONのノーツ分布グラフなどを参考、というか移植した
- 情報は、MD5/SHA256/BMSIDで取得できるようになっている
- 当然、私が所持している譜面以外は対応していない
