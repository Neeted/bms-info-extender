"""
LR2 IR から bmsid と md5 のマッピングを取得するスクリプト

LR2 IR (http://www.dream-pro.info/~lavalse/LR2IR/) から bmsid を取得し、
マッピングデータを保存します。

入力:
- LR2のsong.db (md5ハッシュの取得元)

出力:
- lr2_bmsid/bmsid_to_md5.arrow
- lr2_bmsid/bmsid_to_md5.tsv
"""
import argparse
import sqlite3
import re
import logging

import pandas as pd
import polars as pl
import requests

from common import DATA_DIR, load_config, write_arrow_safe

# --- 設定読み込み ---
config = load_config()
DB_PATH = config.get("database", "main_db")

# --- 出力先ディレクトリ ---
SAVE_DIR = DATA_DIR / "lr2_bmsid"
SAVE_DIR.mkdir(parents=True, exist_ok=True)

ARROW_PATH = SAVE_DIR / "bmsid_to_md5.arrow"
TSV_PATH = SAVE_DIR / "bmsid_to_md5.tsv"
LOG_FILE = SAVE_DIR / "bmsid_fetch.log"

URL_TEMPLATE = "http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5={md5}"

# LR2のsong.dbでrowid >= 1480731はBOF21以降に追加されたデータ。
# これ以前のデータはbmsidが付与される可能性が低いためデータ範囲を絞る
DB_ROWID_THRESHOLD = 1480731

# --- ログ設定 ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """コマンドライン引数を解析する"""
    parser = argparse.ArgumentParser(description="LR2 IR から bmsid と md5 のマッピングを取得")
    parser.add_argument(
        "--mode",
        choices=("1", "2", "3"),
        help="bmsid取得モード。未指定時は対話で選択します",
    )
    return parser.parse_args()


def ask_user_mode() -> str:
    """
    処理対象の選択をユーザーに求める。
    
    Returns:
        "1", "2", "3" のいずれか
    """
    while True:
        choice = input(
            "bmsidの取得モードを選択してください\n"
            "1: 全未解決（arrow内のbmsid未取得 + DB内の新規）\n"
            "2: 新規のみ（arrowに存在しないDBデータ）\n"
            "3: DB範囲の未解決（DBデータのうち、新規またはbmsid未取得）\n"
        ).strip()
        if choice in ("1", "2", "3"):
            return choice
        print("1, 2, または 3 を入力してください")


def fetch_bmsid_from_lr2ir(md5: str) -> int | None:
    """
    LR2 IRからbmsidを取得する。
    
    Args:
        md5: BMS楽曲のMD5ハッシュ
    
    Returns:
        bmsid (取得成功時) または None (失敗時)
    """
    url = URL_TEMPLATE.format(md5=md5)
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            logger.warning(f"[{md5}] HTTPエラー: {response.status_code}")
            return None

        match = re.search(r"bmsid=(\d+)", response.text)
        if match:
            bmsid = int(match.group(1))
            logger.info(f"[{md5}] bmsid取得成功: {bmsid}")
            return bmsid
        else:
            logger.info(f"[{md5}] bmsidが見つかりません")
            return None
    except Exception as e:
        logger.error(f"[{md5}] エラー発生: {e}")
        return None


def main():
    args = parse_args()

    # --- 1. 既存データの読み込み ---
    if ARROW_PATH.exists():
        # Windowsでのファイルロック回避のため memory_map=False で読み込む
        df_existing = pl.read_ipc(ARROW_PATH, memory_map=False)
        logger.info(f"既存データ {ARROW_PATH.name} を読み込みました（{df_existing.height} 件）")
    else:
        df_existing = pl.DataFrame({
            "bmsid": pl.Series([], dtype=pl.Int64),
            "md5": pl.Series([], dtype=pl.Utf8)
        })
        logger.info("既存データが存在しないため、新規作成します")

    # --- 2. DBからmd5を取得 ---
    conn = sqlite3.connect(DB_PATH)
    df_db_pandas = pd.read_sql_query(
        f"SELECT hash AS md5 FROM song WHERE rowid >= {DB_ROWID_THRESHOLD};",
        conn
    )
    conn.close()
    df_db = pl.from_pandas(df_db_pandas)
    logger.info(f"DBからmd5を {df_db.height} 件 取得しました")

    # --- 3. 処理対象の抽出 ---
    mode = args.mode or ask_user_mode()
    
    # 共通処理: 新規md5（arrowに存在しないDBデータ）
    existing_md5 = set(df_existing["md5"].to_list())
    df_db_new = (
        df_db
        .filter(~pl.col("md5").is_in(existing_md5))
        .with_columns(pl.lit(None).cast(pl.Int64).alias("bmsid"))
        .select(["bmsid", "md5"])
    )
    
    # 共通処理: arrow内のbmsid未取得
    df_arrow_unresolved = df_existing.filter(pl.col("bmsid").is_null())
    
    if mode == "1":
        # 全未解決データ（arrow内のbmsid未取得 + DB内の新規）
        df_targets = pl.concat([df_arrow_unresolved, df_db_new]).unique(subset=["md5"], keep="first")
        
    elif mode == "2":
        # 新規のみ（arrowに存在しないDBデータ）
        df_targets = df_db_new
        
    elif mode == "3":
        # DB範囲の未解決（DBデータのうち、新規またはarrow内でbmsid未取得）
        # DB内かつarrow内でbmsidがNullのmd5
        df_db_unresolved = (
            df_db
            .join(df_existing, on="md5", how="inner")
            .filter(pl.col("bmsid").is_null())
            .select(["bmsid", "md5"])
        )
        df_targets = pl.concat([df_db_new, df_db_unresolved]).unique(subset=["md5"], keep="first")

    logger.info(f"bmsid取得対象のmd5件数: {df_targets.height}")

    # --- 4. bmsid取得ループ ---
    results = []
    for row in df_targets.iter_rows(named=True):
        md5 = row["md5"]
        bmsid = fetch_bmsid_from_lr2ir(md5)
        results.append({"md5": md5, "bmsid": bmsid})

    # --- 5. データ統合・並び替え ---
    if results:
        # スキーマを明示的に指定（カラム順をdf_existingに合わせる）
        df_new = pl.DataFrame(results, schema={"bmsid": pl.Int64, "md5": pl.Utf8})
        df_combined = pl.concat([df_existing, df_new])
    else:
        df_combined = df_existing

    # 重複排除（同じmd5の場合は後のものを採用）
    df_combined = df_combined.unique(subset=["md5"], keep="last")
    # bmsidでソート（Nullは末尾）
    df_combined = df_combined.sort("bmsid", nulls_last=True)

    # --- 6. 保存 ---
    write_arrow_safe(df_combined, ARROW_PATH)
    df_combined.write_csv(TSV_PATH, separator="\t")
    logger.info(f"保存完了: {ARROW_PATH.name}, {TSV_PATH.name}")


if __name__ == "__main__":
    main()
