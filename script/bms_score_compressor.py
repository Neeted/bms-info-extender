"""
BMS本体ファイルをgzip圧縮して保存するスクリプト

入力データ:
- BMSプレイヤーのDBデータ (song.db, songdata.db)

処理内容:
- DBから md5 / sha256 / path を取得
- 前回キャッシュ(Arrow)と照合して増分のみ処理
- 必要なBMS本体ファイルをgzip圧縮して site/score/<sha256[:2]>/<sha256>.gz に保存
- 圧縮済みファイルが存在する場合はArrowキャッシュを補完

出力:
- site/score/<sha256[:2]>/<sha256>.gz にgzip圧縮済みファイル
- data/score_processed.arrow に処理済みキャッシュ
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import logging
import os
import sqlite3
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import pandas as pd
import polars as pl
from tqdm import tqdm

from common import DATA_DIR, ROOT_DIR, load_config, setup_logging, write_arrow_safe


QUERY = """
WITH DistinctSongData AS (
    SELECT NULLIF(md5, '') AS md5, sha256, path
    FROM songdata.song
    GROUP BY sha256
),
DistinctSong AS (
    SELECT hash AS md5, NULL AS sha256, path
    FROM song
    WHERE hash NOT IN (
        SELECT md5 FROM songdata.song
    )
    GROUP BY hash
)
SELECT md5, sha256, path FROM DistinctSongData
UNION ALL
SELECT md5, sha256, path FROM DistinctSong;
"""

CACHE_SCHEMA: dict[str, pl.DataType] = {
    "md5": pl.Utf8,
    "sha256": pl.Utf8,
    "path": pl.Utf8,
    "source_size": pl.Int64,
    "compressed_size": pl.Int64,
}

OUTPUT_DIR = ROOT_DIR / "site" / "score"
CACHE_PATH = DATA_DIR / "score_processed.arrow"

ACTION_PRIORITY = {
    "skipped": 0,
    "backfilled": 1,
    "compressed": 2,
}

logger = logging.getLogger(__name__)


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


def normalize_path(value: Any) -> str | None:
    """ファイルパス文字列を正規化する。"""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def empty_cache_df() -> pl.DataFrame:
    """空のキャッシュDataFrameを返す。"""
    return pl.DataFrame(
        {name: pl.Series(name=name, values=[], dtype=dtype) for name, dtype in CACHE_SCHEMA.items()}
    )


def normalize_cache_df(df: pl.DataFrame) -> pl.DataFrame:
    """旧形式も吸収しながらキャッシュDataFrameを標準形へそろえる。"""
    working_df = df
    for column, dtype in CACHE_SCHEMA.items():
        if column not in working_df.columns:
            working_df = working_df.with_columns(pl.lit(None).cast(dtype).alias(column))

    expressions = []
    for column, dtype in CACHE_SCHEMA.items():
        expr = pl.col(column).cast(dtype, strict=False)
        if column in {"md5", "sha256", "path"}:
            expr = expr.map_elements(
                normalize_hash if column != "path" else normalize_path,
                return_dtype=pl.Utf8,
            )
        expressions.append(expr.alias(column))

    normalized = working_df.select(expressions)
    if normalized.is_empty():
        return empty_cache_df()

    records = normalized.to_dicts()
    final_records = deduplicate_cache_records(records)
    return cache_records_to_df(final_records)


def load_prev_cache() -> tuple[pl.DataFrame, dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """前回キャッシュを読み込み、sha256 / md5 インデックスも返す。"""
    if not CACHE_PATH.exists():
        empty_df = empty_cache_df()
        return empty_df, {}, {}

    try:
        prev_df = pl.read_ipc(CACHE_PATH, memory_map=False)
    except Exception as exc:
        logger.warning("Arrowキャッシュの読み込みに失敗しました: %s", exc)
        raise

    normalized = normalize_cache_df(prev_df)
    records = normalized.to_dicts()

    by_sha: dict[str, dict[str, Any]] = {}
    by_md5: dict[str, dict[str, Any]] = {}
    for record in records:
        sha256 = record.get("sha256")
        md5 = record.get("md5")
        if sha256:
            by_sha[sha256] = record
        if md5:
            by_md5[md5] = record

    return normalized, by_sha, by_md5


def cache_records_to_df(records: list[dict[str, Any]]) -> pl.DataFrame:
    """キャッシュ行リストをDataFrameへ変換する。"""
    if not records:
        return empty_cache_df()

    data: dict[str, list[Any]] = {column: [] for column in CACHE_SCHEMA}
    for record in records:
        for column in CACHE_SCHEMA:
            data[column].append(record.get(column))

    return pl.DataFrame(data, schema=CACHE_SCHEMA, strict=False)


def read_db_rows(main_db: str, songdata_db: str) -> list[dict[str, Any]]:
    """SQLiteから圧縮対象候補を取得する。"""
    logger.info("SQLiteに接続してBMS本体ファイル一覧を取得します...")
    conn = sqlite3.connect(main_db)
    try:
        conn.execute(f"ATTACH DATABASE '{songdata_db}' AS songdata")
        df_pandas = pd.read_sql_query(QUERY, conn)
    finally:
        conn.close()

    df = pl.from_pandas(df_pandas).with_columns(
        pl.col("md5").map_elements(normalize_hash, return_dtype=pl.Utf8),
        pl.col("sha256").map_elements(normalize_hash, return_dtype=pl.Utf8),
        pl.col("path").map_elements(normalize_path, return_dtype=pl.Utf8),
    )
    df = df.filter(pl.col("path").is_not_null())

    logger.info("DB取得完了: %s件", df.height)
    return df.to_dicts()


def score_file_path(sha256: str) -> Path:
    """圧縮済みファイルのパスを返す。"""
    return OUTPUT_DIR / sha256[:2] / f"{sha256}.gz"


def file_size_if_exists(path: str | Path | None) -> int | None:
    """ファイルが存在する場合のみサイズを返す。"""
    if not path:
        return None

    try:
        return Path(path).stat().st_size
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.warning("ファイルサイズ取得に失敗しました: %s (%s)", path, exc)
        return None


def build_cache_record(
    *,
    md5: str | None,
    sha256: str,
    path: str,
    source_size: int | None,
    compressed_size: int | None,
    action: str,
) -> dict[str, Any]:
    """キャッシュ用の辞書を組み立てる。"""
    return {
        "md5": normalize_hash(md5),
        "sha256": sha256,
        "path": path,
        "source_size": source_size,
        "compressed_size": compressed_size,
        "action": action,
    }


def merge_candidate_records(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """同じsha256またはmd5へ収束した候補行をマージする。"""
    existing_priority = ACTION_PRIORITY.get(existing.get("action", "skipped"), -1)
    incoming_priority = ACTION_PRIORITY.get(incoming.get("action", "skipped"), -1)

    existing_has_md5 = bool(existing.get("md5"))
    incoming_has_md5 = bool(incoming.get("md5"))
    if incoming_has_md5 and not existing_has_md5:
        preferred = dict(incoming)
        other = existing
    elif existing_has_md5 and not incoming_has_md5:
        preferred = dict(existing)
        other = incoming
    elif incoming_priority > existing_priority:
        preferred = dict(incoming)
        other = existing
    else:
        preferred = dict(existing)
        other = incoming

    for field in ("md5", "sha256", "path", "source_size", "compressed_size"):
        if preferred.get(field) is None and other.get(field) is not None:
            preferred[field] = other[field]

    if incoming_priority > existing_priority:
        preferred["action"] = incoming.get("action", preferred.get("action"))
    else:
        preferred["action"] = existing.get("action", preferred.get("action"))

    return preferred


def deduplicate_candidate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """sha256優先で重複排除し、最後にmd5重複も解消する。"""
    by_sha: dict[str, dict[str, Any]] = {}
    no_sha_records: list[dict[str, Any]] = []

    for record in records:
        sha256 = normalize_hash(record.get("sha256"))
        cleaned = {
            "md5": normalize_hash(record.get("md5")),
            "sha256": sha256,
            "path": normalize_path(record.get("path")),
            "source_size": record.get("source_size"),
            "compressed_size": record.get("compressed_size"),
            "action": record.get("action", "skipped"),
        }
        if sha256 is None:
            no_sha_records.append(cleaned)
            continue

        existing = by_sha.get(sha256)
        if existing is None:
            by_sha[sha256] = cleaned
        else:
            by_sha[sha256] = merge_candidate_records(existing, cleaned)

    by_md5: dict[str, dict[str, Any]] = {}
    md5less_records: list[dict[str, Any]] = []
    for record in list(by_sha.values()) + no_sha_records:
        md5 = record.get("md5")
        if not md5:
            md5less_records.append(record)
            continue

        existing = by_md5.get(md5)
        if existing is None:
            by_md5[md5] = record
        else:
            by_md5[md5] = merge_candidate_records(existing, record)

    final_records = list(by_md5.values()) + md5less_records
    final_records.sort(key=lambda row: (row.get("sha256") or "", row.get("md5") or "", row.get("path") or ""))

    return final_records


def deduplicate_cache_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Arrow保存用にactionを落としたキャッシュ行へ整形する。"""
    deduplicated = deduplicate_candidate_records(records)
    cleaned_records = []
    for record in deduplicated:
        cleaned_records.append(
            {
                "md5": record.get("md5"),
                "sha256": record.get("sha256"),
                "path": record.get("path"),
                "source_size": record.get("source_size"),
                "compressed_size": record.get("compressed_size"),
            }
        )
    return cleaned_records


def hash_file_sha256(path: str) -> tuple[str, int]:
    """ファイル全体を読み込んでsha256を計算する。"""
    data = Path(path).read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def compress_file(task: dict[str, Any]) -> dict[str, Any]:
    """1ファイルをgzip圧縮して保存する。"""
    sha256 = task["sha256"]
    source_path = Path(task["path"])
    destination = score_file_path(sha256)
    temp_path = destination.with_name(f"{destination.name}.tmp-{os.getpid()}")

    try:
        raw = source_path.read_bytes()
    except FileNotFoundError:
        return {
            "status": "missing",
            "sha256": sha256,
            "md5": task.get("md5"),
            "path": task["path"],
            "message": f"元ファイルが見つかりません: {source_path}",
        }
    except OSError as exc:
        return {
            "status": "error",
            "sha256": sha256,
            "md5": task.get("md5"),
            "path": task["path"],
            "message": f"元ファイルの読み込みに失敗しました: {source_path} ({exc})",
        }

    compressed = gzip.compress(raw, compresslevel=9, mtime=0)

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(temp_path, "wb") as handle:
            handle.write(compressed)
        os.replace(temp_path, destination)
    except OSError as exc:
        try:
            if temp_path.exists():
                temp_path.unlink()
        except OSError:
            pass
        return {
            "status": "error",
            "sha256": sha256,
            "md5": task.get("md5"),
            "path": task["path"],
            "message": f"gzipファイルの書き込みに失敗しました: {destination} ({exc})",
        }

    return {
        "status": "compressed",
        "record": build_cache_record(
            md5=task.get("md5"),
            sha256=sha256,
            path=task["path"],
            source_size=len(raw),
            compressed_size=len(compressed),
            action="compressed",
        ),
    }


def resolve_sha256_candidates(
    rows: list[dict[str, Any]],
    *,
    regenerate_all: bool,
    rebuild_cache: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, int]:
    """sha256未確定の行を順次処理して圧縮 or キャッシュ補完候補へ分配する。"""
    backfill_candidates: list[dict[str, Any]] = []
    compress_candidates: list[dict[str, Any]] = []
    missing_count = 0
    error_count = 0

    if not rows:
        return backfill_candidates, compress_candidates, missing_count, error_count

    for row in tqdm(rows, total=len(rows), desc="Resolving SHA256"):
        path = row["path"]
        try:
            sha256, source_size = hash_file_sha256(path)
        except FileNotFoundError:
            logger.warning("sha256計算対象の元ファイルが見つかりません: %s", path)
            missing_count += 1
            continue
        except OSError as exc:
            logger.error("sha256計算に失敗しました: %s (%s)", path, exc)
            error_count += 1
            continue

        score_path = score_file_path(sha256)
        if rebuild_cache:
            if score_path.exists():
                backfill_candidates.append(
                    build_cache_record(
                        md5=row.get("md5"),
                        sha256=sha256,
                        path=path,
                        source_size=source_size,
                        compressed_size=score_path.stat().st_size,
                        action="backfilled",
                    )
                )
            else:
                missing_count += 1
            continue

        if regenerate_all:
            compress_candidates.append(
                {
                    "md5": row.get("md5"),
                    "sha256": sha256,
                    "path": path,
                }
            )
            continue

        if score_path.exists():
            backfill_candidates.append(
                build_cache_record(
                    md5=row.get("md5"),
                    sha256=sha256,
                    path=path,
                    source_size=source_size,
                    compressed_size=score_path.stat().st_size,
                    action="backfilled",
                )
            )
        else:
            compress_candidates.append(
                {
                    "md5": row.get("md5"),
                    "sha256": sha256,
                    "path": path,
                }
            )

    return backfill_candidates, compress_candidates, missing_count, error_count


def prepare_worklists(
    rows: list[dict[str, Any]],
    prev_by_sha: dict[str, dict[str, Any]],
    prev_by_md5: dict[str, dict[str, Any]],
    *,
    regenerate_all: bool,
    rebuild_cache: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], int]:
    """DB行を skipped / backfilled / compress / sha256解決待ち に振り分ける。"""
    skipped_candidates: list[dict[str, Any]] = []
    backfill_candidates: list[dict[str, Any]] = []
    hash_needed_rows: list[dict[str, Any]] = []
    compress_candidates: list[dict[str, Any]] = []
    missing_count = 0

    for row in rows:
        md5 = normalize_hash(row.get("md5"))
        sha256 = normalize_hash(row.get("sha256"))
        path = normalize_path(row.get("path"))

        if path is None:
            missing_count += 1
            logger.warning("DBから不正なpathを取得したためスキップします: %s", row)
            continue

        if rebuild_cache:
            if sha256:
                score_path = score_file_path(sha256)
                if score_path.exists():
                    backfill_candidates.append(
                        build_cache_record(
                            md5=md5,
                            sha256=sha256,
                            path=path,
                            source_size=file_size_if_exists(path),
                            compressed_size=score_path.stat().st_size,
                            action="backfilled",
                        )
                    )
                else:
                    missing_count += 1
                continue

            hash_needed_rows.append({"md5": md5, "sha256": None, "path": path})
            continue

        if regenerate_all:
            if sha256:
                compress_candidates.append({"md5": md5, "sha256": sha256, "path": path})
            else:
                hash_needed_rows.append({"md5": md5, "sha256": None, "path": path})
            continue

        if sha256:
            score_path = score_file_path(sha256)
            prev_row = prev_by_sha.get(sha256)
            if prev_row and score_path.exists():
                skipped_candidates.append(
                    build_cache_record(
                        md5=md5 or prev_row.get("md5"),
                        sha256=sha256,
                        path=path,
                        source_size=prev_row.get("source_size"),
                        compressed_size=prev_row.get("compressed_size") or score_path.stat().st_size,
                        action="skipped",
                    )
                )
            elif score_path.exists():
                backfill_candidates.append(
                    build_cache_record(
                        md5=md5,
                        sha256=sha256,
                        path=path,
                        source_size=file_size_if_exists(path),
                        compressed_size=score_path.stat().st_size,
                        action="backfilled",
                    )
                )
            else:
                compress_candidates.append({"md5": md5, "sha256": sha256, "path": path})
            continue

        if md5:
            prev_row = prev_by_md5.get(md5)
            if prev_row:
                prev_sha256 = normalize_hash(prev_row.get("sha256"))
                if prev_sha256 and score_file_path(prev_sha256).exists():
                    skipped_candidates.append(
                        build_cache_record(
                            md5=md5,
                            sha256=prev_sha256,
                            path=path,
                            source_size=prev_row.get("source_size"),
                            compressed_size=prev_row.get("compressed_size") or file_size_if_exists(score_file_path(prev_sha256)),
                            action="skipped",
                        )
                    )
                    continue

        hash_needed_rows.append({"md5": md5, "sha256": None, "path": path})

    return skipped_candidates, backfill_candidates, compress_candidates, hash_needed_rows, missing_count


def compress_candidates_in_parallel(candidates: list[dict[str, Any]], max_workers: int) -> tuple[list[dict[str, Any]], int, int]:
    """圧縮対象候補を並列で処理する。"""
    if not candidates:
        return [], 0, 0

    unique_candidates: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        sha256 = candidate["sha256"]
        existing = unique_candidates.get(sha256)
        if existing is None:
            unique_candidates[sha256] = candidate
            continue

        current_record = build_cache_record(
            md5=existing.get("md5"),
            sha256=existing["sha256"],
            path=existing["path"],
            source_size=None,
            compressed_size=None,
            action="compressed",
        )
        new_record = build_cache_record(
            md5=candidate.get("md5"),
            sha256=candidate["sha256"],
            path=candidate["path"],
            source_size=None,
            compressed_size=None,
            action="compressed",
        )
        merged = merge_candidate_records(current_record, new_record)
        unique_candidates[sha256] = {
            "md5": merged.get("md5"),
            "sha256": merged["sha256"],
            "path": merged["path"],
        }

    logger.info("圧縮対象: %s件", len(unique_candidates))
    success_records: list[dict[str, Any]] = []
    missing_count = 0
    error_count = 0

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(compress_file, candidate) for candidate in unique_candidates.values()]
        for future in tqdm(as_completed(futures), total=len(futures), desc="Compressing"):
            try:
                result = future.result()
            except Exception as exc:
                logger.error("圧縮ワーカーで予期しない例外が発生しました: %s", exc)
                error_count += 1
                continue

            status = result["status"]
            if status == "compressed":
                success_records.append(result["record"])
            elif status == "missing":
                logger.warning(result["message"])
                missing_count += 1
            else:
                logger.error(result["message"])
                error_count += 1

    return success_records, missing_count, error_count


def summarize_actions(records: list[dict[str, Any]]) -> dict[str, int]:
    """最終成功レコードのアクション別件数を集計する。"""
    counts = {action: 0 for action in ACTION_PRIORITY}
    for record in records:
        action = record.get("action")
        if action in counts:
            counts[action] += 1
    return counts


def rows_equal(left: pl.DataFrame, right: pl.DataFrame) -> bool:
    """キャッシュDataFrame同士の同一性を判定する。"""
    left_normalized = normalize_cache_df(left)
    right_normalized = normalize_cache_df(right)
    return left_normalized.equals(right_normalized, null_equal=True)


def parse_args() -> argparse.Namespace:
    """CLI引数をパースする。"""
    parser = argparse.ArgumentParser(description="BMS本体ファイルをgzip圧縮して保存")
    parser.add_argument("--regenerate-all", action="store_true", help="既存キャッシュを無視して全件再圧縮")
    parser.add_argument("--rebuild-cache", action="store_true", help="圧縮はせず、DBとsite/score/からArrowキャッシュを再構築")
    parser.add_argument("--workers", type=int, default=os.cpu_count() or 4, help="圧縮時の並列ワーカー数")
    parser.add_argument("--log-file", type=Path, help="ログファイルの出力先")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.regenerate_all and args.rebuild_cache:
        raise SystemExit("--regenerate-all と --rebuild-cache は同時に指定できません。")
    if args.workers < 1:
        raise SystemExit("--workers は1以上を指定してください。")

    if args.log_file:
        args.log_file.parent.mkdir(parents=True, exist_ok=True)
    setup_logging(args.log_file)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    config = load_config()
    main_db = config.get("database", "main_db")
    songdata_db = config.get("database", "songdata_db")

    db_rows = read_db_rows(main_db, songdata_db)
    prev_df, prev_by_sha, prev_by_md5 = load_prev_cache()

    if args.regenerate_all:
        logger.info("全件再圧縮モードで実行します。")
        prev_by_sha = {}
        prev_by_md5 = {}
    elif args.rebuild_cache:
        logger.info("rebuild-cacheモードで実行します。")

    skipped_candidates, backfill_candidates, direct_compress_candidates, hash_needed_rows, initial_missing = prepare_worklists(
        db_rows,
        prev_by_sha,
        prev_by_md5,
        regenerate_all=args.regenerate_all,
        rebuild_cache=args.rebuild_cache,
    )

    logger.info(
        "事前振り分け完了: skipped=%s backfilled=%s hash-needed=%s compress=%s",
        len(skipped_candidates),
        len(backfill_candidates),
        len(hash_needed_rows),
        len(direct_compress_candidates),
    )

    resolved_backfills, resolved_compresses, hash_missing, hash_errors = resolve_sha256_candidates(
        hash_needed_rows,
        regenerate_all=args.regenerate_all,
        rebuild_cache=args.rebuild_cache,
    )

    backfill_candidates.extend(resolved_backfills)
    direct_compress_candidates.extend(resolved_compresses)

    compressed_records, compress_missing, compress_errors = compress_candidates_in_parallel(
        direct_compress_candidates,
        args.workers,
    )

    successful_records = skipped_candidates + backfill_candidates + compressed_records
    final_candidate_records = deduplicate_candidate_records(successful_records)
    final_df = cache_records_to_df(deduplicate_cache_records(final_candidate_records))

    action_counts = summarize_actions(final_candidate_records)
    missing_count = initial_missing + hash_missing + compress_missing
    error_count = hash_errors + compress_errors

    logger.info(
        "最終集計: compressed=%s backfilled=%s skipped=%s missing=%s error=%s",
        action_counts["compressed"],
        action_counts["backfilled"],
        action_counts["skipped"],
        missing_count,
        error_count,
    )

    if CACHE_PATH.exists() and rows_equal(prev_df, final_df):
        logger.info("Arrowキャッシュに変更がないため、更新をスキップします。")
        return

    write_arrow_safe(final_df, CACHE_PATH)
    logger.info("Arrowキャッシュを更新しました: %s", CACHE_PATH)


if __name__ == "__main__":
    main()
