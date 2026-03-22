use encoding_rs::{SHIFT_JIS, UTF_8};

use crate::dto::{ParsedScoreErrorType, TextEncoding};

pub fn looks_like_bmson(bytes: &[u8]) -> bool {
    let (decoded, _, had_errors) = UTF_8.decode(bytes);
    if had_errors {
        return false;
    }
    strip_utf8_bom_and_trim_start(decoded.as_ref()).starts_with('{')
}

pub fn decode_bms_text(
    bytes: &[u8],
    requested: TextEncoding,
) -> Result<String, (ParsedScoreErrorType, String)> {
    match requested {
        TextEncoding::Utf8 => Err((
            ParsedScoreErrorType::InvalidOptions,
            "BMS family textEncoding must be shift_jis or auto in Phase 1".to_string(),
        )),
        TextEncoding::Auto | TextEncoding::ShiftJis => {
            let (decoded, _, had_errors) = SHIFT_JIS.decode(bytes);
            if had_errors {
                return Err((
                    ParsedScoreErrorType::DecodeFailure,
                    "Failed to decode BMS text as Shift_JIS".to_string(),
                ));
            }
            Ok(decoded.into_owned())
        }
    }
}

pub fn decode_bmson_text(
    bytes: &[u8],
    requested: TextEncoding,
) -> Result<String, (ParsedScoreErrorType, String)> {
    match requested {
        TextEncoding::ShiftJis => Err((
            ParsedScoreErrorType::InvalidOptions,
            "BMSON textEncoding must be utf-8 or auto in Phase 1".to_string(),
        )),
        TextEncoding::Auto | TextEncoding::Utf8 => {
            let (decoded, _, had_errors) = UTF_8.decode(bytes);
            if had_errors {
                return Err((
                    ParsedScoreErrorType::DecodeFailure,
                    "Failed to decode BMSON text as UTF-8".to_string(),
                ));
            }
            Ok(strip_utf8_bom(decoded.into_owned()))
        }
    }
}

fn strip_utf8_bom(input: String) -> String {
    input.strip_prefix('\u{feff}').unwrap_or(&input).to_string()
}

fn strip_utf8_bom_and_trim_start(input: &str) -> &str {
    input.strip_prefix('\u{feff}')
        .unwrap_or(input)
        .trim_start_matches(char::is_whitespace)
}
