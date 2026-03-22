use crate::bms_adapter::parse_bms_bytes;
use crate::bmson_adapter::parse_bmson_bytes;
use crate::dto::{
    ParseScoreFailure, ParseScoreResult, ParseScoreSuccess, ParsedNoteKind, ParsedScoreErrorType,
    ScoreFormat, ScoreMode, TextEncoding,
};

fn unwrap_success(result: ParseScoreResult) -> ParseScoreSuccess {
    match result {
        ParseScoreResult::Success(value) => value,
        ParseScoreResult::Failure(ParseScoreFailure { error, .. }) => {
            panic!("expected success, got failure: {:?}", error)
        }
    }
}

#[test]
fn bms_5k_lane_mapping_is_normalized() {
    let source = br#"
#PLAYER 1
#BPM 120
#00116:01
#00111:01
#00115:01
"#;
    let result = unwrap_success(parse_bms_bytes(
        source,
        TextEncoding::ShiftJis,
        Some("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string()),
    ));
    assert_eq!(result.score.format, ScoreFormat::Bms);
    assert_eq!(result.score.mode, ScoreMode::FiveKey);
    assert_eq!(result.score.lane_count, 6);
    assert!(result.score.notes.iter().any(|note| note.lane == 0));
    assert!(result.score.notes.iter().any(|note| note.lane == 1));
    assert!(result.score.notes.iter().any(|note| note.lane == 5));
}

#[test]
fn bms_7k_lane_mapping_is_normalized() {
    let source = br#"
#PLAYER 1
#BPM 120
#00116:01
#00118:01
#00119:01
"#;
    let result = unwrap_success(parse_bms_bytes(source, TextEncoding::ShiftJis, None));
    assert_eq!(result.score.mode, ScoreMode::SevenKey);
    assert!(result.score.notes.iter().any(|note| note.lane == 0));
    assert!(result.score.notes.iter().any(|note| note.lane == 6));
    assert!(result.score.notes.iter().any(|note| note.lane == 7));
}

#[test]
fn bms_pms_auto_detects_to_9k() {
    let source = br#"
#PLAYER 1
#BPM 120
#00111:01
#00112:01
#00122:01
#00125:01
"#;
    let result = unwrap_success(parse_bms_bytes(source, TextEncoding::ShiftJis, None));
    assert_eq!(result.score.mode, ScoreMode::NineKey);
    assert_eq!(result.score.lane_count, 9);
}

#[test]
fn bms_dp_detects_10k_and_14k() {
    let ten_key = br#"
#PLAYER 3
#BPM 120
#00111:01
#00121:01
#00126:01
"#;
    let ten_key_result = unwrap_success(parse_bms_bytes(ten_key, TextEncoding::ShiftJis, None));
    assert_eq!(ten_key_result.score.mode, ScoreMode::TenKey);

    let fourteen_key = br#"
#PLAYER 3
#BPM 120
#00111:01
#00121:01
#00128:01
"#;
    let fourteen_key_result =
        unwrap_success(parse_bms_bytes(fourteen_key, TextEncoding::ShiftJis, None));
    assert_eq!(fourteen_key_result.score.mode, ScoreMode::FourteenKey);
}

#[test]
fn bmson_modes_are_detected() {
    let beat_json = br#"{
        "version": "1.0.0",
        "info": {
            "title": "Test",
            "artist": "",
            "genre": "",
            "level": 1,
            "init_bpm": 120.0,
            "resolution": 240,
            "mode_hint": "beat-7k"
        },
        "sound_channels": [
            {
                "name": "test.wav",
                "notes": [
                    { "x": 8, "y": 0, "l": 0, "c": false },
                    { "x": 7, "y": 240, "l": 0, "c": false }
                ]
            }
        ]
    }"#;
    let beat_result = unwrap_success(parse_bmson_bytes(beat_json, TextEncoding::Utf8, None));
    assert_eq!(beat_result.score.format, ScoreFormat::Bmson);
    assert_eq!(beat_result.score.mode, ScoreMode::SevenKey);

    let pms_json = br#"{
        "version": "1.0.0",
        "info": {
            "title": "Test",
            "artist": "",
            "genre": "",
            "level": 1,
            "init_bpm": 120.0,
            "resolution": 240,
            "mode_hint": "popn-9k"
        },
        "sound_channels": [
            {
                "name": "test.wav",
                "notes": [
                    { "x": 1, "y": 0, "l": 0, "c": false },
                    { "x": 9, "y": 240, "l": 0, "c": false }
                ]
            }
        ]
    }"#;
    let pms_result = unwrap_success(parse_bmson_bytes(pms_json, TextEncoding::Utf8, None));
    assert_eq!(pms_result.score.mode, ScoreMode::NineKey);
}

#[test]
fn long_note_has_end_time() {
    let source = br#"
#PLAYER 1
#BPM 120
#00151:01
#00251:01
"#;
    let result = unwrap_success(parse_bms_bytes(source, TextEncoding::ShiftJis, None));
    let long_note = result
        .score
        .notes
        .iter()
        .find(|note| note.kind == ParsedNoteKind::Long)
        .expect("expected long note");
    let end_time_sec = long_note.end_time_sec.expect("expected LN end time");
    assert!(end_time_sec > long_note.time_sec);
}

#[test]
fn random_branch_is_deterministic_for_same_sha256() {
    let source = br#"
#PLAYER 1
#BPM 120
#RANDOM 2
#IF 1
#00111:01
#ENDIF
#IF 2
#00112:01
#ENDIF
"#;
    let sha256 =
        Some("aaaaaaaaaaaaaaaa0123456789abcdef0123456789abcdef0123456789abcdef".to_string());
    let first = unwrap_success(parse_bms_bytes(
        source,
        TextEncoding::ShiftJis,
        sha256.clone(),
    ));
    let second = unwrap_success(parse_bms_bytes(source, TextEncoding::ShiftJis, sha256));
    assert_eq!(first.score.notes, second.score.notes);
}

#[test]
fn decode_failure_is_structured() {
    let result = parse_bms_bytes(&[0x81], TextEncoding::ShiftJis, None);
    match result {
        ParseScoreResult::Failure(failure) => {
            assert_eq!(failure.error.r#type, ParsedScoreErrorType::DecodeFailure);
        }
        ParseScoreResult::Success(_) => panic!("expected failure"),
    }
}
