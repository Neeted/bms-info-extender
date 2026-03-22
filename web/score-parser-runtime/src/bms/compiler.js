const MATCHERS = {
  random: /^#RANDOM\s+(\d+)$/i,
  if: /^#IF\s+(\d+)$/i,
  else: /^#ELSE$/i,
  endif: /^#ENDIF$/i,
  timeSignature: /^#(\d{3})02:(\S*)$/i,
  channel: /^#(?:EXT\s+#)?(\d{3})([A-Z0-9]{2}):(\S*)$/i,
  header: /^#([A-Z0-9_]+)(?:\s+(\S.*))?$/i,
};

export function compileBms(text, { rng, timeSignatures }) {
  const chart = {
    headers: new Map(),
    timeSignatures,
    objects: [],
  };
  const warnings = [];
  const randomStack = [];
  const branchStack = [];
  let skipDepth = 0;
  let objectIndex = 0;

  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (line === "" || !line.startsWith("#")) {
      continue;
    }

    let match = line.match(MATCHERS.random);
    if (match) {
      const max = Number.parseInt(match[1], 10);
      randomStack.push(rng(max));
      continue;
    }

    match = line.match(MATCHERS.if);
    if (match) {
      const expectedValue = Number.parseInt(match[1], 10);
      const randomValue = randomStack[randomStack.length - 1];
      const matched = randomValue === expectedValue;
      const skip = skipDepth > 0 || !matched;
      branchStack.push({ parentSkipped: skipDepth > 0, matched, elseUsed: false, skip });
      if (skip) {
        skipDepth += 1;
      }
      continue;
    }

    match = line.match(MATCHERS.else);
    if (match) {
      const frame = branchStack[branchStack.length - 1];
      if (!frame || frame.elseUsed) {
        warnings.push({ type: "parse_warning", message: `Ignored stray #ELSE at line ${lineNumber}.` });
        continue;
      }
      frame.elseUsed = true;
      const nextSkip = frame.parentSkipped || frame.matched;
      if (frame.skip && !nextSkip) {
        skipDepth -= 1;
      } else if (!frame.skip && nextSkip) {
        skipDepth += 1;
      }
      frame.skip = nextSkip;
      continue;
    }

    match = line.match(MATCHERS.endif);
    if (match) {
      const frame = branchStack.pop();
      if (!frame) {
        warnings.push({ type: "parse_warning", message: `Ignored stray #ENDIF at line ${lineNumber}.` });
        continue;
      }
      if (frame.skip) {
        skipDepth -= 1;
      }
      continue;
    }

    if (skipDepth > 0) {
      continue;
    }

    match = line.match(MATCHERS.timeSignature);
    if (match) {
      const measure = Number.parseInt(match[1], 10);
      const value = Number.parseFloat(match[2]);
      if (Number.isFinite(value) && value > 0) {
        chart.timeSignatures.set(measure, value);
      } else {
        warnings.push({
          type: "parse_warning",
          message: `Ignored invalid measure length at line ${lineNumber}: ${line}`,
        });
      }
      continue;
    }

    match = line.match(MATCHERS.channel);
    if (match) {
      const measure = Number.parseInt(match[1], 10);
      const channel = match[2].toUpperCase();
      const payload = match[3].trim();
      const itemCount = Math.floor(payload.length / 2);
      if (itemCount === 0) {
        continue;
      }
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        const value = payload.slice(itemIndex * 2, itemIndex * 2 + 2).toUpperCase();
        if (value === "00") {
          continue;
        }
        chart.objects.push({
          index: objectIndex,
          lineNumber,
          measure,
          channel,
          value,
          fraction: itemIndex / itemCount,
        });
        objectIndex += 1;
      }
      continue;
    }

    match = line.match(MATCHERS.header);
    if (match) {
      const key = match[1].toUpperCase();
      const value = match[2] ?? "";
      chart.headers.set(key, value.trim());
      continue;
    }

    warnings.push({ type: "parse_warning", message: `Ignored malformed command at line ${lineNumber}: ${line}` });
  }

  if (branchStack.length > 0) {
    warnings.push({ type: "parse_warning", message: "Found unterminated #IF block." });
  }

  return { chart, warnings };
}
