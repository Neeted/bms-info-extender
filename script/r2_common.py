"""
Cloudflare R2 へ接続するための共通ヘルパー。

接続設定の読み込みと boto3 クライアント生成だけを共通化し、
アップロード並列数や ExtraArgs は呼び出し側で制御する。
"""
from __future__ import annotations

from typing import Any

import boto3
from botocore.config import Config

from common import load_config


def load_r2_settings() -> dict[str, str]:
    """config.ini から R2 接続設定を読み込む。"""
    config = load_config()
    return {
        "endpoint_url": config.get("cloudflare_r2", "endpoint_url"),
        "access_key": config.get("cloudflare_r2", "access_key"),
        "secret_key": config.get("cloudflare_r2", "secret_key"),
        "bucket_name": config.get("cloudflare_r2", "bucket_name"),
    }


def create_r2_client(max_workers: int) -> tuple[Any, str]:
    """並列数に応じたコネクションプール付きの R2 クライアントを返す。"""
    settings = load_r2_settings()
    session = boto3.session.Session()
    client = session.client(
        service_name="s3",
        aws_access_key_id=settings["access_key"],
        aws_secret_access_key=settings["secret_key"],
        endpoint_url=settings["endpoint_url"],
        config=Config(
            signature_version="s3v4",
            max_pool_connections=max_workers,
        ),
        region_name="auto",
    )
    return client, settings["bucket_name"]
