use bms_rs::bmson::parse_bmson;
use bms_rs::chart_process::ChartEvent;
use bms_rs::chart_process::processor::bmson::BmsonProcessor;

use crate::bms_adapter::{build_score_from_chart, map_lane, StopEncoding};
use crate::decode::decode_bmson_text;
use crate::dto::{ParseScoreResult, ParsedScoreErrorType, ScoreFormat, ScoreMode, TextEncoding};
use crate::warning_map::bmson_warning_to_parsed;

pub fn parse_bmson_bytes(
    bytes: &[u8],
    text_encoding: TextEncoding,
    sha256: Option<String>,
) -> ParseScoreResult {
    let source = match decode_bmson_text(bytes, text_encoding) {
        Ok(value) => value,
        Err((error_type, message)) => return ParseScoreResult::failure(error_type, message),
    };

    let output = parse_bmson(&source);
    let warnings = output
        .errors
        .iter()
        .map(bmson_warning_to_parsed)
        .collect::<Vec<_>>();

    let Some(bmson) = output.bmson else {
        let message = if output.errors.is_empty() {
            "BMSON parse failed without diagnostic output".to_string()
        } else {
            output
                .errors
                .iter()
                .map(|error| format!("{error:?}"))
                .collect::<Vec<_>>()
                .join("; ")
        };
        return ParseScoreResult::failure(ParsedScoreErrorType::ParseFailure, message);
    };

    let chart = BmsonProcessor::parse(&bmson);
    let mode = match detect_bmson_mode(&bmson.info.mode_hint, &chart) {
        Ok(value) => value,
        Err(message) => {
            return ParseScoreResult::failure(ParsedScoreErrorType::UnsupportedMode, message);
        }
    };

    build_score_from_chart(
        &chart,
        ScoreFormat::Bmson,
        mode,
        sha256,
        warnings,
        StopEncoding::BmsonPulses {
            resolution: bmson.info.resolution.get(),
        },
    )
}

fn detect_bmson_mode(
    mode_hint: &str,
    chart: &bms_rs::chart_process::processor::PlayableChart,
) -> Result<ScoreMode, String> {
    let hint = mode_hint.to_ascii_lowercase();
    let mode = match hint.as_str() {
        "beat-5k" => ScoreMode::FiveKey,
        "beat-7k" => ScoreMode::SevenKey,
        "beat-10k" => ScoreMode::TenKey,
        "beat-14k" => ScoreMode::FourteenKey,
        _ => {
            if hint.starts_with("beat") {
                return Err(format!("Unsupported BMSON beat mode: {mode_hint}"));
            }
            let mut max_lane = 0u32;
            for event in chart.events().as_events() {
                let ChartEvent::Note { side, key, .. } = event.event() else {
                    continue;
                };
                let Some(lane) = map_lane(ScoreMode::NineKey, *side, *key) else {
                    return Err(format!("Unsupported BMSON non-beat lane: {side:?} {key:?}"));
                };
                max_lane = max_lane.max(lane + 1);
            }
            if max_lane <= 9 {
                ScoreMode::NineKey
            } else {
                return Err(format!("Unsupported BMSON mode_hint: {mode_hint}"));
            }
        }
    };

    for event in chart.events().as_events() {
        let ChartEvent::Note { side, key, .. } = event.event() else {
            continue;
        };
        if map_lane(mode, *side, *key).is_none() {
            return Err(format!(
                "BMSON note does not fit detected mode {mode:?}: {side:?} {key:?}"
            ));
        }
    }

    Ok(mode)
}
