use wasm_bindgen::prelude::*;

use crate::bms_adapter::parse_bms_bytes;
use crate::bmson_adapter::parse_bmson_bytes;
use crate::decode::looks_like_bmson;
use crate::detect::{normalize_format_hint, normalize_text_encoding};
use crate::dto::{FormatHint, ParseOptions, ParsedScoreErrorType, ParseScoreResult};

#[wasm_bindgen(js_name = parseScoreBytes)]
pub fn parse_score_bytes(bytes: &[u8], options: JsValue) -> JsValue {
    #[cfg(feature = "console-error-panic-hook")]
    console_error_panic_hook::set_once();

    let parsed_options = if options.is_undefined() || options.is_null() {
        ParseOptions::default()
    } else {
        match serde_wasm_bindgen::from_value::<ParseOptions>(options) {
            Ok(value) => value,
            Err(error) => {
                let result = ParseScoreResult::failure(
                    crate::dto::ParsedScoreErrorType::InvalidOptions,
                    format!("Failed to parse options: {error}"),
                );
                return serde_wasm_bindgen::to_value(&result).expect("serialize failure result");
            }
        }
    };

    let format_hint = normalize_format_hint(parsed_options.format_hint.clone());
    let text_encoding = normalize_text_encoding(parsed_options.text_encoding.clone());

    let result = match format_hint {
        FormatHint::Bms => parse_bms_bytes(bytes, text_encoding, parsed_options.sha256),
        FormatHint::Bmson => parse_bmson_bytes(bytes, text_encoding, parsed_options.sha256),
        FormatHint::Auto => {
            if looks_like_bmson(bytes) {
                let bmson_result =
                    parse_bmson_bytes(bytes, text_encoding, parsed_options.sha256.clone());
                match &bmson_result {
                    ParseScoreResult::Success(_) => bmson_result,
                    ParseScoreResult::Failure(failure)
                        if failure.error.r#type == ParsedScoreErrorType::ParseFailure =>
                    {
                        parse_bms_bytes(bytes, text_encoding, parsed_options.sha256)
                    }
                    ParseScoreResult::Failure(_) => bmson_result,
                }
            } else {
                parse_bms_bytes(bytes, text_encoding, parsed_options.sha256)
            }
        }
    };

    serde_wasm_bindgen::to_value(&result).expect("serialize parse result")
}

pub use parse_score_bytes as parseScoreBytes;
