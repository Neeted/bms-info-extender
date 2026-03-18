"""
Stella BMS から stella_songid と md5 のマッピングを取得するスクリプト

Webスクレイピングで Stella BMS (https://stellabms.xyz) から md5 を取得し、
マッピングデータを保存します。

出力:
- stella_songid/stella_songid.arrow
- stella_songid/stella_songid.tsv
"""
import time
import random
import logging
import re

import polars as pl
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

from common import DATA_DIR, write_arrow_safe

# --- 出力先ディレクトリ ---
SAVE_DIR = DATA_DIR / "stella_songid"
SAVE_DIR.mkdir(parents=True, exist_ok=True)

ARROW_FILE = SAVE_DIR / "stella_songid.arrow"
TSV_FILE = SAVE_DIR / "stella_songid.tsv"
LOG_FILE = SAVE_DIR / "scraper.log"

# --- セレクタ定義 ---
# Stella BMSのページ構造に応じたXPath
XPATH_TARGET1 = "//*[@id=\"scroll-area\"]/section/main/div[1]/div[2]/div/table/tbody/tr[8]/td[1]/div/a[1]" # 2026/03/06 頃のサイトアップデートに対応
XPATH_TARGET2 = "//*[@id=\"scroll-area\"]/section/main/div[1]/div[2]/div[2]/table/tbody/tr[4]/td[1]/div/a[1]" # 情報未登録の曲はここだったと思うけどなんのXPATHか忘れた、もう未登録の曲は存在しないので不要なはず
XPATH_NOT_FOUND = "//*[@id=\"scroll-area\"]/section/div/div/h1"

URL_TEMPLATE = "https://stellabms.xyz/song/{}"

# --- ログ設定 ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()
    ]
)


def init_driver() -> webdriver.Chrome:
    """ヘッドレスChromeドライバーを初期化して返す"""
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    return webdriver.Chrome(options=options)


def load_data() -> pl.DataFrame:
    """
    既存のArrowファイルを読み込む。
    存在しない場合は空のDataFrameを返す。
    """
    if ARROW_FILE.exists():
        # Windowsでのファイルロック回避のため memory_map=False で読み込む
        df = pl.read_ipc(ARROW_FILE, memory_map=False)
        logging.info(f"前回のデータを読み込みました: {df.height}件")
        return df
    else:
        return pl.DataFrame({
            "stella_songid": pl.Series([], dtype=pl.Int64),
            "md5": pl.Series([], dtype=pl.Utf8)
        })


def extract_md5_from_href(href: str) -> str | None:
    """hrefからMD5ハッシュを抽出する"""
    match = re.search(r"bmsmd5=([a-fA-F0-9]{32})", href)
    if match:
        return match.group(1)
    return None


def process_page(driver: webdriver.Chrome, songid: int) -> dict | str | None:
    """
    1ページを処理してmd5を取得する。
    
    Args:
        driver: Seleniumドライバー
        songid: Stella BMSのsong ID
    
    Returns:
        - dict: 取得成功時 {"stella_songid": int, "md5": str}
        - "error": エラー発生時
        - None: ページが存在しない場合（正常終了の終了条件）
    """
    url = URL_TEMPLATE.format(songid)
    driver.get(url)
    
    try:
        element = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, XPATH_TARGET1))
        )
        logging.info(f"{songid}: XPATH_TARGET1でmd5を取得")
    except TimeoutException:
        try:
            element = WebDriverWait(driver, 3).until(
                EC.presence_of_element_located((By.XPATH, XPATH_TARGET2))
            )
            logging.info(f"{songid}: XPATH_TARGET2でmd5を取得")
        except TimeoutException:
            try:
                driver.find_element(By.XPATH, XPATH_NOT_FOUND)
                logging.info(f"{songid}: ページが存在しません (Page Not Found)")
                return None  # 正常終了の終了条件
            except Exception:
                logging.warning(f"{songid}: md5要素もPage Not Foundも見つからず")
                return "error"
    
    href = element.get_attribute("href")
    md5 = extract_md5_from_href(href)
    if md5:
        logging.info(f"{songid}: md5を抽出しました: {md5}")
        return {"stella_songid": songid, "md5": md5}
    else:
        logging.warning(f"{songid}: hrefからmd5が抽出できませんでした")
        return "error"


def main():
    df = load_data()
    driver = init_driver()
    
    # 既存データの次のIDから開始
    songid = 1
    if df.height > 0:
        songid = df["stella_songid"].max() + 1

    new_records = []
    try:
        while True:
            logging.info(f"処理中: song ID {songid}")
            result = process_page(driver, songid)
            
            if result is None:
                # ページが存在しない = 終了
                break
            elif result == "error":
                logging.warning(f"{songid}: 不明なエラーにより終了")
                break
            else:
                new_records.append(result)
            
            songid += 1
            # サーバー負荷軽減のためランダムなウェイト
            time.sleep(random.uniform(0.1, 0.5))
    finally:
        driver.quit()
        
        # 新規データを追加
        if new_records:
            df_new = pl.DataFrame(new_records)
            df = pl.concat([df, df_new])
        
        # 保存
        write_arrow_safe(df, ARROW_FILE)
        df.write_csv(TSV_FILE, separator="\t")
        logging.info(f"完了: {df.height}件のデータを保存しました")


if __name__ == "__main__":
    main()
