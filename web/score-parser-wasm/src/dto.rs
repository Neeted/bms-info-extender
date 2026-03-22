use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScoreFormat {
    Bms,
    Bmson,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScoreMode {
    #[serde(rename = "5k")]
    FiveKey,
    #[serde(rename = "7k")]
    SevenKey,
    #[serde(rename = "9k")]
    NineKey,
    #[serde(rename = "10k")]
    TenKey,
    #[serde(rename = "14k")]
    FourteenKey,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParsedNoteKind {
    Normal,
    Long,
    Mine,
    Invisible,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ParsedSide {
    #[serde(rename = "p1")]
    P1,
    #[serde(rename = "p2")]
    P2,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedNote {
    pub lane: u32,
    pub time_sec: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time_sec: Option<f64>,
    pub kind: ParsedNoteKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<ParsedSide>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBarLine {
    pub time_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBpmChange {
    pub time_sec: f64,
    pub bpm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedStop {
    pub time_sec: f64,
    pub duration_sec: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParsedWarningType {
    ParseWarning,
    DecodeWarning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedWarning {
    pub r#type: ParsedWarningType,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParsedScoreErrorType {
    DecodeFailure,
    ParseFailure,
    UnsupportedMode,
    InvalidOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedScoreError {
    pub r#type: ParsedScoreErrorType,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedScore {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    pub format: ScoreFormat,
    pub mode: ScoreMode,
    pub lane_count: u32,
    pub total_duration_sec: f64,
    pub notes: Vec<ParsedNote>,
    pub bar_lines: Vec<ParsedBarLine>,
    pub bpm_changes: Vec<ParsedBpmChange>,
    pub stops: Vec<ParsedStop>,
    pub warnings: Vec<ParsedWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParseScoreSuccess {
    pub ok: bool,
    pub score: ParsedScore,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParseScoreFailure {
    pub ok: bool,
    pub error: ParsedScoreError,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ParseScoreResult {
    Success(ParseScoreSuccess),
    Failure(ParseScoreFailure),
}

impl ParseScoreResult {
    pub fn success(score: ParsedScore) -> Self {
        Self::Success(ParseScoreSuccess { ok: true, score })
    }

    pub fn failure(error_type: ParsedScoreErrorType, message: impl Into<String>) -> Self {
        Self::Failure(ParseScoreFailure {
            ok: false,
            error: ParsedScoreError {
                r#type: error_type,
                message: message.into(),
            },
        })
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum FormatHint {
    #[serde(rename = "bms")]
    Bms,
    #[serde(rename = "bmson")]
    Bmson,
    #[serde(rename = "auto")]
    Auto,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TextEncoding {
    #[serde(rename = "shift_jis")]
    ShiftJis,
    #[serde(rename = "utf-8")]
    Utf8,
    #[serde(rename = "auto")]
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParseOptions {
    #[serde(default)]
    pub format_hint: Option<FormatHint>,
    #[serde(default)]
    pub text_encoding: Option<TextEncoding>,
    #[serde(default)]
    pub sha256: Option<String>,
}

impl Default for ParseOptions {
    fn default() -> Self {
        Self {
            format_hint: Some(FormatHint::Auto),
            text_encoding: Some(TextEncoding::Auto),
            sha256: None,
        }
    }
}
