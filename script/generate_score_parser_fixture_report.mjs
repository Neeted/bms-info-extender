import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { parseScoreBytes } from "../web/score-parser-runtime/src/score_parser_runtime.js";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const FIXTURE_DIR = path.join(REPO_ROOT, "web", "score-parser-runtime", "fixtures", "oracle");

for (const fileName of readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"))) {
  const fixturePath = path.join(FIXTURE_DIR, fileName);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const gzipPath = path.join(REPO_ROOT, "site", "score", fixture.sha256.slice(0, 2), `${fixture.sha256}.gz`);
  if (!existsSync(gzipPath)) {
    console.log(JSON.stringify({ sha256: fixture.sha256, missing: true }, null, 2));
    continue;
  }
  const result = parseScoreBytes(gunzipSync(readFileSync(gzipPath)), {
    formatHint: fixture.format,
    sha256: fixture.sha256,
  });
  if (!result.ok) {
    console.log(JSON.stringify({ sha256: fixture.sha256, error: result.error }, null, 2));
    continue;
  }
  const score = result.score;
  console.log(JSON.stringify({
    sha256: fixture.sha256,
    mode: score.mode,
    laneCount: score.laneCount,
    noteCount: score.noteCounts.visible,
    noteCounts: score.noteCounts,
    bpmChangesCount: score.bpmChanges.length,
    stopsCount: score.stops.length,
    lastPlayableTimeSec: score.lastPlayableTimeSec,
    lastTimelineTimeSec: score.lastTimelineTimeSec,
    sampleNotes: score.notes.slice(0, 3).map((note) => ({
      lane: note.lane,
      kind: note.kind,
      timeSec: note.timeSec,
    })),
  }, null, 2));
}
