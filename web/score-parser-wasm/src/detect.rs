use crate::dto::{FormatHint, TextEncoding};

pub fn normalize_format_hint(value: Option<FormatHint>) -> FormatHint {
    value.unwrap_or(FormatHint::Auto)
}

pub fn normalize_text_encoding(value: Option<TextEncoding>) -> TextEncoding {
    value.unwrap_or(TextEncoding::Auto)
}
