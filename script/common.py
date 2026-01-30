"""
共通ユーティリティモジュール

パス設定、設定ファイル読み込み、Arrow書き込みなど
各スクリプトで共通して使用する機能を提供します。
"""
import configparser
import logging
from pathlib import Path

# --- パス設定 ---
# このファイル(common.py)の親ディレクトリ(script/)の親(リポジトリルート)からdataを参照
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_DIR = ROOT_DIR / "data"
CONFIG_PATH = DATA_DIR / "config.ini"


def load_config() -> configparser.ConfigParser:
    """
    設定ファイル(config.ini)を読み込んで返す。
    ファイルが存在しない場合はFileNotFoundErrorを送出。
    """
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"設定ファイルが見つかりません: {CONFIG_PATH}\n"
            f"config.ini.sample を data/config.ini にコピーして設定してください。"
        )
    
    config = configparser.ConfigParser()
    config.read(CONFIG_PATH, encoding="utf-8")
    return config


def write_arrow_safe(df, path: Path) -> None:
    """
    Polars DataFrameをArrow IPC形式で安全に書き込む。
    
    Windowsではメモリマップされたファイルを上書きできないため、
    一時ファイルに書き出してから元ファイルを削除してリネームする。
    
    Args:
        df: 書き込むPolars DataFrame
        path: 保存先のファイルパス
    """
    temp_path = path.with_suffix(".arrow.tmp")
    df.write_ipc(temp_path)
    if path.exists():
        path.unlink()
    temp_path.rename(path)


def setup_logging(log_file: Path = None, level: int = logging.INFO) -> logging.Logger:
    """
    ロギングを設定してloggerを返す。
    
    Args:
        log_file: ログファイルパス（Noneの場合はコンソールのみ）
        level: ログレベル
    
    Returns:
        設定済みのlogger
    """
    handlers = [logging.StreamHandler()]
    if log_file:
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=handlers
    )
    return logging.getLogger(__name__)
