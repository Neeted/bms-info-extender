from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

import polars as pl


SCRIPT_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import bms_data_compressor as compressor


def make_row(**overrides):
    row = {
        "md5": "md5-default",
        "sha256": "sha-default",
        "maxbpm": 180,
        "minbpm": 90,
        "length": 120000,
        "mode": 7,
        "judge": 100,
        "feature": 1,
        "notes": 1234,
        "n": 1000,
        "ln": 100,
        "s": 50,
        "ls": 84,
        "total": 300.0,
        "density": 12.5,
        "peakdensity": 20.0,
        "enddensity": 5.5,
        "mainbpm": 150.0,
        "distribution": "#abcdef",
        "speedchange": "0,150",
        "lanenotes": "1,2,3",
        "tables": '["Table A"]',
        "stella": 42,
        "bmsid": 99,
    }
    row.update(overrides)
    return row


class BmsDataCompressorTests(unittest.TestCase):
    def test_normalize_dataset_df_absorbs_legacy_stella_column(self):
        df = pl.DataFrame(
            [
                {
                    "md5": "",
                    "sha256": "abc123",
                    "maxbpm": 180,
                    "stella_songid": 7,
                }
            ]
        )

        normalized = compressor.normalize_dataset_df(df)
        record = normalized.to_dicts()[0]

        self.assertEqual(normalized.columns, compressor.OUTPUT_COLUMNS)
        self.assertIsNone(record["md5"])
        self.assertEqual(record["sha256"], "abc123")
        self.assertEqual(record["stella"], 7)

    def test_extract_diff_df_uses_sha256_key_and_detects_md5_change(self):
        prev_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(md5="old-md5", sha256="same-sha")]))
        new_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(md5="new-md5", sha256="same-sha")]))

        diff_df = compressor.extract_diff_df(new_df, prev_df)

        self.assertEqual(diff_df.height, 1)
        self.assertEqual(diff_df.to_dicts()[0]["md5"], "new-md5")

    def test_extract_diff_df_treats_none_and_empty_string_as_same_output(self):
        prev_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(sha256="same-sha", tables=None)]))
        new_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(sha256="same-sha", tables="")]))

        diff_df = compressor.extract_diff_df(new_df, prev_df)

        self.assertEqual(diff_df.height, 0)

    def test_extract_diff_df_treats_integer_and_integral_float_as_same_output(self):
        prev_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(sha256="same-sha", maxbpm=180)]))
        new_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(sha256="same-sha", maxbpm=180.0)]))

        diff_df = compressor.extract_diff_df(new_df, prev_df)

        self.assertEqual(diff_df.height, 0)

    def test_extract_diff_df_preserves_fractional_bpm_changes(self):
        prev_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(sha256="same-sha", maxbpm=180)]))
        new_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(sha256="same-sha", maxbpm=180.5)]))

        diff_df = compressor.extract_diff_df(new_df, prev_df)

        self.assertEqual(diff_df.height, 1)
        self.assertEqual(diff_df.to_dicts()[0]["maxbpm"], 180.5)

    def test_merge_mapper_column_replaces_placeholder_values(self):
        dataset_df = compressor.normalize_dataset_df(pl.DataFrame([make_row(md5="same-md5", stella=None)]))
        mapper_df = pl.DataFrame([{"md5": "same-md5", "stella": 55}])

        merged_df = compressor.normalize_dataset_df(
            compressor.merge_mapper_column(dataset_df, mapper_df, "stella")
        )

        self.assertEqual(merged_df.to_dicts()[0]["stella"], 55)

    def test_build_row_string_keeps_output_order_and_blank_md5(self):
        row = make_row(md5=None, sha256="sha-only", stella=None, bmsid=None)

        row_str = compressor.build_row_string(row)
        values = row_str.split(compressor.SEPARATOR)

        self.assertEqual(len(values), len(compressor.OUTPUT_COLUMNS))
        self.assertEqual(values[0], "")
        self.assertEqual(values[1], "sha-only")
        self.assertEqual(values[-2], "")
        self.assertEqual(values[-1], "")

    def test_build_row_string_canonicalizes_numeric_values_and_blank_total(self):
        row = make_row(maxbpm=180.0, minbpm=90.5, mainbpm=150.0, total=None)

        row_str = compressor.build_row_string(row)
        values = row_str.split(compressor.SEPARATOR)

        self.assertEqual(values[compressor.OUTPUT_COLUMNS.index("maxbpm")], "180")
        self.assertEqual(values[compressor.OUTPUT_COLUMNS.index("minbpm")], "90.5")
        self.assertEqual(values[compressor.OUTPUT_COLUMNS.index("mainbpm")], "150")
        self.assertEqual(values[compressor.OUTPUT_COLUMNS.index("total")], "")
        self.assertEqual(len(values), len(compressor.OUTPUT_COLUMNS))

    def test_load_current_dataset_reads_chart_info_and_blank_undefined_total(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "song.db"
            conn = sqlite3.connect(db_path)
            try:
                conn.executescript(
                    """
                    CREATE TABLE chart_info (
                      sha256 TEXT PRIMARY KEY,
                      md5 TEXT,
                      maxbpm REAL,
                      minbpm REAL,
                      length INTEGER,
                      mode INTEGER,
                      judge INTEGER,
                      feature INTEGER,
                      notes INTEGER,
                      n INTEGER,
                      ln INTEGER,
                      s INTEGER,
                      ls INTEGER,
                      total REAL,
                      total_defined INTEGER,
                      density REAL,
                      peakdensity REAL,
                      enddensity REAL,
                      mainbpm REAL,
                      distribution TEXT,
                      speedchange TEXT,
                      lanenotes TEXT
                    );

                    CREATE TABLE playlist (
                      playlist_id INTEGER PRIMARY KEY,
                      org_name TEXT,
                      org_symbol TEXT,
                      compat_prefix TEXT
                    );

                    CREATE TABLE playlist_entry (
                      playlist_id INTEGER,
                      md5 TEXT,
                      sha256 TEXT,
                      level REAL,
                      folder TEXT,
                      comment TEXT,
                      is_removed INTEGER
                    );

                    INSERT INTO chart_info VALUES (
                      'sha-a',
                      'md5-a',
                      180.5,
                      90.0,
                      120000,
                      7,
                      3,
                      1,
                      1000,
                      900,
                      50,
                      40,
                      10,
                      300.123,
                      0,
                      1.5,
                      4.0,
                      1.25,
                      150.0,
                      '#abcdef',
                      '0,150',
                      '1,2,3'
                    );

                    INSERT INTO playlist VALUES (99, 'Table', '★', '');
                    INSERT INTO playlist_entry VALUES (99, 'md5-a', '', 1, 'Folder', '', 0);
                    """
                )
                conn.commit()
            finally:
                conn.close()

            dataset_df = compressor.load_current_dataset(str(db_path))
            record = dataset_df.to_dicts()[0]

        self.assertEqual(dataset_df.columns, compressor.OUTPUT_COLUMNS)
        self.assertEqual(record["sha256"], "sha-a")
        self.assertEqual(record["maxbpm"], 180.5)
        self.assertIsNone(record["total"])
        self.assertEqual(record["tables"], '["Table ★Folder"]')


if __name__ == "__main__":
    unittest.main()
