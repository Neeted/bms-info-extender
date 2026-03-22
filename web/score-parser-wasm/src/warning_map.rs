use bms_rs::bms::BmsWarning;
use bms_rs::bmson::BmsonParseError;

use crate::dto::{ParsedWarning, ParsedWarningType};

pub fn bms_warning_to_parsed(warning: &BmsWarning) -> ParsedWarning {
    ParsedWarning {
        r#type: ParsedWarningType::ParseWarning,
        message: warning.to_string(),
    }
}

pub fn bmson_warning_to_parsed(warning: &BmsonParseError) -> ParsedWarning {
    ParsedWarning {
        r#type: ParsedWarningType::ParseWarning,
        message: format!("{warning:?}"),
    }
}
