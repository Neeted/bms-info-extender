"""
BMS情報データをマージ・圧縮して保存するスクリプト

入力データ:
- BMSプレイヤーのDBデータ (song.db)
- bmsid_to_md5.arrow (LR2 BMSID マッピング)
- stella_songid.arrow (Stella SongID マッピング)

処理内容:
上記のデータをマージし、各行をbrotli圧縮して保存します。
差分検出により、変更があった行のみ処理します。

出力:
- compressed/brotli/ ディレクトリに識別子（md5, sha256, bmsid）ごとのbrotliファイル
- compressed/prev_dataset.arrow (前回処理データのキャッシュ)
"""
from __future__ import annotations

import argparse
import gc
import logging
import os
import sqlite3
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import brotli
import pandas as pd
import polars as pl
from tqdm import tqdm

from common import DATA_DIR, load_config, write_arrow_safe


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


OUTPUT_BASE_DIR = DATA_DIR / "compressed"
OUTPUT_DIR = OUTPUT_BASE_DIR / "brotli"
PREV_DATASET_PATH = OUTPUT_BASE_DIR / "prev_dataset.arrow"

BMSID_ARROW_PATH = DATA_DIR / "lr2_bmsid" / "bmsid_to_md5.arrow"
STELLA_SONGID_ARROW_PATH = DATA_DIR / "stella_songid" / "stella_songid.arrow"

SEPARATOR = "\x1f"
IDENTIFIER_COLUMNS = ("md5", "sha256", "bmsid")
OUTPUT_COLUMNS = [
    "md5",
    "sha256",
    "maxbpm",
    "minbpm",
    "length",
    "mode",
    "judge",
    "feature",
    "notes",
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
    "tables",
    "stella",
    "bmsid",
]

CACHE_SCHEMA: dict[str, pl.DataType] = {
    "md5": pl.Utf8,
    "sha256": pl.Utf8,
    "maxbpm": pl.Float64,
    "minbpm": pl.Float64,
    "length": pl.Int64,
    "mode": pl.Int64,
    "judge": pl.Int64,
    "feature": pl.Int64,
    "notes": pl.Int64,
    "n": pl.Int64,
    "ln": pl.Int64,
    "s": pl.Int64,
    "ls": pl.Int64,
    "total": pl.Float64,
    "density": pl.Float64,
    "peakdensity": pl.Float64,
    "enddensity": pl.Float64,
    "mainbpm": pl.Float64,
    "distribution": pl.Utf8,
    "speedchange": pl.Utf8,
    "lanenotes": pl.Utf8,
    "tables": pl.Utf8,
    "stella": pl.Int64,
    "bmsid": pl.Int64,
}

QUERY_SETUP_SQL = """
-- 再実行しやすいように一旦削除
DROP TABLE IF EXISTS temp.temp_songs;
DROP TABLE IF EXISTS temp.temp_entrys;
DROP TABLE IF EXISTS temp.temp_matched_tables;
DROP TABLE IF EXISTS temp.temp_tables;

-- 1. chart_info を source of truth として所持譜面を取得
------------------------------------------------------------
CREATE TEMP TABLE temp.temp_songs AS
SELECT
  NULLIF(md5, '') AS md5,
  sha256,
  maxbpm,
  minbpm,
  length,
  mode,
  judge,
  feature,
  notes,
  n,
  ln,
  s,
  ls,
  CASE
    WHEN total_defined = 0 THEN NULL
    ELSE total
  END AS total,
  density,
  peakdensity,
  enddensity,
  mainbpm,
  distribution,
  speedchange,
  lanenotes
FROM chart_info
WHERE sha256 IS NOT NULL
  AND sha256 <> ''
;

CREATE INDEX temp.idx_temp_songs_md5
  ON temp_songs(md5);

CREATE INDEX temp.idx_temp_songs_sha256
  ON temp_songs(sha256);

------------------------------------------------------------
-- 2. 難易度表エントリーを先に整形して一時表へ
--    playlist JOIN / CASE をここで一度だけ済ませる
------------------------------------------------------------
CREATE TEMP TABLE temp.temp_entrys AS
SELECT
  NULLIF(pe.md5, '')    AS md5,
  NULLIF(pe.sha256, '') AS sha256,
  pe.playlist_id,
  CASE pe.playlist_id
    -- AI難易度表
    WHEN 97 THEN
      CASE
        WHEN pe.level < 0 THEN
          'AI難易度表 ☆' || (pe.level + 11) ||
          CASE
            WHEN 0 <= CAST(REPLACE(REPLACE(pe.comment, '(Max:', ''), ')', '') AS REAL)
              THEN ' (Peak:★' || REPLACE(REPLACE(pe.comment, '(Max:', ''), ')', '') || ')'
            ELSE ' (Peak:☆' || (CAST(REPLACE(REPLACE(pe.comment, '(Max:', ''), ')', '') AS REAL) + 11) || ')'
          END
        WHEN pe.level > 100 THEN
          'AI難易度表 ◆' || (pe.level - 100) ||
          ' (Peak:◆' || (CAST(REPLACE(REPLACE(pe.comment, '(Max:', ''), ')', '') AS REAL) - 100) || ')'
        ELSE
          'AI難易度表 ★' || pe.level ||
          ' (Peak:★' || REPLACE(REPLACE(pe.comment, '(Max:', ''), ')', '') || ')'
      END

    -- ≒slst推定難易度表
    WHEN 98 THEN
      pl.org_name || ' ' || REPLACE(pe.folder, pl.compat_prefix, '') || ' (' || pe.comment || ')'

    -- --癖譜面コレクション(サブ)
    WHEN 160 THEN
      pl.org_name || ' ¿¡' || REPLACE(pe.folder, pl.compat_prefix, '')

    ELSE
      pl.org_name || ' ' || pl.org_symbol || REPLACE(pe.folder, pl.compat_prefix, '')
  END AS folder
FROM playlist_entry pe
JOIN playlist pl
  USING (playlist_id)
WHERE pe.is_removed = 0
  AND pe.playlist_id >= 97
  AND (
    (pe.md5    IS NOT NULL AND pe.md5    <> '')
    OR
    (pe.sha256 IS NOT NULL AND pe.sha256 <> '')
  )
;

CREATE INDEX temp.idx_temp_entrys_md5
  ON temp_entrys(md5);

CREATE INDEX temp.idx_temp_entrys_sha256
  ON temp_entrys(sha256);

------------------------------------------------------------
-- 3. md5 / sha256 の両経路でマッチした難易度表を一時表へ
--    重複は UNIQUE + INSERT OR IGNORE で排除
------------------------------------------------------------
CREATE TEMP TABLE temp.temp_matched_tables (
  sha256      TEXT    NOT NULL,
  playlist_id INTEGER NOT NULL,
  folder      TEXT    NOT NULL
);

CREATE UNIQUE INDEX temp.idx_temp_matched_tables_uq
  ON temp_matched_tables(sha256, playlist_id, folder);

-- md5 経由
INSERT OR IGNORE INTO temp.temp_matched_tables (
  sha256,
  playlist_id,
  folder
)
SELECT
  s.sha256,
  e.playlist_id,
  e.folder
FROM temp.temp_songs s
JOIN temp.temp_entrys e
  ON e.md5 = s.md5
WHERE s.md5 IS NOT NULL
  AND s.md5 <> ''
;

-- sha256 経由
INSERT OR IGNORE INTO temp.temp_matched_tables (
  sha256,
  playlist_id,
  folder
)
SELECT
  s.sha256,
  e.playlist_id,
  e.folder
FROM temp.temp_songs s
JOIN temp.temp_entrys e
  ON e.sha256 = s.sha256
WHERE e.sha256 IS NOT NULL
  AND e.sha256 <> ''
;

------------------------------------------------------------
-- 4. sha256 ごとに JSON 風配列へ集約
--    順序は playlist_id 優先、同一 playlist_id 内は folder で安定化
------------------------------------------------------------
CREATE TEMP TABLE temp.temp_tables AS
SELECT
  sha256,
  '[' || group_concat('"' || REPLACE(folder, '"', '\\"') || '"', ',') || ']' AS tables
FROM (
  SELECT
    sha256,
    folder
  FROM temp.temp_matched_tables
  ORDER BY sha256, playlist_id, folder
)
GROUP BY sha256
;

CREATE INDEX temp.idx_temp_tables_sha256
  ON temp_tables(sha256);
"""

QUERY_SELECT_SQL = """
SELECT
  s.md5,
  s.sha256,
  s.maxbpm,
  s.minbpm,
  s.length,
  s.mode,
  s.judge,
  s.feature,
  s.notes,
  s.n,
  s.ln,
  s.s,
  s.ls,
  s.total,
  s.density,
  s.peakdensity,
  s.enddensity,
  s.mainbpm,
  s.distribution,
  s.speedchange,
  s.lanenotes,
  t.tables
FROM temp.temp_songs s
LEFT JOIN temp.temp_tables t
  USING (sha256)
;
"""


def normalize_hash(value: Any) -> str | None:
    """空文字やNaNを除外してハッシュ値を正規化する。"""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text or None


def canonical_output_value(column: str, value: Any) -> str:
    """圧縮出力と差分比較で共有するセル文字列化。"""
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    if isinstance(value, bool):
        return str(int(value))

    if isinstance(value, int):
        return str(value)

    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)

    return str(value)


def empty_cache_df() -> pl.DataFrame:
    """標準スキーマの空DataFrameを返す。"""
    return pl.DataFrame(
        {name: pl.Series(name=name, values=[], dtype=dtype) for name, dtype in CACHE_SCHEMA.items()}
    )


def normalize_dataset_df(df: pl.DataFrame) -> pl.DataFrame:
    """旧キャッシュも吸収しながら比較・保存用の標準形へそろえる。"""
    working_df = df
    if "stella" not in working_df.columns and "stella_songid" in working_df.columns:
        working_df = working_df.with_columns(pl.col("stella_songid").alias("stella"))

    for column, dtype in CACHE_SCHEMA.items():
        if column not in working_df.columns:
            working_df = working_df.with_columns(pl.lit(None).cast(dtype).alias(column))

    expressions: list[pl.Expr] = []
    for column, dtype in CACHE_SCHEMA.items():
        expr = pl.col(column).cast(dtype, strict=False)
        if column in {"md5", "sha256"}:
            expr = expr.map_elements(normalize_hash, return_dtype=pl.Utf8)
        expressions.append(expr.alias(column))

    return working_df.select(expressions)


def validate_sha256_key(df: pl.DataFrame, dataset_name: str) -> None:
    """sha256 が常に存在し一意であることを検証する。"""
    invalid_count = df.filter(pl.col("sha256").is_null()).height
    if invalid_count > 0:
        raise ValueError(f"{dataset_name}: sha256 が空またはNullの行が {invalid_count} 件あります。")

    duplicate_sha = (
        df.group_by("sha256")
        .len()
        .filter(pl.col("len") > 1)
        .select("sha256")
        .head(5)
        .to_series()
        .to_list()
    )
    if duplicate_sha:
        raise ValueError(f"{dataset_name}: sha256 重複が見つかりました。例: {duplicate_sha}")


def load_current_dataset(main_db: str) -> pl.DataFrame:
    """SQLite から最新の BMS 情報データを取得する。"""
    logger.info("SQLiteに接続してデータを取得します...")
    conn = sqlite3.connect(main_db)
    try:
        conn.executescript(QUERY_SETUP_SQL)
        df_pandas = pd.read_sql_query(QUERY_SELECT_SQL, conn)
    finally:
        conn.close()

    dataset_df = normalize_dataset_df(pl.from_pandas(df_pandas))
    validate_sha256_key(dataset_df, "current dataset")
    logger.info("メインデータ取得完了: %s", dataset_df.shape)
    return dataset_df


def load_mapper_df(path, source_column: str, output_column: str) -> pl.DataFrame | None:
    """md5 ベースの補助マッピングを読み込み、join 用に正規化する。"""
    if not path.exists():
        return None

    mapper_df = pl.read_ipc(path, memory_map=False)
    if "md5" not in mapper_df.columns or source_column not in mapper_df.columns:
        raise ValueError(f"マッパーファイルの列が不足しています: {path}")

    normalized = (
        mapper_df.with_columns(
            pl.col("md5").cast(pl.Utf8, strict=False).map_elements(normalize_hash, return_dtype=pl.Utf8),
            pl.col(source_column).cast(pl.Int64, strict=False).alias(output_column),
        )
        .filter(pl.col("md5").is_not_null())
        .unique(subset=["md5"], keep="last")
        .select(["md5", output_column])
    )
    return normalized


def merge_mapper_column(dataset_df: pl.DataFrame, mapper_df: pl.DataFrame, output_column: str) -> pl.DataFrame:
    """プレースホルダー列を置き換えつつ md5 ベースの補助列を結合する。"""
    base_df = dataset_df.drop(output_column) if output_column in dataset_df.columns else dataset_df
    return base_df.join(mapper_df, on="md5", how="left")


def join_mapper_columns(dataset_df: pl.DataFrame) -> pl.DataFrame:
    """Stella / LR2 の補助列を md5 ベースで付与する。"""
    result_df = dataset_df

    stella_df = load_mapper_df(STELLA_SONGID_ARROW_PATH, "stella_songid", "stella")
    if stella_df is not None:
        result_df = merge_mapper_column(result_df, stella_df, "stella")

    bmsid_df = load_mapper_df(BMSID_ARROW_PATH, "bmsid", "bmsid")
    if bmsid_df is not None:
        result_df = merge_mapper_column(result_df, bmsid_df, "bmsid")

    result_df = normalize_dataset_df(result_df)
    validate_sha256_key(result_df, "current dataset after mapper join")
    logger.info("マージ後のデータサイズ: %s", result_df.shape)
    return result_df


def load_prev_dataset() -> pl.DataFrame:
    """前回キャッシュを読み込んで標準形へ変換する。"""
    try:
        prev_df = pl.read_ipc(PREV_DATASET_PATH, memory_map=False)
    except Exception as exc:
        logger.warning("Arrowファイルの読み込みに失敗しました: %s", exc)
        raise

    normalized = normalize_dataset_df(prev_df)
    validate_sha256_key(normalized, "prev dataset")
    return normalized


def comparison_key_expr(columns: list[str], alias: str) -> pl.Expr:
    """差分比較用に、出力と同じ空文字表現へ寄せた比較キーを作る。"""
    return pl.concat_str(
        [
            pl.col(column).map_elements(
                lambda value, column=column: canonical_output_value(column, value),
                return_dtype=pl.Utf8,
                skip_nulls=False,
            )
            for column in columns
        ],
        separator=SEPARATOR,
    ).alias(alias)


def extract_diff_df(new_df: pl.DataFrame, prev_df: pl.DataFrame) -> pl.DataFrame:
    """sha256 基準で新規・変更行だけを抽出する。"""
    comparison_columns = [column for column in OUTPUT_COLUMNS if column != "sha256"]
    new_marked = new_df.with_columns(comparison_key_expr(comparison_columns, "_comparison_key"))
    prev_marked = prev_df.with_columns(
        pl.lit(True).alias("_exists_in_prev"),
        comparison_key_expr(comparison_columns, "_comparison_key_prev"),
    )

    joined = new_marked.join(
        prev_marked.select(["sha256", "_exists_in_prev", "_comparison_key_prev"]),
        on="sha256",
        how="left",
    )
    diff_df = joined.filter(
        pl.col("_exists_in_prev").is_null()
        | pl.col("_comparison_key").ne_missing(pl.col("_comparison_key_prev"))
    )
    return diff_df.select(OUTPUT_COLUMNS)


def build_row_string(row_dict: dict[str, Any]) -> str:
    """出力列順を固定して 1 行を文字列化する。"""
    return SEPARATOR.join(canonical_output_value(column, row_dict.get(column)) for column in OUTPUT_COLUMNS)


def is_valid_identifier(value: Any) -> bool:
    """識別子として有効かどうかを判定する。"""
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    try:
        if pd.isna(value):
            return False
    except (TypeError, ValueError):
        pass
    return True


def process_row(row_dict: dict[str, Any]) -> int:
    """
    1行のデータを処理してbrotli圧縮し、ファイルに保存する。

    ProcessPoolExecutor で実行するためトップレベルに定義。
    """
    row_str = build_row_string(row_dict)
    compressed = brotli.compress(
        row_str.encode("utf-8"),
        quality=11,
        mode=brotli.MODE_TEXT,
        lgwin=16,
    )

    written_count = 0
    for column in IDENTIFIER_COLUMNS:
        identifier = row_dict.get(column)
        if not is_valid_identifier(identifier):
            continue

        filename = OUTPUT_DIR / str(identifier)
        with open(filename, "wb") as output_file:
            output_file.write(compressed)
        written_count += 1

    return written_count


def compress_diff_rows(diff_df: pl.DataFrame) -> int:
    """差分行だけを並列に圧縮する。"""
    logger.info("圧縮処理を開始します(ProcessPoolExecutor)...")
    max_workers = os.cpu_count() or 4
    chunksize = max(1, min(256, diff_df.height // (max_workers * 4) if diff_df.height else 1))

    count = 0
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        results = executor.map(process_row, diff_df.iter_rows(named=True), chunksize=chunksize)
        for written in tqdm(results, total=diff_df.height, desc="Compressing"):
            count += written

    return count


def parse_args() -> argparse.Namespace:
    """コマンドライン引数を解析する。"""
    parser = argparse.ArgumentParser(description="BMS情報データをマージ・圧縮して保存")
    parser.add_argument(
        "--force-init",
        action="store_true",
        help="強制的に初期化モードで実行（Arrowファイル作成のみ、圧縮スキップ）",
    )
    parser.add_argument(
        "--regenerate-all",
        action="store_true",
        help="全データを再圧縮",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    config = load_config()
    main_db = config.get("database", "main_db")

    new_df = load_current_dataset(main_db)
    new_df = join_mapper_columns(new_df)

    if not PREV_DATASET_PATH.exists() or args.force_init:
        logger.info("初期化モードで実行します。")
        logger.info("現在のデータを保存して終了します（圧縮処理はスキップされます）。")
        write_arrow_safe(new_df, PREV_DATASET_PATH)
        logger.info("保存完了: %s", PREV_DATASET_PATH)
        return

    if args.regenerate_all:
        logger.info("全件再生成モード: 既存のキャッシュを無視して全データを圧縮対象とします。")
        prev_df = empty_cache_df()
    else:
        logger.info("前回データ(Arrow)を読み込んでいます...")
        prev_df = load_prev_dataset()

    diff_df = extract_diff_df(new_df, prev_df)
    logger.info("差分件数: %s / %s", diff_df.height, new_df.height)

    if diff_df.height == 0:
        logger.info("差分がないため圧縮処理はスキップしますが、キャッシュは最新形へ更新します。")
        write_arrow_safe(new_df, PREV_DATASET_PATH)
        logger.info("データセットを更新しました: %s", PREV_DATASET_PATH)
        return

    count = compress_diff_rows(diff_df)
    logger.info("処理完了: %s個のファイルを保存しました。", count)

    del prev_df
    gc.collect()

    write_arrow_safe(new_df, PREV_DATASET_PATH)
    logger.info("データセットを更新しました: %s", PREV_DATASET_PATH)


if __name__ == "__main__":
    main()
