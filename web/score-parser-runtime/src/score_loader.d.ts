export type ScoreFormat = "bms" | "bmson";
export type ScoreMode = "5k" | "7k" | "9k" | "10k" | "14k" | "24k" | "48k" | "popn-5k" | "popn-9k" | "unknown";
export type ParsedNoteKind = "normal" | "long" | "mine" | "invisible";
export type ParsedLongNoteType = "ln" | "cn" | "hcn";
export type ParsedComboEventKind = "normal" | "long-start" | "long-end";
export type ParsedSide = "p1" | "p2";
export type ParsedWarningType = "parse_warning" | "decode_warning";
export type ParsedScoreErrorType =
    | "decode_failure"
    | "parse_failure"
    | "unsupported_mode"
    | "invalid_options";
export type FormatHint = "bms" | "bmson" | "auto";
export type TextEncoding = "shift_jis" | "utf-8" | "auto";
export type CompressedScoreSource = "memory" | "idb" | "network";
export type ScorePathStyle = "sharded" | "flat";
export type ScoreLoaderErrorType =
    | "invalid_sha256"
    | "network_failure"
    | "idb_failure"
    | "decompression_unsupported"
    | "decompression_failure"
    | "parse_failure";

export type ParseOptions = {
    formatHint?: FormatHint;
    textEncoding?: TextEncoding;
    sha256?: string;
};

export type ParsedNote = {
    lane: number;
    beat: number;
    timeSec: number;
    endBeat?: number;
    endTimeSec?: number;
    kind: ParsedNoteKind;
    longNoteType?: ParsedLongNoteType;
    side?: ParsedSide;
};

export type ParsedComboEvent = {
    lane: number;
    beat: number;
    timeSec: number;
    kind: ParsedComboEventKind;
    side?: ParsedSide;
};

export type ParsedBarLine = {
    beat: number;
    timeSec: number;
};

export type ParsedBpmChange = {
    beat: number;
    timeSec: number;
    bpm: number;
    effectiveBpm?: number;
};

export type ParsedStop = {
    beat: number;
    timeSec: number;
    stopBeats: number;
    durationSec: number;
};

export type ParsedScrollChange = {
    beat: number;
    timeSec: number;
    rate: number;
};

export type ParsedTimingAction = {
    type: "bpm" | "stop";
    beat: number;
    timeSec: number;
    bpm?: number;
    displayBpm?: number;
    effectiveBpm?: number;
    forceMarker?: boolean;
    stopBeats?: number;
    durationSec?: number;
    stopResolution?: "resolved" | "invalid";
    stopLunaticBehavior?: "normal" | "warp";
};

export type ParsedWarning = {
    type: ParsedWarningType;
    message: string;
};

export type ParsedNoteCounts = {
    visible: number;
    normal: number;
    long: number;
    invisible: number;
    mine: number;
    all: number;
};

export type ParsedScoreError = {
    type: ParsedScoreErrorType;
    message: string;
};

export type ParsedScore = {
    sha256?: string;
    format: ScoreFormat;
    mode: ScoreMode;
    laneCount: number;
    initialBpm: number;
    totalDurationSec: number;
    lastPlayableTimeSec: number;
    lastTimelineTimeSec: number;
    noteCounts: ParsedNoteCounts;
    notes: ParsedNote[];
    comboEvents: ParsedComboEvent[];
    barLines: ParsedBarLine[];
    bpmChanges: ParsedBpmChange[];
    stops: ParsedStop[];
    scrollChanges: ParsedScrollChange[];
    timingActions: ParsedTimingAction[];
    warnings: ParsedWarning[];
};

export type CompressedScoreResult = {
    sha256: string;
    source: CompressedScoreSource;
    bytes: Uint8Array;
    byteLength: number;
    url: string;
};

export type DecompressedScoreResult = {
    sha256: string;
    compressedSource: CompressedScoreSource;
    compressedByteLength: number;
    bytes: Uint8Array;
    byteLength: number;
    url: string;
};

export type ParsedScoreLoadResult = {
    sha256: string;
    compressedSource: CompressedScoreSource;
    parserVersion: string;
    score: ParsedScore;
};

export type CompressedScoreCacheRecord = {
    sha256: string;
    url: string;
    gzipBytes: ArrayBuffer;
    gzipByteLength: number;
    fetchedAt: number;
};

export type ScoreSourceConfig = {
    baseUrl: string;
    pathStyle?: ScorePathStyle;
};

export type ScoreLoaderConfig = {
    scoreBaseUrl?: string;
    scoreSources?: ScoreSourceConfig[];
    dbName?: string;
};

export type ScoreLoader = {
    resolveScoreUrl(sha256: string): string;
    loadCompressedScore(sha256: string): Promise<CompressedScoreResult>;
    loadDecompressedScoreBytes(sha256: string): Promise<DecompressedScoreResult>;
    loadParsedScore(
        sha256: string,
        options?: ParseOptions,
    ): Promise<ParsedScoreLoadResult>;
    prefetchScore(sha256: string): Promise<void>;
    clearMemoryCache(): void;
    clearIndexedDbCache(): Promise<void>;
};

export class ScoreLoaderError extends Error {
    readonly type: ScoreLoaderErrorType;
    readonly cause?: unknown;
    constructor(
        type: ScoreLoaderErrorType,
        message: string,
        options?: { cause?: unknown },
    );
}

export const SCORE_PARSER_VERSION: string;
export const SCORE_LOADER_DB_NAME: string;
export const SCORE_LOADER_STORE_NAME: string;

export function createScoreLoader(config?: ScoreLoaderConfig): ScoreLoader;
