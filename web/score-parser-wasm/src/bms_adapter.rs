use std::collections::BTreeMap;

use bms_rs::bms::command::channel::mapper::{KeyLayoutBeat, KeyLayoutPms};
use bms_rs::bms::command::channel::{Key, NoteKind, PlayerSide};
use bms_rs::bms::rng::JavaRandom;
use bms_rs::bms::{default_config_with_rng, parse_bms};
use bms_rs::chart_process::processor::bms::BmsProcessor;
use bms_rs::chart_process::{ChartEvent, YCoordinate};

use crate::decode::decode_bms_text;
use crate::dto::{
    ParseScoreResult, ParsedBarLine, ParsedBpmChange, ParsedNote, ParsedNoteKind,
    ParsedScore, ParsedScoreErrorType, ParsedSide, ParsedStop, ScoreFormat, ScoreMode,
    TextEncoding,
};
use crate::warning_map::bms_warning_to_parsed;

pub fn parse_bms_bytes(
    bytes: &[u8],
    text_encoding: TextEncoding,
    sha256: Option<String>,
) -> ParseScoreResult {
    let source = match decode_bms_text(bytes, text_encoding) {
        Ok(value) => value,
        Err((error_type, message)) => return ParseScoreResult::failure(error_type, message),
    };

    let seed = deterministic_seed(sha256.as_deref());

    let beat_output = parse_bms(
        &source,
        default_config_with_rng(JavaRandom::new(seed)).key_mapper::<KeyLayoutBeat>(),
    );
    let beat_bms = match beat_output.bms {
        Ok(value) => value,
        Err(error) => {
            return ParseScoreResult::failure(ParsedScoreErrorType::ParseFailure, error.to_string());
        }
    };
    let beat_chart = match BmsProcessor::parse::<KeyLayoutBeat>(&beat_bms) {
        Ok(value) => value,
        Err(error) => {
            return ParseScoreResult::failure(ParsedScoreErrorType::ParseFailure, error.to_string());
        }
    };

    if is_pms_candidate(&beat_chart) {
        let pms_output = parse_bms(
            &source,
            default_config_with_rng(JavaRandom::new(seed)).key_mapper::<KeyLayoutPms>(),
        );
        let pms_bms = match pms_output.bms {
            Ok(value) => value,
            Err(error) => {
                return ParseScoreResult::failure(
                    ParsedScoreErrorType::ParseFailure,
                    error.to_string(),
                );
            }
        };
        let pms_chart = match BmsProcessor::parse::<KeyLayoutPms>(&pms_bms) {
            Ok(value) => value,
            Err(error) => {
                return ParseScoreResult::failure(
                    ParsedScoreErrorType::ParseFailure,
                    error.to_string(),
                );
            }
        };
        return build_score_from_chart(
            &pms_chart,
            ScoreFormat::Bms,
            ScoreMode::NineKey,
            sha256,
            pms_output
                .warnings
                .iter()
                .map(bms_warning_to_parsed)
                .collect(),
            StopEncoding::BmsBeats,
        );
    }

    let mode = match detect_beat_mode(&beat_chart) {
        Ok(value) => value,
        Err(message) => {
            return ParseScoreResult::failure(ParsedScoreErrorType::UnsupportedMode, message);
        }
    };

    build_score_from_chart(
        &beat_chart,
        ScoreFormat::Bms,
        mode,
        sha256,
        beat_output
            .warnings
            .iter()
            .map(bms_warning_to_parsed)
            .collect(),
        StopEncoding::BmsBeats,
    )
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum StopEncoding {
    BmsBeats,
    BmsonPulses { resolution: u64 },
}

#[derive(Debug, Clone)]
struct TimingPoint {
    y: f64,
    time_pre: f64,
    time_post: f64,
    bpm_after: f64,
}

pub(crate) fn build_score_from_chart(
    chart: &bms_rs::chart_process::processor::PlayableChart,
    format: ScoreFormat,
    mode: ScoreMode,
    sha256: Option<String>,
    warnings: Vec<crate::dto::ParsedWarning>,
    stop_encoding: StopEncoding,
) -> ParseScoreResult {
    let lane_count = lane_count_for_mode(mode);
    let timing = TimingMap::from_chart(chart, stop_encoding);

    let mut notes = Vec::new();
    let mut bar_lines = Vec::new();
    let mut bpm_changes = Vec::new();
    let mut stops = Vec::new();
    let mut total_duration_sec = 0.0f64;

    for event in chart.events().as_events() {
        let time_sec = event.activate_time().as_secs_f64().max(0.0);
        total_duration_sec = total_duration_sec.max(time_sec);
        match event.event() {
            ChartEvent::Note {
                side,
                key,
                kind,
                length,
                ..
            } => {
                let lane = match map_lane(mode, *side, *key) {
                    Some(value) => value,
                    None => {
                        return ParseScoreResult::failure(
                            ParsedScoreErrorType::UnsupportedMode,
                            format!("Unsupported lane mapping for mode {mode:?}: {side:?} {key:?}"),
                        );
                    }
                };
                let end_time_sec = length.as_ref().map(|value| {
                    let end_y = event.position().as_f64() + value.as_f64();
                    timing.seconds_at_y(end_y)
                });
                if let Some(end_time_sec) = end_time_sec {
                    total_duration_sec = total_duration_sec.max(end_time_sec);
                }
                notes.push(ParsedNote {
                    lane,
                    time_sec,
                    end_time_sec,
                    kind: map_note_kind(*kind),
                    side: parsed_side_for_mode(mode, *side),
                });
            }
            ChartEvent::BarLine => {
                bar_lines.push(ParsedBarLine { time_sec });
            }
            ChartEvent::BpmChange { bpm } => {
                bpm_changes.push(ParsedBpmChange {
                    time_sec,
                    bpm: bpm.as_f64(),
                });
            }
            ChartEvent::Stop { duration } => {
                let duration_sec =
                    timing.stop_duration_seconds(event.position().as_f64(), duration.as_f64());
                total_duration_sec = total_duration_sec.max(time_sec + duration_sec);
                stops.push(ParsedStop {
                    time_sec,
                    duration_sec,
                });
            }
            _ => {}
        }
    }

    notes.sort_by(|a, b| {
        a.time_sec
            .total_cmp(&b.time_sec)
            .then(a.lane.cmp(&b.lane))
            .then(a.end_time_sec.unwrap_or(-1.0).total_cmp(&b.end_time_sec.unwrap_or(-1.0)))
    });
    bar_lines.sort_by(|a, b| a.time_sec.total_cmp(&b.time_sec));
    bpm_changes.sort_by(|a, b| a.time_sec.total_cmp(&b.time_sec));
    stops.sort_by(|a, b| a.time_sec.total_cmp(&b.time_sec));

    ParseScoreResult::success(ParsedScore {
        sha256,
        format,
        mode,
        lane_count,
        total_duration_sec,
        notes,
        bar_lines,
        bpm_changes,
        stops,
        warnings,
    })
}

struct TimingMap {
    points: Vec<TimingPoint>,
    stop_encoding: StopEncoding,
}

impl TimingMap {
    fn from_chart(
        chart: &bms_rs::chart_process::processor::PlayableChart,
        stop_encoding: StopEncoding,
    ) -> Self {
        let mut bpm_changes: BTreeMap<i64, f64> = BTreeMap::new();
        let mut stop_durations: BTreeMap<i64, f64> = BTreeMap::new();

        for event in chart.events().as_events() {
            let key = y_bucket_key(event.position());
            match event.event() {
                ChartEvent::BpmChange { bpm } => {
                    bpm_changes.insert(key, bpm.as_f64());
                }
                ChartEvent::Stop { duration } => {
                    *stop_durations.entry(key).or_insert(0.0) += duration.as_f64();
                }
                _ => {}
            }
        }

        let mut point_keys: Vec<i64> = bpm_changes
            .keys()
            .chain(stop_durations.keys())
            .copied()
            .collect();
        point_keys.push(y_bucket_key(&YCoordinate::ZERO));
        point_keys.sort_unstable();
        point_keys.dedup();

        let mut points = Vec::new();
        let mut prev_y = 0.0f64;
        let mut prev_time_post = 0.0f64;
        let mut current_bpm = chart.init_bpm().as_f64();

        for point_key in point_keys {
            let y = bucket_key_to_y(point_key);
            let time_pre = if y <= prev_y {
                prev_time_post
            } else {
                prev_time_post + ((y - prev_y) * 240.0 / current_bpm)
            };
            let bpm_after = bpm_changes.get(&point_key).copied().unwrap_or(current_bpm);
            let stop_secs = match stop_durations.get(&point_key).copied() {
                Some(raw_stop) => stop_duration_from_raw(stop_encoding, raw_stop, bpm_after),
                None => 0.0,
            };
            let time_post = time_pre + stop_secs;
            points.push(TimingPoint {
                y,
                time_pre,
                time_post,
                bpm_after,
            });
            prev_y = y;
            prev_time_post = time_post;
            current_bpm = bpm_after;
        }

        if points.is_empty() {
            points.push(TimingPoint {
                y: 0.0,
                time_pre: 0.0,
                time_post: 0.0,
                bpm_after: chart.init_bpm().as_f64(),
            });
        }

        Self {
            points,
            stop_encoding,
        }
    }

    fn seconds_at_y(&self, y: f64) -> f64 {
        let point = self.point_at_or_before(y);
        if (y - point.y).abs() < 1e-12 {
            point.time_pre
        } else {
            point.time_post + ((y - point.y).max(0.0) * 240.0 / point.bpm_after)
        }
    }

    fn stop_duration_seconds(&self, y: f64, raw_duration: f64) -> f64 {
        let bpm_after = self.point_at_or_before(y).bpm_after;
        stop_duration_from_raw(self.stop_encoding, raw_duration, bpm_after)
    }

    fn point_at_or_before(&self, y: f64) -> &TimingPoint {
        let mut best = &self.points[0];
        for point in &self.points {
            if point.y <= y + 1e-12 {
                best = point;
            } else {
                break;
            }
        }
        best
    }
}

fn stop_duration_from_raw(stop_encoding: StopEncoding, raw_duration: f64, bpm: f64) -> f64 {
    match stop_encoding {
        StopEncoding::BmsBeats => raw_duration * 60.0 / bpm,
        StopEncoding::BmsonPulses { resolution } => {
            raw_duration * 60.0 / (resolution as f64 * bpm)
        }
    }
}

fn y_bucket_key(position: &YCoordinate) -> i64 {
    (position.as_f64() * 1_000_000_000.0).round() as i64
}

fn bucket_key_to_y(value: i64) -> f64 {
    value as f64 / 1_000_000_000.0
}

fn deterministic_seed(sha256: Option<&str>) -> i64 {
    sha256
        .and_then(|value| value.get(..16))
        .and_then(|prefix| u64::from_str_radix(prefix, 16).ok())
        .map(|value| value as i64)
        .unwrap_or(1)
}

fn is_pms_candidate(chart: &bms_rs::chart_process::processor::PlayableChart) -> bool {
    let mut has_p2_key_2_to_5 = false;
    for event in chart.events().as_events() {
        let ChartEvent::Note { side, key, .. } = event.event() else {
            continue;
        };
        match (*side, *key) {
            (PlayerSide::Player1, Key::Key(1..=5)) => {}
            (PlayerSide::Player2, Key::Key(2..=5)) => {
                has_p2_key_2_to_5 = true;
            }
            _ => return false,
        }
    }
    has_p2_key_2_to_5
}

fn detect_beat_mode(
    chart: &bms_rs::chart_process::processor::PlayableChart,
) -> Result<ScoreMode, String> {
    let mut has_p2 = false;
    let mut has_key_6_or_7 = false;
    for event in chart.events().as_events() {
        let ChartEvent::Note { side, key, .. } = event.event() else {
            continue;
        };
        match key {
            Key::Key(1..=5) => {}
            Key::Key(6..=7) => has_key_6_or_7 = true,
            Key::Scratch(1) => {}
            _ => return Err(format!("Unsupported beat key: {key:?}")),
        }
        if matches!(side, PlayerSide::Player2) {
            has_p2 = true;
        }
    }

    Ok(match (has_p2, has_key_6_or_7) {
        (false, false) => ScoreMode::FiveKey,
        (false, true) => ScoreMode::SevenKey,
        (true, false) => ScoreMode::TenKey,
        (true, true) => ScoreMode::FourteenKey,
    })
}

fn map_note_kind(kind: NoteKind) -> ParsedNoteKind {
    match kind {
        NoteKind::Visible => ParsedNoteKind::Normal,
        NoteKind::Long => ParsedNoteKind::Long,
        NoteKind::Landmine => ParsedNoteKind::Mine,
        NoteKind::Invisible => ParsedNoteKind::Invisible,
    }
}

fn parsed_side_for_mode(mode: ScoreMode, side: PlayerSide) -> Option<ParsedSide> {
    match mode {
        ScoreMode::NineKey | ScoreMode::Unknown => None,
        _ => Some(match side {
            PlayerSide::Player1 => ParsedSide::P1,
            PlayerSide::Player2 => ParsedSide::P2,
        }),
    }
}

pub(crate) fn lane_count_for_mode(mode: ScoreMode) -> u32 {
    match mode {
        ScoreMode::FiveKey => 6,
        ScoreMode::SevenKey => 8,
        ScoreMode::NineKey => 9,
        ScoreMode::TenKey => 12,
        ScoreMode::FourteenKey => 16,
        ScoreMode::Unknown => 0,
    }
}

pub(crate) fn map_lane(mode: ScoreMode, side: PlayerSide, key: Key) -> Option<u32> {
    match mode {
        ScoreMode::FiveKey => match (side, key) {
            (PlayerSide::Player1, Key::Scratch(1)) => Some(0),
            (PlayerSide::Player1, Key::Key(n @ 1..=5)) => Some(n as u32),
            _ => None,
        },
        ScoreMode::SevenKey => match (side, key) {
            (PlayerSide::Player1, Key::Scratch(1)) => Some(0),
            (PlayerSide::Player1, Key::Key(n @ 1..=7)) => Some(n as u32),
            _ => None,
        },
        ScoreMode::NineKey => match key {
            Key::Key(n @ 1..=9) => Some((n - 1) as u32),
            _ => None,
        },
        ScoreMode::TenKey => match (side, key) {
            (PlayerSide::Player1, Key::Scratch(1)) => Some(0),
            (PlayerSide::Player1, Key::Key(n @ 1..=5)) => Some(n as u32),
            (PlayerSide::Player2, Key::Scratch(1)) => Some(6),
            (PlayerSide::Player2, Key::Key(n @ 1..=5)) => Some((n + 6) as u32),
            _ => None,
        },
        ScoreMode::FourteenKey => match (side, key) {
            (PlayerSide::Player1, Key::Scratch(1)) => Some(0),
            (PlayerSide::Player1, Key::Key(n @ 1..=7)) => Some(n as u32),
            (PlayerSide::Player2, Key::Scratch(1)) => Some(8),
            (PlayerSide::Player2, Key::Key(n @ 1..=7)) => Some((n + 8) as u32),
            _ => None,
        },
        ScoreMode::Unknown => None,
    }
}
