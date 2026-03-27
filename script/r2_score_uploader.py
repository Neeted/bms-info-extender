"""
site/score/ 配下の gzip 譜面ファイルを Cloudflare R2 へアップロードするスクリプト。

用途:
- 既存の Netlify 配信用譜面を R2 側へ投入する
- 必要に応じて再実行し、同じオブジェクトを上書き同期する

注意:
- R2 の存在確認は行わない
- ローカルファイルは移動・削除しない
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from tqdm import tqdm

from common import ROOT_DIR
from r2_common import create_r2_client


SOURCE_DIR = ROOT_DIR / "site" / "score"
MAX_WORKERS = 16
IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"
SHA256_GZ_PATTERN = "*.gz"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

s3, bucket_name = create_r2_client(MAX_WORKERS)
progress_lock = threading.Lock()


def iter_score_files() -> list[Path]:
    """site/score 配下の gzip 譜面を列挙する。"""
    if not SOURCE_DIR.exists():
        return []

    files: list[Path] = []
    for file_path in SOURCE_DIR.rglob(SHA256_GZ_PATTERN):
        if not file_path.is_file():
            continue
        sha256 = file_path.stem.lower()
        if len(sha256) != 64:
            logger.warning("ファイル名から sha256 を解釈できないためスキップします: %s", file_path)
            continue
        files.append(file_path)
    files.sort()
    return files


def build_score_key(file_path: Path) -> str:
    """R2 側のオブジェクトキーを返す。"""
    return f"score/{file_path.stem.lower()}.gz"


def upload_single_file(file_path: Path, progress_bar) -> tuple[bool, Path]:
    """1 件の gzip 譜面を R2 へ送信する。"""
    try:
        s3.upload_file(
            str(file_path),
            bucket_name,
            build_score_key(file_path),
            ExtraArgs={
                "ContentType": "application/gzip",
                "CacheControl": IMMUTABLE_CACHE_CONTROL,
            },
        )
        return True, file_path
    except Exception as exc:
        logger.error("アップロードに失敗しました: %s (%s)", file_path, exc)
        return False, file_path
    finally:
        with progress_lock:
            progress_bar.update(1)


def main() -> None:
    files = iter_score_files()
    if not files:
        logger.info("アップロード対象の譜面ファイルがありません: %s", SOURCE_DIR)
        return

    logger.info("%s 件の譜面ファイルを R2 へアップロードします。", len(files))

    failed_files: list[Path] = []
    with tqdm(total=len(files), desc="Uploading scores") as progress_bar:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(upload_single_file, file_path, progress_bar)
                for file_path in files
            ]
            for future in as_completed(futures):
                success, file_path = future.result()
                if not success:
                    failed_files.append(file_path)

    success_count = len(files) - len(failed_files)
    logger.info("完了: success=%s failed=%s", success_count, len(failed_files))
    if failed_files:
        for file_path in failed_files:
            logger.error("  - %s", file_path)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
