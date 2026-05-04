"""
関連スクリプトを順に実行するパイプラインランナー

処理順:
1. stella_songid_mapper.py と lr2_bmsid_mapper.py を並列実行
2. bms_data_compressor.py を実行
3. r2_uploader.py を実行
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
R2_UPLOADER_MAX_ATTEMPTS = 3
R2_UPLOADER_RETRY_DELAYS = (10, 30)


def parse_args() -> argparse.Namespace:
    """コマンドライン引数を解析する"""
    parser = argparse.ArgumentParser(description="BMS情報更新パイプラインを実行")
    parser.add_argument(
        "--lr2-mode",
        choices=("1", "2", "3"),
        default="2",
        help="lr2_bmsid_mapper.py に渡す取得モード (デフォルト: 2)",
    )
    return parser.parse_args()


def script_command(script_name: str, *extra_args: str) -> list[str]:
    """現在のPython実行環境で対象スクリプトを実行するコマンドを返す"""
    return [sys.executable, str(SCRIPT_DIR / script_name), *extra_args]


def run_parallel_stage(lr2_mode: str) -> int:
    """Stella / LR2 のマッパーを並列実行する"""
    processes = {
        "stella_songid_mapper.py": subprocess.Popen(
            script_command("stella_songid_mapper.py")
        ),
        "lr2_bmsid_mapper.py": subprocess.Popen(
            script_command("lr2_bmsid_mapper.py", "--mode", lr2_mode)
        ),
    }

    exit_codes: dict[str, int] = {}
    for name, process in processes.items():
        exit_codes[name] = process.wait()

    failed = {name: code for name, code in exit_codes.items() if code != 0}
    if failed:
        for name, code in failed.items():
            print(f"[ERROR] 並列段階で失敗: {name} (exit code: {code})")
        return 1

    print("[OK] 並列段階が完了しました")
    return 0


def run_sequential_stage(script_name: str) -> int:
    """単一スクリプトを順次実行する"""
    result = subprocess.run(script_command(script_name), check=False)
    if result.returncode != 0:
        print(f"[ERROR] 失敗: {script_name} (exit code: {result.returncode})")
        return result.returncode

    print(f"[OK] 完了: {script_name}")
    return 0


def run_r2_uploader_stage() -> int:
    """r2_uploader.py は一時的な異常終了に備えてプロセス単位で再試行する"""
    script_name = "r2_uploader.py"

    for attempt in range(1, R2_UPLOADER_MAX_ATTEMPTS + 1):
        result = subprocess.run(script_command(script_name), check=False)
        if result.returncode == 0:
            print(f"[OK] 完了: {script_name}")
            return 0

        if attempt >= R2_UPLOADER_MAX_ATTEMPTS:
            print(f"[ERROR] 失敗: {script_name} (exit code: {result.returncode})")
            return result.returncode

        delay = R2_UPLOADER_RETRY_DELAYS[min(attempt - 1, len(R2_UPLOADER_RETRY_DELAYS) - 1)]
        print(
            f"[WARN] {script_name} retry {attempt}/{R2_UPLOADER_MAX_ATTEMPTS} "
            f"after exit code {result.returncode}; waiting {delay}s"
        )
        time.sleep(delay)


def main() -> int:
    args = parse_args()

    print(f"[START] 並列実行を開始します (lr2 mode: {args.lr2_mode})")
    parallel_exit_code = run_parallel_stage(args.lr2_mode)
    if parallel_exit_code != 0:
        return parallel_exit_code

    print("[START] bms_data_compressor.py を実行します")
    compressor_exit_code = run_sequential_stage("bms_data_compressor.py")
    if compressor_exit_code != 0:
        return compressor_exit_code

    print("[START] r2_uploader.py を実行します")
    uploader_exit_code = run_r2_uploader_stage()
    if uploader_exit_code != 0:
        return uploader_exit_code

    print("全処理完了")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
