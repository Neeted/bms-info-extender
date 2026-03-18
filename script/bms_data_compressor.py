"""
BMS情報データをマージ・圧縮して保存するスクリプト

入力データ:
- BMSプレイヤーのDBデータ (song.db, songdata.db, songinfo.db)
- bmsid_to_md5.arrow (LR2 BMSID マッピング)
- stella_songid.arrow (Stella SongID マッピング)

処理内容:
上記のデータをマージし、各行をbrotli圧縮して保存します。
差分検出により、変更があった行のみ処理します。

出力:
- compressed/brotli/ ディレクトリに識別子（md5, sha256, bmsid）ごとのbrotliファイル
- compressed/prev_dataset.arrow (前回処理データのキャッシュ)
"""
import sqlite3
import argparse
import logging
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import pandas as pd
import polars as pl
import brotli
from tqdm import tqdm

from common import DATA_DIR, load_config, write_arrow_safe

# ロギング設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- 設定読み込み ---
config = load_config()
main_db = config.get("database", "main_db")
songdata_db = config.get("database", "songdata_db")
songinfo_db = config.get("database", "songinfo_db")

# --- 出力先ディレクトリ ---
OUTPUT_BASE_DIR = DATA_DIR / "compressed"
OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)

output_dir = OUTPUT_BASE_DIR / "brotli"
output_dir.mkdir(parents=True, exist_ok=True)

prev_dataset_path = OUTPUT_BASE_DIR / "prev_dataset.arrow"

# --- マッパーデータのパス ---
bmsid_arrow_path = DATA_DIR / "lr2_bmsid" / "bmsid_to_md5.arrow"
stella_songid_arrow_path = DATA_DIR / "stella_songid" / "stella_songid.arrow"

# 区切り文字（Unit Separator: ASCII 31）
# brotli圧縮後のデータ展開時にこの文字でカラムを分割する
SEPARATOR = '\x1f'

# SQLクエリ: BMSデータを取得してテーブル情報と結合
QUERY = """
WITH entrys AS (
  SELECT
    playlist_id,
    md5,
    org_name,
    org_symbol,
    folder,
    compat_prefix
  FROM
    playlist_entry INNER JOIN playlist USING(playlist_id)
  WHERE
    is_removed = 0
    AND playlist_id >= 98
    AND playlist_id NOT IN (5044, 5057, 5060, 5106)
  ORDER BY playlist_id
)
, tables AS (
  SELECT
    md5,
    --癖譜面コレクション(サブ)特例対応
    '['||group_concat('"'||org_name||' '||replace(org_symbol,'&iquest;&iexcl;','¿¡')||replace(folder,compat_prefix,'')||'"', ',')||']' AS "tables"
  FROM entrys
  GROUP BY md5
)
SELECT
  --songdata.song
  "md5", 
  "sha256",
  "maxbpm",
  "minbpm",
  "length",
  "mode",
  "judge",
  "feature",
  "notes",
  --songinfo.information
  "n",
  "ln",
  "s",
  "ls",
  "total",
  "density",
  "peakdensity",
  "enddensity",
  "mainbpm",
  "distribution",
  "speedchange",
  "lanenotes",
  "tables"
FROM
  (SELECT "md5", "sha256", "maxbpm", "minbpm", "length", "mode", "judge", "feature", "notes" FROM songdata.song GROUP BY sha256)
  INNER JOIN songinfo.information USING(sha256)
  LEFT OUTER JOIN tables USING(md5)
;
"""


def process_row(row_dict: dict) -> int:
    """
    1行のデータを処理してbrotli圧縮し、ファイルに保存する。
    
    ProcessPoolExecutorで実行するためにトップレベルに定義。
    
    Args:
        row_dict: Polarsのrow(dict形式)
    
    Returns:
        作成したファイル数
    """
    md5 = row_dict.get("md5")
    sha256 = row_dict.get("sha256")
    bmsid = row_dict.get("bmsid")

    identifiers = {
        "md5": md5,
        "sha256": sha256,
        "bmsid": bmsid,
    }

    def is_valid_identifier(value) -> bool:
        """識別子として有効かどうかを判定"""
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
        # Polarsから来た場合は基本的にNoneになるが、念のためpd.isnaもチェック
        try:
            if pd.isna(value):
                return False
        except (TypeError, ValueError):
            pass
        return True

    # Python 3.7+ では辞書の挿入順序が保証されており、
    # Polarsの iter_rows(named=True) もカラム順序通りに辞書を生成するため、
    # values() でそのまま順序通りに取り出せる
    row_data = ["" if v is None else str(v) for v in row_dict.values()]
    row_str = SEPARATOR.join(row_data)

    compressed = brotli.compress(
        row_str.encode("utf-8"),
        quality=11,
        mode=brotli.MODE_TEXT,
        lgwin=16
    )

    results = []
    for name, id_value in identifiers.items():
        if is_valid_identifier(id_value):
            filename = output_dir / str(id_value)
            with open(filename, "wb") as f:
                f.write(compressed)
            results.append(filename)
    
    return len(results)


def main():
    parser = argparse.ArgumentParser(description="BMS情報データをマージ・圧縮して保存")
    parser.add_argument("--force-init", action="store_true", 
                        help="強制的に初期化モードで実行（Arrowファイル作成のみ、圧縮スキップ）")
    parser.add_argument("--regenerate-all", action="store_true", 
                        help="全データを再圧縮")
    args, _ = parser.parse_known_args()

    logging.info("SQLiteに接続してデータを取得します...")
    conn = sqlite3.connect(main_db)
    conn.execute(f"ATTACH DATABASE '{songdata_db}' AS songdata")
    conn.execute(f"ATTACH DATABASE '{songinfo_db}' AS songinfo")
    
    # Pandas経由で読み込む理由:
    # Polarsの read_database_uri() は ATTACH DATABASE をサポートしていないため、
    # sqlite3.connect() で接続してATTACH後、Pandas経由でPolarsに変換する必要がある
    df_pandas = pd.read_sql_query(QUERY, conn)
    conn.close()
    
    new_df = pl.from_pandas(df_pandas)
    
    # MD5が空またはNullの行を除外
    new_df = new_df.filter(
        pl.col("md5").is_not_null() & (pl.col("md5") != "")
    )
    
    logging.info(f"メインデータ取得完了: {new_df.shape}")

    # --- Stella SongIDのデータを読み込みマージ ---
    if stella_songid_arrow_path.exists():
        stella_df = pl.read_ipc(stella_songid_arrow_path, memory_map=False)
        stella_df = stella_df.with_columns(pl.col("stella_songid").cast(pl.Int64))
        stella_df = stella_df.unique(subset=["md5"], keep="last")
        new_df = new_df.join(stella_df, on="md5", how="left")
    
    # --- LR2 BMSIDのデータを読み込みマージ ---
    if bmsid_arrow_path.exists():
        bmsid_df = pl.read_ipc(bmsid_arrow_path, memory_map=False)
        bmsid_df = bmsid_df.with_columns(pl.col("bmsid").cast(pl.Int64))
        bmsid_df = bmsid_df.unique(subset=["md5"], keep="last")
        new_df = new_df.join(bmsid_df, on="md5", how="left")

    logging.info(f"マージ後のデータサイズ: {new_df.shape}")

    # --- 初期化・モード判定 ---
    if not prev_dataset_path.exists() or args.force_init:
        logging.info("初期化モードで実行します。")
        logging.info("現在のデータを保存して終了します（圧縮処理はスキップされます）。")
        new_df.write_ipc(prev_dataset_path)
        logging.info(f"保存完了: {prev_dataset_path}")
        return

    if args.regenerate_all:
        logging.info("全件再生成モード: 既存のキャッシュを無視して全データを圧縮対象とします。")
        prev_df = new_df.clear()
    else:
        logging.info("前回データ(Arrow)を読み込んでいます...")
        try:
            # Windowsでのファイルロック回避のため memory_map=False で読み込む
            prev_df = pl.read_ipc(prev_dataset_path, memory_map=False)
        except Exception as e:
            logging.warning(f"Arrowファイルの読み込みに失敗しました: {e}")
            raise e

    # --- 差分抽出 ---
    prev_df_marked = prev_df.with_columns(pl.lit(True).alias("_exists_in_prev"))
    joined = new_df.join(prev_df_marked, on="md5", suffix="_prev", how="left")
    
    # 新規レコード（前回データに存在しない）
    condition_new = pl.col("_exists_in_prev").is_null()
    
    # 変更レコード（値が異なる）
    condition_modified = pl.lit(False)
    for col in new_df.columns:
        if col == "md5":
            continue
        condition_modified = condition_modified | pl.col(col).ne_missing(pl.col(f"{col}_prev"))
    
    diff_df = joined.filter(condition_new | condition_modified)
    diff_df = diff_df.select(new_df.columns)

    logging.info(f"差分件数: {diff_df.height} / {new_df.height}")

    if diff_df.height == 0:
        logging.info("差分がないため、処理を終了します。")
        return

    # --- 並列処理による圧縮 ---
    rows = list(diff_df.iter_rows(named=True))
    
    logging.info("圧縮処理を開始します(ProcessPoolExecutor)...")
    
    import os
    max_workers = os.cpu_count() or 4
    
    count = 0
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_row, row): row for row in rows}
        
        for future in tqdm(as_completed(futures), total=len(futures), desc="Compressing"):
            try:
                count += future.result()
            except Exception as e:
                logging.error(f"行処理中にエラーが発生しました: {e}")

    logging.info(f"処理完了: {count}個のファイルを保存しました。")
    
    # メモリ解放
    del prev_df
    import gc
    gc.collect()

    # データセットを更新
    write_arrow_safe(new_df, prev_dataset_path)
    logging.info(f"データセットを更新しました: {prev_dataset_path}")


if __name__ == "__main__":
    main()
