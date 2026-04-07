"""
bmsdata バケット直下オブジェクトへ Cache-Control を後付けする one-off スクリプト。

対象:
- script/r2_uploader.py が配置した root key のオブジェクト

非対象:
- score/... を含む prefix 配下
- その他 "/" を含むキー
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from tqdm import tqdm

from r2_common import create_r2_client


MAX_WORKERS = 32
CONTENT_TYPE = "text/plain; charset=utf-8"
CONTENT_ENCODING = "br"
CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, must-revalidate, stale-if-error=86400"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

s3, bucket_name = create_r2_client(MAX_WORKERS)
progress_lock = threading.Lock()


def list_root_objects() -> list[str]:
    """バケット直下のオブジェクトキーのみを列挙する。"""
    paginator = s3.get_paginator("list_objects_v2")
    keys: list[str] = []

    for page in paginator.paginate(Bucket=bucket_name):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if "/" in key:
                continue
            keys.append(key)

    keys.sort()
    return keys


def backfill_single_object(key: str, progress_bar) -> tuple[bool, str]:
    """新規アップロード時と同じレスポンスヘッダで self-copy する。"""
    try:
        head = s3.head_object(Bucket=bucket_name, Key=key)
        copy_args = {
            "Bucket": bucket_name,
            "Key": key,
            "CopySource": {"Bucket": bucket_name, "Key": key},
            "MetadataDirective": "REPLACE",
            "CacheControl": CACHE_CONTROL,
            "ContentType": CONTENT_TYPE,
            "ContentEncoding": CONTENT_ENCODING,
            "Metadata": head.get("Metadata", {}),
        }

        s3.copy_object(**copy_args)
        return True, key
    except Exception as exc:
        logger.error("Cache-Control 更新に失敗しました: %s (%s)", key, exc)
        return False, key
    finally:
        with progress_lock:
            progress_bar.update(1)


def main() -> None:
    keys = list_root_objects()
    if not keys:
        logger.info("更新対象の root object がありません。")
        return

    logger.info(
        "Cache-Control を後付けします: bucket=%s target_count=%s",
        bucket_name,
        len(keys),
    )

    failed_keys: list[str] = []
    with tqdm(total=len(keys), desc="Backfilling cache-control") as progress_bar:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(backfill_single_object, key, progress_bar)
                for key in keys
            ]
            for future in as_completed(futures):
                success, key = future.result()
                if not success:
                    failed_keys.append(key)

    success_count = len(keys) - len(failed_keys)
    logger.info("完了: success=%s failed=%s", success_count, len(failed_keys))
    if failed_keys:
        for key in failed_keys:
            logger.error("  - %s", key)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
