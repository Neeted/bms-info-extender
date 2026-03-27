"""
Brotli圧縮データをCloudflare R2にアップロードするスクリプト

bms_data_compressor.py で生成した圧縮データを
Cloudflare R2 オブジェクトストレージにアップロードします。

処理フロー:
1. brotli/ ディレクトリ内のファイルをR2にアップロード
2. 全件アップロード成功時のみ、ファイルを brotli_uploaded/ に移動
3. 1件でも失敗した場合は移動しない（次回再実行時に再アップロード）

設定:
- data/config.ini の [cloudflare_r2] セクションに認証情報を設定してください
"""
import logging
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from tqdm import tqdm

from common import DATA_DIR
from r2_common import create_r2_client

# --- ログ設定 ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- ディレクトリ設定 ---
SOURCE_DIR = DATA_DIR / "compressed" / "brotli"
UPLOADED_DIR = DATA_DIR / "compressed" / "brotli_uploaded"

# 並列アップロード数（回線とR2の制限次第で調整可）
MAX_WORKERS = 32

# --- boto3 クライアントの作成 ---
s3, bucket_name = create_r2_client(MAX_WORKERS)

# --- アップロード処理 ---
progress_lock = threading.Lock()
failed_files = []  # アップロード失敗したファイルを記録


def upload_single_file(file_path: Path, progress_bar) -> bool:
    """
    1ファイルをR2にアップロードする。
    
    Args:
        file_path: アップロードするファイルのパス
        progress_bar: tqdmプログレスバー
    
    Returns:
        成功時True、失敗時False
    """
    key = file_path.name
    success = False

    try:
        s3.upload_file(
            str(file_path),
            bucket_name,
            key,
            ExtraArgs={
                'ContentType': 'text/plain; charset=utf-8',
                'ContentEncoding': 'br',
            }
        )
        success = True
    except Exception as e:
        logging.error(f"Error uploading {file_path}: {e}")
        with progress_lock:
            failed_files.append(file_path)
    finally:
        with progress_lock:
            progress_bar.update(1)
    
    return success


def move_files_to_uploaded(files: list[Path]) -> int:
    """
    アップロード済みファイルを brotli_uploaded/ に移動する。
    
    Args:
        files: 移動するファイルのリスト
    
    Returns:
        移動したファイル数
    """
    UPLOADED_DIR.mkdir(parents=True, exist_ok=True)
    
    moved_count = 0
    for file_path in files:
        dest_path = UPLOADED_DIR / file_path.name
        try:
            shutil.move(str(file_path), str(dest_path))
            moved_count += 1
        except Exception as e:
            logging.error(f"ファイル移動エラー {file_path}: {e}")
    
    return moved_count


def main():
    global failed_files
    failed_files = []  # リセット
    
    if not SOURCE_DIR.exists():
        logging.error(f"アップロード対象ディレクトリが見つかりません: {SOURCE_DIR}")
        return
    
    all_files = [f for f in SOURCE_DIR.glob('*') if f.is_file()]
    total_files = len(all_files)

    if total_files == 0:
        logging.info("アップロードするファイルがありません。")
        return

    logging.info(f"{total_files}件のファイルをアップロードします...")

    with tqdm(total=total_files, desc="Uploading") as progress_bar:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(upload_single_file, file_path, progress_bar)
                for file_path in all_files
            ]

            for future in as_completed(futures):
                future.result()

    # アップロード結果を確認
    if len(failed_files) > 0:
        logging.error(f"アップロード失敗: {len(failed_files)}件のファイルが失敗しました。ファイルは移動されません。")
        for f in failed_files:
            logging.error(f"  - {f.name}")
        return

    # 全件成功時のみファイルを移動
    logging.info("全件アップロード成功。ファイルを brotli_uploaded/ に移動します...")
    moved_count = move_files_to_uploaded(all_files)
    logging.info(f"完了: {moved_count}件のファイルを移動しました。")


if __name__ == "__main__":
    main()
