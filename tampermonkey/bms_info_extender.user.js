// ==UserScript==
// @name         BMS Info Extender
// @namespace    https://github.com/Neeted
// @version      2.0.0
// @description  LR2IR、MinIR、Mocha、STELLAVERSEで詳細メタデータ、ノーツ分布/BPM推移グラフ、譜面ビューアなどを表示する
// @author       ﾏﾝﾊｯﾀﾝｶﾞｯﾌｪ
// @match        http://www.dream-pro.info/~lavalse/LR2IR/search.cgi*
// @match        https://stellabms.xyz/*
// @match        https://www.gaftalk.com/minir/*
// @match        https://mocha-repository.info/song.php*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_getResourceText
// @grant        GM_setValue
// @connect      bms.howan.jp
// @connect      bms-info-extender.netlify.app
// @resource     googlefont https://fonts.googleapis.com/css2?family=Inconsolata&family=Noto+Sans+JP&display=swap
// @updateURL    https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @downloadURL  https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @run-at       document-start
// ==/UserScript==
// 2.0.0 譜面ビューアを導入、ギミック譜面を含め実用可能と判断 ※一部ギミック譜面は既知の対応不足あり
//       TODO: 極端なBPM時のGameモードでのスクロールスピード考慮、バグ利用っぽいものをどこまで対応するか判断(負数STOP、緑数字指定でのSCROLL)
// 1.1.0 外部データ取得失敗時のフォールバック処理を追加(LR2IR、MochaでMD5や譜面ビューアへのリンクを表示)
// 1.0.5 誤字修正
// このファイルは script/build_preview_targets.mjs により生成されます。手編集しないでください。

(() => {
  // shared/preview-runtime/score-viewer-model.js
  var DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;
  var DEFAULT_EDITOR_PIXELS_PER_BEAT = 64;
  var DEFAULT_VIEWER_MODE = "time";
  var DEFAULT_INVISIBLE_NOTE_VISIBILITY = "hide";
  var TIME_SELECTION_EPSILON_SEC = 5e-4;
  var BEAT_SELECTION_EPSILON = 1e-6;
  var ACTION_PRECEDENCE = {
    bpm: 1,
    stop: 2
  };
  function normalizeViewerMode(value) {
    return value === "editor" || value === "game" || value === "time" ? value : DEFAULT_VIEWER_MODE;
  }
  function resolveViewerModeForModel(model, viewerMode) {
    const normalizedMode = normalizeViewerMode(viewerMode);
    if (normalizedMode === "editor" && model?.supportsEditorMode) {
      return "editor";
    }
    if (normalizedMode === "game" && model?.supportsGameMode) {
      return "game";
    }
    return DEFAULT_VIEWER_MODE;
  }
  function normalizeInvisibleNoteVisibility(value) {
    return value === "show" ? "show" : DEFAULT_INVISIBLE_NOTE_VISIBILITY;
  }
  function createScoreViewerModel(score) {
    if (!score) {
      return null;
    }
    const rawAllNotes = score.notes.map((note) => ({ ...note })).sort(compareNoteLike);
    const rawBarLines = [...score.barLines].sort(compareTimedBeatLike);
    const rawBpmChanges = [...score.bpmChanges].sort(compareTimedBeatLike);
    const rawStops = [...score.stops].sort(compareTimedBeatLike);
    const rawScrollChanges = [...score.scrollChanges ?? []].sort(compareTimedBeatLike);
    const comboEvents = (score.comboEvents?.length > 0 ? score.comboEvents : createFallbackComboEvents(score.notes)).map((event) => ({ ...event })).sort(compareComboEvent).map((event, index) => ({
      ...event,
      combo: index + 1
    }));
    const longEndEventKeys = new Set(
      comboEvents.filter((event) => event.kind === "long-end").map(createTimedLaneKey)
    );
    const beatTimingIndex = createBeatTimingIndex(score);
    const gameScrollIndex = createGameScrollIndex(rawScrollChanges);
    const allNotes = annotateNotesWithGameTrackPosition(rawAllNotes, gameScrollIndex);
    const notes = allNotes.filter((note) => note.kind !== "invisible");
    const invisibleNotes = allNotes.filter((note) => note.kind === "invisible");
    const barLines = annotateEventsWithGameTrackPosition(rawBarLines, gameScrollIndex);
    const bpmChanges = annotateEventsWithGameTrackPosition(rawBpmChanges, gameScrollIndex);
    const stops = annotateEventsWithGameTrackPosition(rawStops, gameScrollIndex);
    const scrollChanges = annotateEventsWithGameTrackPosition(rawScrollChanges, gameScrollIndex);
    const gameBarLinesByTrack = createGamePointIndex(barLines);
    const gameBpmChangesByTrack = createGamePointIndex(bpmChanges);
    const gameStopsByTrack = createGamePointIndex(stops);
    const gameScrollChangesByTrack = createGamePointIndex(scrollChanges);
    const gameTimeline = createGameTimeline({
      notes: allNotes,
      barLines,
      bpmChanges,
      stops,
      scrollChanges,
      gameScrollIndex
    });
    const totalBeat = getScoreTotalBeat(score);
    const editorNotes = notes.filter((note) => Number.isFinite(note.beat));
    const editorInvisibleNotes = invisibleNotes.filter((note) => Number.isFinite(note.beat));
    const notesByBeat = [...editorNotes].sort(compareBeatNoteLike);
    const invisibleNotesByBeat = [...editorInvisibleNotes].sort(compareBeatNoteLike);
    const longNotesByBeat = notesByBeat.filter((note) => note.kind === "long" && Number.isFinite(note.endBeat ?? note.beat));
    const longNotesByEndBeat = [...longNotesByBeat].sort(compareLongNoteEndBeat);
    const gameNotesByTrack = createGamePointIndex(notes);
    const gameInvisibleNotesByTrack = createGamePointIndex(invisibleNotes);
    const gameLongNotesByEndTrack = createGameLongEndIndex(notes);
    const gameLongBodiesByStartTrack = createGameLongBodyStartIndex(notes);
    const gameLongBodiesByEndTrack = [...gameLongBodiesByStartTrack].sort(compareGameLongBodyEndTrack);
    const measureRanges = createEditorMeasureRanges(barLines, totalBeat);
    return {
      score,
      notes,
      invisibleNotes,
      notesByBeat,
      invisibleNotesByBeat,
      longNotesByBeat,
      longNotesByEndBeat,
      gameNotesByTrack,
      gameInvisibleNotesByTrack,
      gameLongNotesByEndTrack,
      gameLongBodiesByStartTrack,
      gameLongBodiesByEndTrack,
      measureRanges,
      comboEvents,
      longEndEventKeys,
      barLines,
      bpmChanges,
      stops,
      scrollChanges,
      gameBarLinesByTrack,
      gameBpmChangesByTrack,
      gameStopsByTrack,
      gameScrollChangesByTrack,
      gameTimeline,
      totalCombo: comboEvents.length,
      beatTimingIndex,
      gameScrollIndex,
      totalBeat,
      supportsEditorMode: Boolean(beatTimingIndex && Number.isFinite(totalBeat)),
      supportsGameMode: Boolean(beatTimingIndex && gameScrollIndex && Number.isFinite(totalBeat))
    };
  }
  function getScoreTotalDurationSec(score) {
    if (!score || typeof score !== "object") {
      return 0;
    }
    const totalDurationSec = Number.isFinite(score.totalDurationSec) ? score.totalDurationSec : null;
    const lastTimelineTimeSec = Number.isFinite(score.lastTimelineTimeSec) ? score.lastTimelineTimeSec : null;
    const lastPlayableTimeSec = Number.isFinite(score.lastPlayableTimeSec) ? score.lastPlayableTimeSec : 0;
    return Math.max(totalDurationSec ?? lastTimelineTimeSec ?? lastPlayableTimeSec, 0);
  }
  function getScoreTotalBeat(score) {
    if (!score || typeof score !== "object") {
      return 0;
    }
    let maxBeat = 0;
    for (const note of score.notes ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(note.endBeat), finiteOrZero(note.beat));
    }
    for (const event of score.comboEvents ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
    }
    for (const event of score.barLines ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
    }
    for (const event of score.bpmChanges ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
    }
    for (const event of score.stops ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
    }
    for (const event of score.scrollChanges ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
    }
    for (const event of score.timingActions ?? []) {
      maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
    }
    return Math.max(maxBeat, 0);
  }
  function getClampedSelectedTimeSec(model, timeSec) {
    if (!model) {
      return 0;
    }
    const numericValue = Number.isFinite(timeSec) ? timeSec : 0;
    return clamp(numericValue, 0, getScoreTotalDurationSec(model.score));
  }
  function getClampedSelectedBeat(model, beat) {
    if (!model) {
      return 0;
    }
    const numericValue = Number.isFinite(beat) ? beat : 0;
    return clamp(numericValue, 0, model.totalBeat ?? 0);
  }
  function getBeatAtTimeSec(model, timeSec) {
    if (!model || !model.beatTimingIndex) {
      return 0;
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
    return getClampedSelectedBeat(model, model.beatTimingIndex.secondsToBeat(clampedTimeSec));
  }
  function getTimeSecForBeat(model, beat) {
    if (!model || !model.beatTimingIndex) {
      return 0;
    }
    const clampedBeat = getClampedSelectedBeat(model, beat);
    return clamp(model.beatTimingIndex.beatToSeconds(clampedBeat), 0, getScoreTotalDurationSec(model.score));
  }
  function getGameTrackPositionForBeat(model, beat) {
    if (!model?.gameScrollIndex) {
      return 0;
    }
    return model.gameScrollIndex.beatToDisplacement(getClampedSelectedBeat(model, beat));
  }
  function getGameTrackPositionAtTimeSec(model, timeSec) {
    if (!model?.gameScrollIndex) {
      return 0;
    }
    return getGameTrackPositionForBeat(model, getBeatAtTimeSec(model, timeSec));
  }
  function getContentHeightPx(model, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return Math.max(1, viewportHeight);
    }
    return Math.max(
      Math.max(1, viewportHeight),
      Math.ceil(getScoreTotalDurationSec(model.score) * pixelsPerSecond + viewportHeight)
    );
  }
  function getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return Math.max(1, viewportHeight);
    }
    return Math.max(
      Math.max(1, viewportHeight),
      Math.ceil((model.totalBeat ?? 0) * pixelsPerBeat + viewportHeight)
    );
  }
  function getTimeSecForScrollTop(model, scrollTop, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return 0;
    }
    return getClampedSelectedTimeSec(model, scrollTop / pixelsPerSecond);
  }
  function getTimeSecForEditorScrollTop(model, scrollTop, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return 0;
    }
    return getTimeSecForBeat(model, scrollTop / pixelsPerBeat);
  }
  function getScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return 0;
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
    const maxScrollTop = Math.max(0, getContentHeightPx(model, viewportHeight, pixelsPerSecond) - viewportHeight);
    return clamp(clampedTimeSec * pixelsPerSecond, 0, maxScrollTop);
  }
  function getEditorScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return 0;
    }
    const clampedBeat = getBeatAtTimeSec(model, timeSec);
    const maxScrollTop = Math.max(0, getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat) - viewportHeight);
    return clamp(clampedBeat * pixelsPerBeat, 0, maxScrollTop);
  }
  function getVisibleTimeRange(model, selectedTimeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return { startTimeSec: 0, endTimeSec: 0 };
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
    const halfViewportSec = viewportHeight / pixelsPerSecond / 2;
    const overscanSec = Math.max(halfViewportSec * 0.35, 0.75);
    return {
      startTimeSec: Math.max(0, clampedTimeSec - halfViewportSec - overscanSec),
      endTimeSec: Math.min(getScoreTotalDurationSec(model.score), clampedTimeSec + halfViewportSec + overscanSec)
    };
  }
  function getEditorFrameStateForBeat(model, selectedBeat, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return {
        selectedBeat: 0,
        startBeat: 0,
        endBeat: 0,
        viewportHeight: Math.max(viewportHeight, 0)
      };
    }
    const clampedBeat = getClampedSelectedBeat(model, selectedBeat);
    const halfViewportBeat = viewportHeight / pixelsPerBeat / 2;
    const overscanBeat = Math.max(halfViewportBeat * 0.35, 1);
    return {
      selectedBeat: clampedBeat,
      startBeat: Math.max(0, clampedBeat - halfViewportBeat - overscanBeat),
      endBeat: Math.min(model.totalBeat ?? 0, clampedBeat + halfViewportBeat + overscanBeat),
      viewportHeight
    };
  }
  function getEditorFrameState(model, selectedTimeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    return getEditorFrameStateForBeat(
      model,
      getBeatAtTimeSec(model, selectedTimeSec),
      viewportHeight,
      pixelsPerBeat
    );
  }
  function hasViewerSelectionChanged(model, viewerMode, previousTimeSec, nextTimeSec, previousBeat = void 0, nextBeat = void 0) {
    const resolvedMode = resolveViewerModeForModel(model, viewerMode);
    if (resolvedMode === "editor" && model?.supportsEditorMode) {
      const normalizedPreviousBeat = Number.isFinite(previousBeat) ? getClampedSelectedBeat(model, previousBeat) : getBeatAtTimeSec(model, previousTimeSec);
      const normalizedNextBeat = Number.isFinite(nextBeat) ? getClampedSelectedBeat(model, nextBeat) : getBeatAtTimeSec(model, nextTimeSec);
      return Math.abs(normalizedNextBeat - normalizedPreviousBeat) >= BEAT_SELECTION_EPSILON;
    }
    return Math.abs(
      getClampedSelectedTimeSec(model, nextTimeSec) - getClampedSelectedTimeSec(model, previousTimeSec)
    ) >= TIME_SELECTION_EPSILON_SEC;
  }
  function createEditorMeasureRanges(barLines, totalBeat) {
    const sortedBarLines = [...barLines ?? []].filter((barLine) => Number.isFinite(barLine?.beat)).sort(compareTimedBeatLike);
    const ranges = [];
    let previousBeat = 0;
    if (sortedBarLines.length === 0) {
      if (Number.isFinite(totalBeat) && totalBeat > 0) {
        ranges.push({ startBeat: 0, endBeat: totalBeat });
      }
      return ranges;
    }
    for (const barLine of sortedBarLines) {
      const currentBeat = barLine.beat;
      if (currentBeat > previousBeat) {
        ranges.push({ startBeat: previousBeat, endBeat: currentBeat });
      }
      previousBeat = currentBeat;
    }
    if (Number.isFinite(totalBeat) && totalBeat > previousBeat) {
      ranges.push({ startBeat: previousBeat, endBeat: totalBeat });
    }
    return ranges;
  }
  function getViewerCursor(model, selectedTimeSec, viewerMode = DEFAULT_VIEWER_MODE, selectedBeatOverride = void 0) {
    if (!model) {
      return {
        timeSec: 0,
        beat: 0,
        measureIndex: 0,
        totalMeasureIndex: 0,
        comboCount: 0,
        totalCombo: 0
      };
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
    const totalMeasureIndex = getTotalMeasureIndex(model);
    const resolvedMode = resolveViewerModeForModel(model, viewerMode);
    const selectedBeat = Number.isFinite(selectedBeatOverride) ? getClampedSelectedBeat(model, selectedBeatOverride) : getBeatAtTimeSec(model, clampedTimeSec);
    return {
      timeSec: clampedTimeSec,
      beat: resolvedMode === "time" ? 0 : selectedBeat,
      measureIndex: Math.min(getMeasureIndexAtTime(model, clampedTimeSec), totalMeasureIndex),
      totalMeasureIndex,
      comboCount: getComboCountAtTime(model, clampedTimeSec),
      totalCombo: model.totalCombo
    };
  }
  function getMeasureIndexAtTime(model, timeSec) {
    if (!model || model.barLines.length === 0) {
      return 0;
    }
    const index = upperBoundByTime(model.barLines, timeSec) - 1;
    return Math.max(0, index);
  }
  function getComboCountAtTime(model, timeSec) {
    if (!model || model.comboEvents.length === 0) {
      return 0;
    }
    return upperBoundByTime(model.comboEvents, timeSec);
  }
  function shouldDrawLongEndCap(model, note) {
    if (!model || note?.kind !== "long" || !Number.isFinite(note?.endTimeSec)) {
      return false;
    }
    return model.longEndEventKeys.has(createTimedLaneKey(note.lane, note.endTimeSec, note.side));
  }
  function getEditorScrollTopForBeat(model, beat, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return 0;
    }
    const clampedBeat = getClampedSelectedBeat(model, beat);
    const maxScrollTop = Math.max(0, getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat) - viewportHeight);
    return clamp(clampedBeat * pixelsPerBeat, 0, maxScrollTop);
  }
  function getTotalMeasureIndex(model) {
    if (!model || model.barLines.length === 0) {
      return 0;
    }
    return Math.max(model.barLines.length - 2, 0);
  }
  function createFallbackComboEvents(notes) {
    return notes.filter((note) => note.kind === "normal" || note.kind === "long").map((note) => ({
      lane: note.lane,
      beat: Number.isFinite(note.beat) ? note.beat : 0,
      timeSec: note.timeSec,
      kind: note.kind === "long" ? "long-start" : "normal",
      ...note.side ? { side: note.side } : {}
    }));
  }
  function createBeatTimingIndex(score) {
    const initialBpm = Number.isFinite(score.initialBpm) && score.initialBpm > 0 ? score.initialBpm : null;
    if (!initialBpm) {
      return null;
    }
    const actions = createTimingActions(score);
    actions.sort(compareTimingAction);
    const stateBeats = new Array(actions.length);
    const stateSeconds = new Array(actions.length);
    const stateBpms = new Array(actions.length);
    const segments = [];
    let currentBeat = 0;
    let currentSeconds = 0;
    let currentBpm = initialBpm;
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const actionBeat = Number.isFinite(action.beat) ? Math.max(action.beat, currentBeat) : currentBeat;
      let actionTimeSec = Number.isFinite(action.timeSec) ? Math.max(action.timeSec, currentSeconds) : currentSeconds + (actionBeat - currentBeat) * 60 / currentBpm;
      if (actionBeat > currentBeat && actionTimeSec <= currentSeconds) {
        actionTimeSec = currentSeconds + (actionBeat - currentBeat) * 60 / currentBpm;
      }
      if (actionBeat > currentBeat) {
        const nextSeconds = actionTimeSec;
        segments.push({
          type: "linear",
          startSec: currentSeconds,
          endSec: nextSeconds,
          startBeat: currentBeat,
          endBeat: actionBeat
        });
        currentBeat = actionBeat;
        currentSeconds = nextSeconds;
      } else {
        currentSeconds = actionTimeSec;
      }
      if (action.type === "bpm") {
        currentBpm = action.bpm;
      } else {
        const stopDurationSec = Number.isFinite(action.durationSec) && action.durationSec > 0 ? action.durationSec : (action.stopBeats ?? 0) * 60 / currentBpm;
        if (stopDurationSec > 0) {
          segments.push({
            type: "stop",
            startSec: currentSeconds,
            endSec: currentSeconds + stopDurationSec,
            beat: currentBeat
          });
          currentSeconds += stopDurationSec;
        }
      }
      stateBeats[index] = currentBeat;
      stateSeconds[index] = currentSeconds;
      stateBpms[index] = currentBpm;
    }
    return {
      initialBpm,
      actions,
      segments,
      stateBeats,
      stateSeconds,
      stateBpms,
      tailBeat: currentBeat,
      tailSeconds: currentSeconds,
      tailBpm: currentBpm,
      beatToSeconds(beat) {
        const normalizedBeat = Number.isFinite(beat) ? Math.max(beat, 0) : 0;
        const actionIndex = upperBoundActionsByBeat(actions, normalizedBeat) - 1;
        if (actionIndex < 0) {
          return normalizedBeat * 60 / initialBpm;
        }
        return stateSeconds[actionIndex] + (normalizedBeat - stateBeats[actionIndex]) * 60 / stateBpms[actionIndex];
      },
      secondsToBeat(seconds) {
        const normalizedSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
        const segmentIndex = upperBoundSegmentsByStartSec(segments, normalizedSeconds) - 1;
        if (segmentIndex >= 0) {
          const segment = segments[segmentIndex];
          if (normalizedSeconds <= segment.endSec) {
            if (segment.type === "stop") {
              return segment.beat;
            }
            const secSpan = segment.endSec - segment.startSec;
            if (secSpan <= 0) {
              return segment.endBeat;
            }
            return segment.startBeat + (normalizedSeconds - segment.startSec) * (segment.endBeat - segment.startBeat) / secSpan;
          }
        }
        return currentBeat + (normalizedSeconds - currentSeconds) * currentBpm / 60;
      }
    };
  }
  function createTimingActions(score) {
    const timingActions = createTimingActionsFromCanonicalScore(score);
    if (timingActions.length > 0) {
      return timingActions;
    }
    return createFallbackTimingActions(score);
  }
  function createTimingActionsFromCanonicalScore(score) {
    return [...score?.timingActions ?? []].filter((action) => Number.isFinite(action?.beat) && action.type === "bpm" && Number.isFinite(action?.bpm) && action.bpm > 0 || Number.isFinite(action?.beat) && action.type === "stop" && Number.isFinite(action?.stopBeats) && action.stopBeats > 0).map((action) => {
      if (action.type === "bpm") {
        return {
          type: "bpm",
          beat: action.beat,
          timeSec: action.timeSec,
          bpm: action.bpm
        };
      }
      return {
        type: "stop",
        beat: action.beat,
        timeSec: action.timeSec,
        stopBeats: action.stopBeats,
        durationSec: action.durationSec
      };
    });
  }
  function createFallbackTimingActions(score) {
    const actions = [];
    for (const event of score?.bpmChanges ?? []) {
      if (Number.isFinite(event?.beat) && Number.isFinite(event?.bpm) && event.bpm > 0) {
        actions.push({
          type: "bpm",
          beat: event.beat,
          timeSec: event.timeSec,
          bpm: event.bpm
        });
      }
    }
    for (const event of score?.stops ?? []) {
      if (!Number.isFinite(event?.beat) || !Number.isFinite(event?.stopBeats) || event.stopBeats <= 0) {
        continue;
      }
      const action = {
        type: "stop",
        beat: event.beat,
        stopBeats: event.stopBeats
      };
      if (Number.isFinite(event?.durationSec) && event.durationSec > 0) {
        action.durationSec = event.durationSec;
        if (Number.isFinite(event?.timeSec)) {
          action.timeSec = event.timeSec - event.durationSec;
        }
      }
      actions.push(action);
    }
    return actions;
  }
  function createGameScrollIndex(scrollChanges) {
    const actions = [...scrollChanges ?? []].filter((event) => Number.isFinite(event?.beat) && Number.isFinite(event?.rate)).sort(compareTimedBeatLike);
    const stateBeats = new Array(actions.length);
    const stateDisplacements = new Array(actions.length);
    const stateRates = new Array(actions.length);
    let currentBeat = 0;
    let currentDisplacement = 0;
    let currentRate = 1;
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const actionBeat = Math.max(action.beat, currentBeat);
      if (actionBeat > currentBeat) {
        currentDisplacement += (actionBeat - currentBeat) * currentRate;
        currentBeat = actionBeat;
      }
      currentRate = action.rate;
      stateBeats[index] = currentBeat;
      stateDisplacements[index] = currentDisplacement;
      stateRates[index] = currentRate;
    }
    return {
      actions,
      stateBeats,
      stateDisplacements,
      stateRates,
      tailBeat: currentBeat,
      tailDisplacement: currentDisplacement,
      tailRate: currentRate,
      beatToDisplacement(beat) {
        const normalizedBeat = Number.isFinite(beat) ? Math.max(beat, 0) : 0;
        const actionIndex = upperBoundActionsByBeat(actions, normalizedBeat) - 1;
        if (actionIndex < 0) {
          return normalizedBeat;
        }
        return stateDisplacements[actionIndex] + (normalizedBeat - stateBeats[actionIndex]) * stateRates[actionIndex];
      },
      getScrollRateAtBeat(beat) {
        const normalizedBeat = Number.isFinite(beat) ? Math.max(beat, 0) : 0;
        const actionIndex = upperBoundActionsByBeat(actions, normalizedBeat) - 1;
        if (actionIndex < 0) {
          return 1;
        }
        return stateRates[actionIndex];
      }
    };
  }
  function createGameTimeline({ notes, barLines, bpmChanges, stops, scrollChanges, gameScrollIndex }) {
    const pointMap = /* @__PURE__ */ new Map();
    ensureGameTimelinePoint(pointMap, 0, 0, gameScrollIndex);
    for (const barLine of barLines ?? []) {
      const point = ensureGameTimelinePoint(pointMap, barLine?.beat, barLine?.timeSec, gameScrollIndex);
      if (point) {
        point.barLines.push(barLine);
      }
    }
    for (const bpmChange of bpmChanges ?? []) {
      const point = ensureGameTimelinePoint(pointMap, bpmChange?.beat, bpmChange?.timeSec, gameScrollIndex);
      if (point) {
        point.bpmChanges.push(bpmChange);
      }
    }
    for (const stop of stops ?? []) {
      const point = ensureGameTimelinePoint(pointMap, stop?.beat, stop?.timeSec, gameScrollIndex);
      if (point) {
        point.stops.push(stop);
      }
    }
    for (const scrollChange of scrollChanges ?? []) {
      const point = ensureGameTimelinePoint(pointMap, scrollChange?.beat, scrollChange?.timeSec, gameScrollIndex);
      if (point) {
        point.scrollChanges.push(scrollChange);
      }
    }
    for (const note of notes ?? []) {
      const point = ensureGameTimelinePoint(pointMap, note?.beat, note?.timeSec, gameScrollIndex);
      if (point) {
        point.notes.push(note);
      }
      if (note?.kind === "long") {
        const longEndPoint = ensureGameTimelinePoint(pointMap, note?.endBeat, note?.endTimeSec, gameScrollIndex);
        if (longEndPoint) {
          longEndPoint.longEndNotes.push(note);
        }
      }
    }
    const points = [...pointMap.values()].sort(compareTimedBeatLike);
    const pointIndexByKey = /* @__PURE__ */ new Map();
    let currentScrollRate = 1;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      point.index = index;
      point.stopDurationSec = point.stops.reduce((sum, stop) => {
        const durationSec = Number.isFinite(stop?.durationSec) && stop.durationSec > 0 ? stop.durationSec : 0;
        return sum + durationSec;
      }, 0);
      if (point.scrollChanges.length > 0) {
        const lastScrollChange = point.scrollChanges[point.scrollChanges.length - 1];
        currentScrollRate = Number.isFinite(lastScrollChange?.rate) ? lastScrollChange.rate : currentScrollRate;
      }
      point.outgoingScrollRate = currentScrollRate;
      pointIndexByKey.set(createGameTimelinePointKey(point.beat, point.timeSec), index);
    }
    for (const note of notes ?? []) {
      const startIndex = pointIndexByKey.get(createGameTimelinePointKey(note?.beat, note?.timeSec));
      if (Number.isInteger(startIndex)) {
        note.gameTimelineIndex = startIndex;
      }
      if (note?.kind === "long") {
        const endIndex = pointIndexByKey.get(createGameTimelinePointKey(note?.endBeat, note?.endTimeSec));
        if (Number.isInteger(endIndex)) {
          note.gameTimelineEndIndex = endIndex;
        }
      }
    }
    return points;
  }
  function ensureGameTimelinePoint(pointMap, beat, timeSec, gameScrollIndex) {
    if (!Number.isFinite(beat) || !Number.isFinite(timeSec)) {
      return null;
    }
    const key = createGameTimelinePointKey(beat, timeSec);
    let point = pointMap.get(key);
    if (point) {
      return point;
    }
    point = {
      beat,
      timeSec,
      trackPosition: gameScrollIndex ? gameScrollIndex.beatToDisplacement(beat) : beat,
      barLines: [],
      bpmChanges: [],
      stops: [],
      scrollChanges: [],
      notes: [],
      longEndNotes: [],
      stopDurationSec: 0,
      outgoingScrollRate: 1,
      index: -1
    };
    pointMap.set(key, point);
    return point;
  }
  function createGameTimelinePointKey(beat, timeSec) {
    return `${Math.round((beat ?? 0) * 1e6)}:${Math.round((timeSec ?? 0) * 1e6)}`;
  }
  function createGamePointIndex(items) {
    return [...items ?? []].filter((item) => Number.isFinite(item?.trackPosition)).sort(compareTrackEvent);
  }
  function createGameLongBodyStartIndex(notes) {
    return [...notes ?? []].filter((note) => note?.kind === "long" && Number.isFinite(note?.trackPosition) && Number.isFinite(note?.endTrackPosition) && note.endTrackPosition > note.trackPosition).sort(compareTrackEvent);
  }
  function createGameLongEndIndex(notes) {
    return [...notes ?? []].filter((note) => note?.kind === "long" && Number.isFinite(note?.endTrackPosition)).sort(compareGameLongBodyEndTrack);
  }
  function annotateEventsWithGameTrackPosition(events, gameScrollIndex) {
    if (!gameScrollIndex) {
      return [...events];
    }
    return events.map((event) => ({
      ...event,
      ...Number.isFinite(event?.beat) ? { trackPosition: gameScrollIndex.beatToDisplacement(event.beat) } : {}
    }));
  }
  function annotateNotesWithGameTrackPosition(notes, gameScrollIndex) {
    if (!gameScrollIndex) {
      return [...notes];
    }
    return notes.map((note) => ({
      ...note,
      ...Number.isFinite(note?.beat) ? { trackPosition: gameScrollIndex.beatToDisplacement(note.beat) } : {},
      ...Number.isFinite(note?.endBeat) ? { endTrackPosition: gameScrollIndex.beatToDisplacement(note.endBeat) } : {}
    }));
  }
  function upperBoundByTime(items, timeSec) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (items[mid].timeSec <= timeSec) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function upperBoundActionsByBeat(actions, beat) {
    let low = 0;
    let high = actions.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (actions[mid].beat <= beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function upperBoundSegmentsByStartSec(segments, seconds) {
    let low = 0;
    let high = segments.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (segments[mid].startSec <= seconds) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function compareNoteLike(left, right) {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
      return finiteOrZero(left.beat) - finiteOrZero(right.beat);
    }
    return (left.lane ?? 0) - (right.lane ?? 0);
  }
  function compareComboEvent(left, right) {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
      return finiteOrZero(left.beat) - finiteOrZero(right.beat);
    }
    const order = comboEventOrder(left.kind) - comboEventOrder(right.kind);
    if (order !== 0) {
      return order;
    }
    return left.lane - right.lane;
  }
  function compareBeatNoteLike(left, right) {
    if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
      return finiteOrZero(left.beat) - finiteOrZero(right.beat);
    }
    if ((left.timeSec ?? 0) !== (right.timeSec ?? 0)) {
      return (left.timeSec ?? 0) - (right.timeSec ?? 0);
    }
    return (left.lane ?? 0) - (right.lane ?? 0);
  }
  function compareLongNoteEndBeat(left, right) {
    if (finiteOrZero(left.endBeat ?? left.beat) !== finiteOrZero(right.endBeat ?? right.beat)) {
      return finiteOrZero(left.endBeat ?? left.beat) - finiteOrZero(right.endBeat ?? right.beat);
    }
    if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
      return finiteOrZero(left.beat) - finiteOrZero(right.beat);
    }
    return (left.timeSec ?? 0) - (right.timeSec ?? 0);
  }
  function compareTrackEvent(left, right) {
    if (finiteOrZero(left?.trackPosition) !== finiteOrZero(right?.trackPosition)) {
      return finiteOrZero(left?.trackPosition) - finiteOrZero(right?.trackPosition);
    }
    if (finiteOrZero(left?.timeSec) !== finiteOrZero(right?.timeSec)) {
      return finiteOrZero(left?.timeSec) - finiteOrZero(right?.timeSec);
    }
    if (finiteOrZero(left?.beat) !== finiteOrZero(right?.beat)) {
      return finiteOrZero(left?.beat) - finiteOrZero(right?.beat);
    }
    return (left?.lane ?? 0) - (right?.lane ?? 0);
  }
  function compareGameLongBodyEndTrack(left, right) {
    if (finiteOrZero(left?.endTrackPosition) !== finiteOrZero(right?.endTrackPosition)) {
      return finiteOrZero(left?.endTrackPosition) - finiteOrZero(right?.endTrackPosition);
    }
    return compareTrackEvent(left, right);
  }
  function compareTimedBeatLike(left, right) {
    if (Number.isFinite(left?.beat) && Number.isFinite(right?.beat) && left.beat !== right.beat) {
      return left.beat - right.beat;
    }
    return (left?.timeSec ?? 0) - (right?.timeSec ?? 0);
  }
  function compareTimingAction(left, right) {
    if (left.beat !== right.beat) {
      return left.beat - right.beat;
    }
    return ACTION_PRECEDENCE[left.type] - ACTION_PRECEDENCE[right.type];
  }
  function comboEventOrder(kind) {
    switch (kind) {
      case "normal":
        return 0;
      case "long-start":
        return 1;
      case "long-end":
        return 2;
      default:
        return 99;
    }
  }
  function createTimedLaneKey(input, timeSec, side = void 0) {
    if (typeof input === "object" && input !== null) {
      return createTimedLaneKey(input.lane, input.timeSec ?? input.endTimeSec, input.side);
    }
    return `${side ?? "-"}:${input}:${Math.round((timeSec ?? 0) * 1e6)}`;
  }
  function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
  }
  function clamp(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  // shared/preview-runtime/score-viewer-renderer.js
  var VIEWER_LANE_SIDE_PADDING = 6;
  var DP_GUTTER_UNITS = 1.2;
  var FIXED_LANE_WIDTH = 16;
  var BACKGROUND_FILL = "#000000";
  var SEPARATOR_COLOR = "#404040";
  var BAR_LINE = "#ffffff";
  var EDITOR_BEAT_GRID_LINE = "#808080";
  var EDITOR_SIXTEENTH_GRID_LINE = "#404040";
  var BPM_MARKER = "#00ff00";
  var STOP_MARKER = "#ff00ff";
  var SCROLL_MARKER = "#ff0";
  var MINE_COLOR = "#880000";
  var INVISIBLE_NOTE_COLOR = "#FFFF00";
  var NOTE_HEAD_HEIGHT = 4;
  var TEMPO_MARKER_HEIGHT = 1;
  var TEMPO_MARKER_WIDTH_RATIO = 0.5;
  var TEMPO_LABEL_GAP = 8;
  var TEMPO_LABEL_MIN_GAP = 12;
  var LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX = 1;
  var TEMPO_LABEL_FONT = '12px "Inconsolata", "Noto Sans JP"';
  var JUDGE_LINE_SIDE_OVERHANG = FIXED_LANE_WIDTH * 3;
  var BEAT_LANE_COLORS = /* @__PURE__ */ new Map([
    ["0", "#e04a4a"],
    ["1", "#bebebe"],
    ["2", "#5074fe"],
    ["3", "#bebebe"],
    ["4", "#5074fe"],
    ["5", "#bebebe"],
    ["6", "#5074fe"],
    ["7", "#bebebe"],
    ["8", "#bebebe"],
    ["9", "#5074fe"],
    ["10", "#bebebe"],
    ["11", "#5074fe"],
    ["12", "#bebebe"],
    ["13", "#5074fe"],
    ["14", "#bebebe"],
    ["15", "#e04a4a"],
    ["g0", "#e04a4a"],
    ["g1", "#bebebe"],
    ["g2", "#5074fe"],
    ["g3", "#bebebe"],
    ["g4", "#5074fe"],
    ["g5", "#bebebe"],
    ["g6", "#bebebe"],
    ["g7", "#5074fe"],
    ["g8", "#bebebe"],
    ["g9", "#5074fe"],
    ["g10", "#bebebe"],
    ["g11", "#e04a4a"]
  ]);
  var POPN_LANE_COLORS = /* @__PURE__ */ new Map([
    ["p0", "#c4c4c4"],
    ["p1", "#fff500"],
    ["p2", "#99ff67"],
    ["p3", "#30b9f9"],
    ["p4", "#ff6c6c"],
    ["p5", "#30b9f9"],
    ["p6", "#99ff67"],
    ["p7", "#fff500"],
    ["p8", "#c4c4c4"]
  ]);
  function createScoreViewerRenderer(canvas) {
    const context = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let laneLayoutCache = {
      mode: null,
      laneCount: null,
      width: 0,
      lanes: []
    };
    function resize(nextWidth, nextHeight) {
      width = Math.max(1, Math.floor(nextWidth));
      height = Math.max(1, Math.floor(nextHeight));
      dpr = typeof window === "undefined" ? 1 : Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      laneLayoutCache = {
        mode: null,
        laneCount: null,
        width: 0,
        lanes: []
      };
    }
    function render(model, selectedTimeSec, {
      viewerMode = DEFAULT_VIEWER_MODE,
      pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND,
      pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
      editorFrameState = null,
      showInvisibleNotes = false
    } = {}) {
      context.clearRect(0, 0, width, height);
      context.fillStyle = BACKGROUND_FILL;
      context.fillRect(0, 0, width, height);
      if (!model) {
        return createEmptyRenderResult();
      }
      const lanes = getCachedLaneLayout(model.score.mode, model.score.laneCount);
      const resolvedMode = resolveViewerModeForModel(model, viewerMode);
      if (resolvedMode === "time") {
        return renderTimeMode(model, lanes, selectedTimeSec, pixelsPerSecond, showInvisibleNotes);
      }
      if (resolvedMode === "game") {
        return renderGameMode(model, lanes, selectedTimeSec, pixelsPerBeat, showInvisibleNotes);
      }
      return renderEditorMode(
        model,
        lanes,
        editorFrameState ?? getEditorFrameState(model, selectedTimeSec, height, pixelsPerBeat),
        pixelsPerBeat,
        showInvisibleNotes
      );
    }
    return { resize, render };
    function renderTimeMode(model, lanes, selectedTimeSec, pixelsPerSecond, showInvisibleNotes) {
      const { startTimeSec, endTimeSec } = getVisibleTimeRange(model, selectedTimeSec, height, pixelsPerSecond);
      drawBarLinesTimeMode(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      if (showInvisibleNotes) {
        drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      }
      drawLaneSeparators(context, lanes, height);
      drawTempoMarkersTimeMode(
        context,
        model.bpmChanges,
        model.stops,
        model.scrollChanges,
        lanes,
        selectedTimeSec,
        startTimeSec,
        endTimeSec,
        height,
        pixelsPerSecond
      );
      return {
        markers: [],
        laneBounds: getLaneBounds(lanes)
      };
    }
    function renderEditorMode(model, lanes, editorFrameState, pixelsPerBeat, showInvisibleNotes) {
      drawEditorSubGrid(context, model.measureRanges, lanes, editorFrameState, pixelsPerBeat);
      drawBarLinesEditorMode(context, model.barLines, lanes, editorFrameState, pixelsPerBeat);
      drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
      drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
      if (showInvisibleNotes) {
        drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
      }
      drawLaneSeparators(context, lanes, height);
      drawTempoMarkersEditorMode(
        context,
        model,
        lanes,
        editorFrameState,
        pixelsPerBeat
      );
      return {
        markers: [],
        laneBounds: getLaneBounds(lanes)
      };
    }
    function renderGameMode(model, lanes, selectedTimeSec, pixelsPerBeat, showInvisibleNotes) {
      const projection = collectGameProjection(model, selectedTimeSec, height, pixelsPerBeat);
      drawBarLinesGameMode(context, lanes, projection);
      drawLongBodiesGameMode(context, model, lanes, projection);
      drawNoteHeadsGameMode(context, model, lanes, projection);
      if (showInvisibleNotes) {
        drawInvisibleNoteHeadsGameMode(context, lanes, projection);
      }
      drawLaneSeparators(context, lanes, height);
      drawTempoMarkersGameMode(context, lanes, projection);
      return {
        markers: [],
        laneBounds: getLaneBounds(lanes)
      };
    }
    function getCachedLaneLayout(mode, laneCount) {
      if (laneLayoutCache.mode === mode && laneLayoutCache.laneCount === laneCount && laneLayoutCache.width === width && laneLayoutCache.lanes.length > 0) {
        return laneLayoutCache.lanes;
      }
      const lanes = createLaneLayout(mode, laneCount, width);
      laneLayoutCache = {
        mode,
        laneCount,
        width,
        lanes
      };
      return lanes;
    }
  }
  function estimateViewerWidth(mode, laneCount) {
    const layout = getModeLayout(mode, laneCount);
    const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
    const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
    return Math.ceil(contentWidth + JUDGE_LINE_SIDE_OVERHANG * 2);
  }
  function drawBarLinesTimeMode(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = rightLane.x + rightLane.width;
    context.save();
    context.strokeStyle = BAR_LINE;
    context.lineWidth = 1;
    for (const barLine of barLines) {
      if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      context.beginPath();
      context.moveTo(leftX, y + 0.5);
      context.lineTo(rightX, y + 0.5);
      context.stroke();
    }
    context.restore();
  }
  function drawTempoMarkersTimeMode(context, bpmChanges, stops, scrollChanges, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    let lastBpmLabelY = Number.POSITIVE_INFINITY;
    let lastStopLabelY = Number.POSITIVE_INFINITY;
    let lastScrollLabelY = Number.POSITIVE_INFINITY;
    context.save();
    context.fillStyle = BPM_MARKER;
    for (const bpmChange of bpmChanges) {
      if (bpmChange.timeSec < startTimeSec || bpmChange.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const markerRect = getTempoMarkerRect(rightLane, "right");
      context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
      if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "bpm",
          timeSec: bpmChange.timeSec,
          y,
          label: formatBpmMarkerLabel(bpmChange.bpm),
          side: "right",
          color: BPM_MARKER,
          x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP
        });
        lastBpmLabelY = y;
      }
    }
    context.fillStyle = STOP_MARKER;
    for (const stop of stops) {
      if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
      if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "stop",
          timeSec: stop.timeSec,
          y,
          label: formatStopMarkerLabel(stop.durationSec),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastStopLabelY = y;
      }
    }
    context.fillStyle = SCROLL_MARKER;
    for (const scrollChange of scrollChanges) {
      if (scrollChange.timeSec < startTimeSec || scrollChange.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(scrollChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
      if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "scroll",
          timeSec: scrollChange.timeSec,
          y,
          label: formatScrollMarkerLabel(scrollChange.rate),
          side: "left",
          color: SCROLL_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastScrollLabelY = y;
      }
    }
    context.restore();
  }
  function drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    context.save();
    for (const note of model.notes) {
      if (note.kind !== "long" || !Number.isFinite(note.endTimeSec)) {
        continue;
      }
      if (note.endTimeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const startY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const endY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
      const bottomY = Math.min(Math.max(startY, endY), viewportHeight + NOTE_HEAD_HEIGHT + 24);
      const bodyHeight = Math.max(bottomY - topY, 2);
      context.fillStyle = dimColor(lane.note, 0.42);
      context.fillRect(lane.x, topY, lane.width, bodyHeight);
    }
    context.restore();
  }
  function drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    context.save();
    for (const note of model.notes) {
      const noteEndTimeSec = note.endTimeSec ?? note.timeSec;
      if (noteEndTimeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane || note.kind === "invisible") {
        continue;
      }
      const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);
      if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
        const endHeadY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        drawRectNote(context, lane, endHeadY, lane.note);
      }
    }
    context.restore();
  }
  function drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    context.save();
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
    for (const note of model.invisibleNotes ?? []) {
      if (note.timeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      drawOutlinedRectNote(context, lane, headY, INVISIBLE_NOTE_COLOR);
    }
    context.restore();
  }
  function collectGameProjection(model, selectedTimeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    const projection = {
      selectedTimeSec,
      selectedTrackPosition: getGameTrackPositionAtTimeSec(model, selectedTimeSec),
      viewportHeight: Math.max(viewportHeight, 0),
      pixelsPerBeat,
      visibleMargin: NOTE_HEAD_HEIGHT + 24,
      points: [],
      pointYByIndex: /* @__PURE__ */ new Map(),
      exitPoint: null
    };
    if (!model?.gameTimeline?.length) {
      return projection;
    }
    const startIndex = lowerBoundGameTimelineByTime(model.gameTimeline, selectedTimeSec);
    for (let index = startIndex; index < model.gameTimeline.length; index += 1) {
      const point = model.gameTimeline[index];
      const y = gameTrackPositionToViewportY(
        getEventTrackPosition(point),
        projection.selectedTrackPosition,
        projection.viewportHeight,
        pixelsPerBeat
      );
      if (!isViewportYVisible(y, projection.viewportHeight, projection.visibleMargin)) {
        projection.exitPoint = { index, point, y };
        break;
      }
      projection.points.push({ index, point, y });
      projection.pointYByIndex.set(index, y);
    }
    return projection;
  }
  function drawBarLinesGameMode(context, lanes, projection) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = rightLane.x + rightLane.width;
    context.save();
    context.strokeStyle = BAR_LINE;
    context.lineWidth = 1;
    for (const projectedPoint of projection.points) {
      if (projectedPoint.point.barLines.length === 0) {
        continue;
      }
      for (const _barLine of projectedPoint.point.barLines) {
        context.beginPath();
        context.moveTo(leftX, projectedPoint.y + 0.5);
        context.lineTo(rightX, projectedPoint.y + 0.5);
        context.stroke();
      }
    }
    context.restore();
  }
  function drawLongBodiesGameMode(context, model, lanes, projection) {
    context.save();
    for (const note of model.notes) {
      if (note.kind !== "long" || !Number.isFinite(note.endTimeSec) || note.endTimeSec <= projection.selectedTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      if (note.timeSec >= projection.selectedTimeSec) {
        if (!(getNoteEndTrackPosition(note) > getEventTrackPosition(note))) {
          continue;
        }
      } else if (!(getNoteEndTrackPosition(note) > projection.selectedTrackPosition)) {
        continue;
      }
      const startY = getProjectedGameLongBodyStartY(note, projection);
      const endY = getProjectedGameLongBodyEndY(note, projection);
      if (!Number.isFinite(startY) || !Number.isFinite(endY)) {
        continue;
      }
      const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
      const bottomY = Math.min(Math.max(startY, endY), projection.viewportHeight + NOTE_HEAD_HEIGHT + 24);
      if (bottomY <= topY) {
        continue;
      }
      context.fillStyle = dimColor(lane.note, 0.42);
      context.fillRect(lane.x, topY, lane.width, Math.max(bottomY - topY, 2));
    }
    context.restore();
  }
  function drawNoteHeadsGameMode(context, model, lanes, projection) {
    context.save();
    for (const projectedPoint of projection.points) {
      for (const note of projectedPoint.point.notes) {
        const lane = lanes[note.lane];
        if (!lane || note.kind === "invisible") {
          continue;
        }
        drawRectNote(context, lane, projectedPoint.y, note.kind === "mine" ? MINE_COLOR : lane.note);
      }
      for (const note of projectedPoint.point.longEndNotes) {
        const lane = lanes[note.lane];
        if (!lane || !shouldDrawLongEndCap(model, note)) {
          continue;
        }
        drawRectNote(context, lane, projectedPoint.y, lane.note);
      }
    }
    context.restore();
  }
  function drawInvisibleNoteHeadsGameMode(context, lanes, projection) {
    context.save();
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
    for (const projectedPoint of projection.points) {
      for (const note of projectedPoint.point.notes) {
        if (note.kind !== "invisible") {
          continue;
        }
        const lane = lanes[note.lane];
        if (!lane) {
          continue;
        }
        drawOutlinedRectNote(context, lane, projectedPoint.y, INVISIBLE_NOTE_COLOR);
      }
    }
    context.restore();
  }
  function drawTempoMarkersGameMode(context, lanes, projection) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const bpmCandidates = [];
    const stopCandidates = [];
    const scrollCandidates = [];
    context.save();
    for (const projectedPoint of projection.points) {
      context.fillStyle = BPM_MARKER;
      for (const bpmChange of projectedPoint.point.bpmChanges) {
        const markerRect = getTempoMarkerRect(rightLane, "right");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
        bpmCandidates.push({
          type: "bpm",
          timeSec: bpmChange.timeSec,
          y: projectedPoint.y,
          label: formatBpmMarkerLabel(bpmChange.bpm),
          side: "right",
          color: BPM_MARKER,
          x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP
        });
      }
      context.fillStyle = STOP_MARKER;
      for (const stop of projectedPoint.point.stops) {
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
        stopCandidates.push({
          type: "stop",
          timeSec: stop.timeSec,
          y: projectedPoint.y,
          label: formatStopMarkerLabel(stop.durationSec),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
      }
      context.fillStyle = SCROLL_MARKER;
      for (const scrollChange of projectedPoint.point.scrollChanges) {
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
        scrollCandidates.push({
          type: "scroll",
          timeSec: scrollChange.timeSec,
          y: projectedPoint.y,
          label: formatScrollMarkerLabel(scrollChange.rate),
          side: "left",
          color: SCROLL_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
      }
    }
    context.restore();
    drawSpacedTempoMarkerLabels(context, bpmCandidates);
    drawSpacedTempoMarkerLabels(context, stopCandidates);
    drawSpacedTempoMarkerLabels(context, scrollCandidates);
  }
  function getProjectedGameLongBodyStartY(note, projection) {
    const projectedStartY = projection.pointYByIndex.get(note.gameTimelineIndex);
    if (Number.isFinite(projectedStartY)) {
      return projectedStartY;
    }
    if (note.timeSec < projection.selectedTimeSec && note.endTimeSec > projection.selectedTimeSec) {
      return projection.viewportHeight / 2;
    }
    return null;
  }
  function getProjectedGameLongBodyEndY(note, projection) {
    const projectedEndY = projection.pointYByIndex.get(note.gameTimelineEndIndex);
    if (Number.isFinite(projectedEndY)) {
      return projectedEndY;
    }
    if (projection.exitPoint && Number.isInteger(note.gameTimelineEndIndex) && note.gameTimelineEndIndex >= projection.exitPoint.index) {
      return Math.min(
        Math.max(projection.exitPoint.y, -NOTE_HEAD_HEIGHT - 24),
        projection.viewportHeight + NOTE_HEAD_HEIGHT + 24
      );
    }
    return null;
  }
  function drawEditorSubGrid(context, measureRanges, lanes, editorFrameState, pixelsPerBeat) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane || !Array.isArray(measureRanges) || measureRanges.length === 0) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = rightLane.x + rightLane.width;
    const visibleGridLines = collectVisibleEditorGridLines(
      measureRanges,
      editorFrameState.startBeat,
      editorFrameState.endBeat
    );
    if (visibleGridLines.sixteenthBeats.length === 0 && visibleGridLines.beatBeats.length === 0) {
      return;
    }
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = EDITOR_SIXTEENTH_GRID_LINE;
    for (const beat of visibleGridLines.sixteenthBeats) {
      const y = beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      context.beginPath();
      context.moveTo(leftX, y + 0.5);
      context.lineTo(rightX, y + 0.5);
      context.stroke();
    }
    context.strokeStyle = EDITOR_BEAT_GRID_LINE;
    for (const beat of visibleGridLines.beatBeats) {
      const y = beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      context.beginPath();
      context.moveTo(leftX, y + 0.5);
      context.lineTo(rightX, y + 0.5);
      context.stroke();
    }
    context.restore();
  }
  function drawBarLinesEditorMode(context, barLines, lanes, editorFrameState, pixelsPerBeat) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = rightLane.x + rightLane.width;
    const visibleWindow = getBeatWindowIndices(barLines, editorFrameState.startBeat, editorFrameState.endBeat);
    context.save();
    context.strokeStyle = BAR_LINE;
    context.lineWidth = 1;
    for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
      const barLine = barLines[index];
      const y = beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      context.beginPath();
      context.moveTo(leftX, y + 0.5);
      context.lineTo(rightX, y + 0.5);
      context.stroke();
    }
    context.restore();
  }
  function drawTempoMarkersEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    let lastBpmLabelY = Number.POSITIVE_INFINITY;
    let lastStopLabelY = Number.POSITIVE_INFINITY;
    let lastScrollLabelY = Number.POSITIVE_INFINITY;
    const bpmWindow = getBeatWindowIndices(model.bpmChanges, editorFrameState.startBeat, editorFrameState.endBeat);
    const stopWindow = getBeatWindowIndices(model.stops, editorFrameState.startBeat, editorFrameState.endBeat);
    const scrollWindow = getBeatWindowIndices(model.scrollChanges, editorFrameState.startBeat, editorFrameState.endBeat);
    context.save();
    context.fillStyle = BPM_MARKER;
    for (let index = bpmWindow.startIndex; index < bpmWindow.endIndex; index += 1) {
      const bpmChange = model.bpmChanges[index];
      const y = beatToViewportY(bpmChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      const markerRect = getTempoMarkerRect(rightLane, "right");
      context.fillRect(
        markerRect.x,
        Math.round(y - TEMPO_MARKER_HEIGHT / 2),
        markerRect.width,
        TEMPO_MARKER_HEIGHT
      );
      if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "bpm",
          timeSec: bpmChange.timeSec,
          y,
          label: formatBpmMarkerLabel(bpmChange.bpm),
          side: "right",
          color: BPM_MARKER,
          x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP
        });
        lastBpmLabelY = y;
      }
    }
    context.fillStyle = STOP_MARKER;
    for (let index = stopWindow.startIndex; index < stopWindow.endIndex; index += 1) {
      const stop = model.stops[index];
      const y = beatToViewportY(stop.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(
        markerRect.x,
        Math.round(y - TEMPO_MARKER_HEIGHT / 2),
        markerRect.width,
        TEMPO_MARKER_HEIGHT
      );
      if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "stop",
          timeSec: stop.timeSec,
          y,
          label: formatStopMarkerLabel(stop.durationSec),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastStopLabelY = y;
      }
    }
    context.fillStyle = SCROLL_MARKER;
    for (let index = scrollWindow.startIndex; index < scrollWindow.endIndex; index += 1) {
      const scrollChange = model.scrollChanges[index];
      const y = beatToViewportY(scrollChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(
        markerRect.x,
        Math.round(y - TEMPO_MARKER_HEIGHT / 2),
        markerRect.width,
        TEMPO_MARKER_HEIGHT
      );
      if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "scroll",
          timeSec: scrollChange.timeSec,
          y,
          label: formatScrollMarkerLabel(scrollChange.rate),
          side: "left",
          color: SCROLL_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastScrollLabelY = y;
      }
    }
    context.restore();
  }
  function shouldKeepTempoMarkerLabel(lastAcceptedY, nextY) {
    return !Number.isFinite(lastAcceptedY) || Math.abs(nextY - lastAcceptedY) >= TEMPO_LABEL_MIN_GAP;
  }
  function getTempoMarkerRect(lane, side) {
    const width = lane.width * TEMPO_MARKER_WIDTH_RATIO;
    if (side === "left") {
      return {
        x: lane.x - width + LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX,
        width
      };
    }
    return {
      x: lane.x + lane.width,
      width
    };
  }
  function drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
    context.save();
    const candidateWindow = getLongBodyWindow(model, editorFrameState.startBeat, editorFrameState.endBeat);
    for (let index = candidateWindow.startIndex; index < candidateWindow.endIndex; index += 1) {
      const note = candidateWindow.items[index];
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const noteStartBeat = note.beat ?? 0;
      const noteEndBeat = getNoteEndBeat(note);
      if (noteEndBeat < editorFrameState.startBeat || noteStartBeat > editorFrameState.endBeat) {
        continue;
      }
      const startY = beatToViewportY(noteStartBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      const endY = beatToViewportY(noteEndBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
      const bottomY = Math.min(Math.max(startY, endY), editorFrameState.viewportHeight + NOTE_HEAD_HEIGHT + 24);
      const bodyHeight = Math.max(bottomY - topY, 2);
      context.fillStyle = dimColor(lane.note, 0.42);
      context.fillRect(lane.x, topY, lane.width, bodyHeight);
    }
    context.restore();
  }
  function drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
    context.save();
    const noteWindow = getBeatWindowIndices(model.notesByBeat, editorFrameState.startBeat, editorFrameState.endBeat);
    for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
      const note = model.notesByBeat[index];
      const lane = lanes[note.lane];
      if (!lane || note.kind === "invisible") {
        continue;
      }
      const headY = beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);
    }
    const longEndWindow = getBeatWindowIndices(model.longNotesByEndBeat, editorFrameState.startBeat, editorFrameState.endBeat, getNoteEndBeat);
    for (let index = longEndWindow.startIndex; index < longEndWindow.endIndex; index += 1) {
      const note = model.longNotesByEndBeat[index];
      const lane = lanes[note.lane];
      if (!lane || !shouldDrawLongEndCap(model, note)) {
        continue;
      }
      const endHeadY = beatToViewportY(getNoteEndBeat(note), editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      drawRectNote(context, lane, endHeadY, lane.note);
    }
    context.restore();
  }
  function drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
    context.save();
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
    const noteWindow = getBeatWindowIndices(model.invisibleNotesByBeat ?? [], editorFrameState.startBeat, editorFrameState.endBeat);
    for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
      const note = model.invisibleNotesByBeat[index];
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const headY = beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
      drawOutlinedRectNote(context, lane, headY, INVISIBLE_NOTE_COLOR);
    }
    context.restore();
  }
  function drawRectNote(context, lane, y, color) {
    context.fillStyle = color;
    context.fillRect(lane.x, Math.round(y - NOTE_HEAD_HEIGHT), lane.width, NOTE_HEAD_HEIGHT);
  }
  function drawOutlinedRectNote(context, lane, y, color) {
    const topY = Math.round(y - NOTE_HEAD_HEIGHT);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(
      lane.x + 1.5,
      topY + 0.5,
      Math.max(lane.width - 2, 1),
      Math.max(NOTE_HEAD_HEIGHT - 1, 1)
    );
  }
  function drawSpacedTempoMarkerLabels(context, candidates) {
    let lastAcceptedY = Number.POSITIVE_INFINITY;
    for (const candidate of [...candidates].sort((left, right) => left.y - right.y)) {
      if (!shouldKeepTempoMarkerLabel(lastAcceptedY, candidate.y)) {
        continue;
      }
      drawTempoMarkerLabel(context, candidate);
      lastAcceptedY = candidate.y;
    }
  }
  function drawTempoMarkerLabel(context, marker) {
    context.save();
    context.font = TEMPO_LABEL_FONT;
    context.fillStyle = marker.color;
    context.textBaseline = "middle";
    context.textAlign = marker.side === "left" ? "right" : "left";
    context.fillText(marker.label, marker.x, marker.y);
    context.restore();
  }
  function drawLaneSeparators(context, lanes, viewportHeight) {
    if (lanes.length === 0) {
      return;
    }
    context.save();
    context.strokeStyle = SEPARATOR_COLOR;
    context.lineWidth = 1;
    const uniqueBoundaries = /* @__PURE__ */ new Set();
    uniqueBoundaries.add(Math.round(lanes[0].x));
    for (const lane of lanes) {
      uniqueBoundaries.add(Math.round(lane.x));
      uniqueBoundaries.add(Math.round(lane.x + lane.width));
    }
    for (const x of [...uniqueBoundaries].sort((left, right) => left - right)) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, viewportHeight);
      context.stroke();
    }
    context.restore();
  }
  function getLaneBounds(lanes) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return {
        leftX: 0,
        rightX: 0
      };
    }
    return {
      leftX: leftLane.x,
      rightX: rightLane.x + rightLane.width
    };
  }
  function getVisualLaneEdges(lanes) {
    const visibleLanes = lanes.filter(Boolean);
    if (visibleLanes.length === 0) {
      return { leftLane: null, rightLane: null };
    }
    let leftLane = visibleLanes[0];
    let rightLane = visibleLanes[0];
    for (const lane of visibleLanes) {
      if (lane.x < leftLane.x) {
        leftLane = lane;
      }
      if (lane.x + lane.width > rightLane.x + rightLane.width) {
        rightLane = lane;
      }
    }
    return { leftLane, rightLane };
  }
  function createEmptyRenderResult() {
    return {
      markers: [],
      laneBounds: {
        leftX: 0,
        rightX: 0
      }
    };
  }
  function createLaneLayout(mode, laneCount, viewportWidth) {
    const layout = getModeLayout(mode, laneCount);
    const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
    const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
    const startX = Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
    const lanes = new Array(Math.max(1, laneCount));
    let cursorX = startX;
    for (let slotIndex = 0; slotIndex < layout.display.length; slotIndex += 1) {
      if (layout.splitAfter !== null && slotIndex === layout.splitAfter) {
        cursorX += gutterWidth;
      }
      const slot = layout.display[slotIndex];
      lanes[slot.actualLane] = {
        lane: slot.actualLane,
        x: cursorX,
        width: FIXED_LANE_WIDTH,
        note: slot.note
      };
      cursorX += FIXED_LANE_WIDTH;
    }
    return lanes;
  }
  function getModeLayout(mode, laneCount) {
    switch (mode) {
      case "5k":
        return createDisplayLayout([0, 1, 2, 3, 4, 5], null, (slotIndex) => getBeatNoteColor(`g${slotIndex}`));
      case "7k":
        return createDisplayLayout([0, 1, 2, 3, 4, 5, 6, 7], null, (slotIndex) => getBeatNoteColor(String(slotIndex)));
      case "10k":
        return createDisplayLayout(
          [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 6],
          6,
          (slotIndex) => getBeatNoteColor(`g${slotIndex}`)
        );
      case "14k":
        return createDisplayLayout(
          [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8],
          8,
          (slotIndex) => getBeatNoteColor(String(slotIndex))
        );
      case "popn-5k":
        return createDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getPopnNoteColor(slotIndex));
      case "popn-9k":
      case "9k":
        return createDisplayLayout(
          Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
          null,
          (slotIndex) => getPopnNoteColor(slotIndex)
        );
      default:
        return createDisplayLayout(
          Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
          null,
          () => "#bebebe"
        );
    }
  }
  function createDisplayLayout(displayOrder, splitAfter, getColor) {
    return {
      splitAfter,
      display: displayOrder.map((actualLane, slotIndex) => ({
        actualLane,
        note: getColor(slotIndex)
      }))
    };
  }
  function getBeatNoteColor(key) {
    return BEAT_LANE_COLORS.get(key) ?? "#bebebe";
  }
  function getPopnNoteColor(slotIndex) {
    return POPN_LANE_COLORS.get(`p${slotIndex}`) ?? "#c4c4c4";
  }
  function timeToViewportY(eventTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond) {
    return viewportHeight / 2 - (eventTimeSec - selectedTimeSec) * pixelsPerSecond;
  }
  function beatToViewportY(eventBeat, selectedBeat, viewportHeight, pixelsPerBeat) {
    return viewportHeight / 2 - (eventBeat - selectedBeat) * pixelsPerBeat;
  }
  function gameTrackPositionToViewportY(eventTrackPosition, selectedTrackPosition, viewportHeight, pixelsPerBeat) {
    return viewportHeight / 2 - (eventTrackPosition - selectedTrackPosition) * pixelsPerBeat;
  }
  function isViewportYVisible(y, viewportHeight, margin = NOTE_HEAD_HEIGHT + 24) {
    return y >= -margin && y <= viewportHeight + margin;
  }
  function getEventTrackPosition(event) {
    return Number.isFinite(event?.trackPosition) ? event.trackPosition : 0;
  }
  function getNoteEndTrackPosition(note) {
    return Number.isFinite(note?.endTrackPosition) ? note.endTrackPosition : getEventTrackPosition(note);
  }
  function formatBpmMarkerLabel(bpm) {
    return trimDecimal(Number(bpm).toFixed(2));
  }
  function formatStopMarkerLabel(durationSec) {
    return `${trimDecimal(Number(durationSec).toFixed(3))}s`;
  }
  function formatScrollMarkerLabel(rate) {
    return trimDecimal(Number(rate).toFixed(3));
  }
  function trimDecimal(value) {
    return String(value).replace(/\.?0+$/, "");
  }
  function collectVisibleEditorGridLines(measureRanges, startBeat, endBeat) {
    const beatBeats = [];
    const sixteenthBeats = [];
    const visibleMeasures = getVisibleMeasureRanges(measureRanges, startBeat, endBeat);
    for (const measure of visibleMeasures) {
      const measureLength = measure.endBeat - measure.startBeat;
      if (!(measureLength > 0)) {
        continue;
      }
      for (let subdivision = 1; ; subdivision += 1) {
        const beat = measure.startBeat + subdivision * 0.25;
        if (!(beat < measure.endBeat - 1e-9)) {
          break;
        }
        if (beat < startBeat || beat > endBeat) {
          continue;
        }
        if (subdivision % 4 === 0) {
          beatBeats.push(beat);
        } else {
          sixteenthBeats.push(beat);
        }
      }
    }
    return { beatBeats, sixteenthBeats };
  }
  function getBeatWindowIndices(items, startBeat, endBeat, getBeat = getEventBeat) {
    return {
      startIndex: lowerBoundByBeat(items, startBeat, getBeat),
      endIndex: upperBoundByBeat(items, endBeat, getBeat)
    };
  }
  function getLongBodyWindow(model, startBeat, endBeat) {
    const visibleStartCount = upperBoundByBeat(model.longNotesByBeat, endBeat, getEventBeat);
    const visibleEndStartIndex = lowerBoundByBeat(model.longNotesByEndBeat, startBeat, getNoteEndBeat);
    const remainingEndCount = model.longNotesByEndBeat.length - visibleEndStartIndex;
    if (visibleStartCount <= remainingEndCount) {
      return {
        items: model.longNotesByBeat,
        startIndex: 0,
        endIndex: visibleStartCount
      };
    }
    return {
      items: model.longNotesByEndBeat,
      startIndex: visibleEndStartIndex,
      endIndex: model.longNotesByEndBeat.length
    };
  }
  function getVisibleMeasureRanges(measureRanges, startBeat, endBeat) {
    const startIndex = lowerBoundMeasureRangesByEndBeat(measureRanges, startBeat);
    const visibleRanges = [];
    for (let index = startIndex; index < measureRanges.length; index += 1) {
      const measureRange = measureRanges[index];
      if (measureRange.startBeat > endBeat) {
        break;
      }
      if (measureRange.endBeat > startBeat) {
        visibleRanges.push(measureRange);
      }
    }
    return visibleRanges;
  }
  function lowerBoundGameTimelineByTime(points, timeSec) {
    let low = 0;
    let high = points.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((points[mid]?.timeSec ?? 0) < timeSec) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function lowerBoundByBeat(items, beat, getBeat = getEventBeat) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (getBeat(items[mid]) < beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function lowerBoundMeasureRangesByEndBeat(measureRanges, beat) {
    let low = 0;
    let high = measureRanges.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((measureRanges[mid]?.endBeat ?? 0) <= beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function upperBoundByBeat(items, beat, getBeat = getEventBeat) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (getBeat(items[mid]) <= beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function getEventBeat(item) {
    return Number.isFinite(item?.beat) ? item.beat : 0;
  }
  function getNoteEndBeat(note) {
    return Number.isFinite(note?.endBeat) ? note.endBeat : getEventBeat(note);
  }
  function dimColor(color, factor) {
    if (!color.startsWith("#")) {
      return color;
    }
    const [red, green, blue] = hexToRgb(color);
    return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
  }
  function hexToRgb(color) {
    const normalized = color.replace("#", "");
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return [red, green, blue];
  }

  // shared/preview-runtime/score-viewer-controller.js
  var DEFAULT_WHEEL_LINE_HEIGHT_PX = 16;
  var MIN_SPACING_SCALE = 0.5;
  var MAX_SPACING_SCALE = 8;
  var SPACING_STEP = 0.01;
  var DEFAULT_SPACING_SCALE = 1;
  var GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO = 0.4;
  var GAME_PLAYBACK_SCROLL_SYNC_MIN_PX = 120;
  function createScoreViewerController({
    root,
    onTimeChange = () => {
    },
    onPlaybackToggle = () => {
    },
    onViewerModeChange = () => {
    },
    onInvisibleNoteVisibilityChange = () => {
    }
  }) {
    const scrollHost = document.createElement("div");
    scrollHost.className = "score-viewer-scroll-host";
    const spacer = document.createElement("div");
    spacer.className = "score-viewer-spacer";
    scrollHost.appendChild(spacer);
    const canvas = document.createElement("canvas");
    canvas.className = "score-viewer-canvas";
    const bottomBar = document.createElement("div");
    bottomBar.className = "score-viewer-bottom-bar";
    const statusPanel = document.createElement("div");
    statusPanel.className = "score-viewer-status-panel";
    const playbackRow = document.createElement("div");
    playbackRow.className = "score-viewer-status-row is-time";
    const playbackButton = document.createElement("button");
    playbackButton.className = "score-viewer-playback-button";
    playbackButton.type = "button";
    playbackButton.setAttribute("aria-label", "Play score viewer");
    playbackButton.textContent = "▶";
    const playbackTime = document.createElement("span");
    playbackTime.className = "score-viewer-playback-time";
    playbackRow.append(playbackButton, playbackTime);
    const measureRow = document.createElement("div");
    measureRow.className = "score-viewer-status-row score-viewer-status-metric";
    const comboRow = document.createElement("div");
    comboRow.className = "score-viewer-status-row score-viewer-status-metric";
    const spacingRow = document.createElement("div");
    spacingRow.className = "score-viewer-status-row score-viewer-spacing-row";
    const spacingTitle = document.createElement("span");
    spacingTitle.className = "score-viewer-spacing-title";
    spacingTitle.textContent = "Spacing";
    const spacingValue = document.createElement("span");
    spacingValue.className = "score-viewer-spacing-value";
    spacingRow.append(spacingTitle, spacingValue);
    const spacingInput = document.createElement("input");
    spacingInput.className = "score-viewer-spacing-input";
    spacingInput.type = "range";
    spacingInput.min = String(MIN_SPACING_SCALE);
    spacingInput.max = String(MAX_SPACING_SCALE);
    spacingInput.step = String(SPACING_STEP);
    spacingInput.value = String(DEFAULT_SPACING_SCALE);
    const modeRow = document.createElement("div");
    modeRow.className = "score-viewer-status-row score-viewer-mode-row";
    const modeTitle = document.createElement("span");
    modeTitle.className = "score-viewer-mode-title";
    modeTitle.textContent = "Mode";
    const modeControls = document.createElement("div");
    modeControls.className = "score-viewer-mode-controls";
    const modeSelect = document.createElement("select");
    modeSelect.className = "score-viewer-mode-select";
    modeSelect.append(
      createModeOption("time", "Time"),
      createModeOption("editor", "Editor"),
      createModeOption("game", "Game")
    );
    const invisibleNoteVisibilitySelect = document.createElement("select");
    invisibleNoteVisibilitySelect.className = "score-viewer-mode-select score-viewer-invisible-note-select";
    invisibleNoteVisibilitySelect.append(
      createModeOption("hide", "INVISIBLE Hide"),
      createModeOption("show", "INVISIBLE Show")
    );
    modeControls.append(modeSelect, invisibleNoteVisibilitySelect);
    modeRow.append(modeTitle, modeControls);
    statusPanel.append(playbackRow, measureRow, comboRow, spacingRow, spacingInput, modeRow);
    bottomBar.append(statusPanel);
    const judgeLine = document.createElement("div");
    judgeLine.className = "score-viewer-judge-line";
    root.replaceChildren(scrollHost, canvas, bottomBar, judgeLine);
    const renderer = createScoreViewerRenderer(canvas);
    const state = {
      model: null,
      selectedTimeSec: 0,
      selectedBeat: 0,
      isPinned: false,
      isOpen: false,
      isPlaying: false,
      spacingScale: DEFAULT_SPACING_SCALE,
      viewerMode: DEFAULT_VIEWER_MODE,
      invisibleNoteVisibility: DEFAULT_INVISIBLE_NOTE_VISIBILITY
    };
    const uiState = {
      playbackButtonDisabled: null,
      playbackButtonText: null,
      playbackButtonLabel: null,
      playbackTime: null,
      measureText: null,
      comboText: null,
      spacingText: null,
      spacingInputValue: null,
      modeSelectValue: null,
      modeSelectDisabled: null,
      invisibleNoteVisibilityValue: null,
      invisibleNoteVisibilityDisabled: null
    };
    let ignoreScrollUntilNextFrame = false;
    let resizeObserver = null;
    let dragState = null;
    let editorFrameStateCache = null;
    scrollHost.addEventListener("scroll", () => {
      syncTimeFromScrollPosition();
    });
    scrollHost.addEventListener("wheel", (event) => {
      if (!state.model || !state.isOpen || !isScrollInteractive()) {
        return;
      }
      scrollHost.scrollTop += normalizeWheelDeltaY(event.deltaY, event.deltaMode, scrollHost.clientHeight);
      syncTimeFromScrollPosition({ force: true });
      event.preventDefault();
    }, { passive: false });
    scrollHost.addEventListener("pointerdown", (event) => {
      if (!canDragScroll(event)) {
        return;
      }
      dragState = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: scrollHost.scrollTop
      };
      scrollHost.classList.add("is-dragging");
      if (typeof scrollHost.setPointerCapture === "function") {
        scrollHost.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });
    scrollHost.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      const deltaY = event.clientY - dragState.startY;
      scrollHost.scrollTop = dragState.startScrollTop + deltaY;
      syncTimeFromScrollPosition({ force: true });
      event.preventDefault();
    });
    scrollHost.addEventListener("pointerup", handlePointerRelease);
    scrollHost.addEventListener("pointercancel", handlePointerRelease);
    scrollHost.addEventListener("lostpointercapture", handlePointerRelease);
    spacingInput.addEventListener("input", () => {
      const nextScale = clampScale(Number.parseFloat(spacingInput.value));
      if (Math.abs(nextScale - state.spacingScale) < 5e-4) {
        spacingValue.textContent = formatSpacingScale(state.spacingScale);
        return;
      }
      state.spacingScale = nextScale;
      spacingValue.textContent = formatSpacingScale(state.spacingScale);
      refreshLayout();
    });
    modeSelect.addEventListener("change", () => {
      const nextMode = normalizeViewerMode(modeSelect.value);
      if (nextMode === "game" && !state.model?.supportsGameMode) {
        modeSelect.value = getResolvedViewerMode2();
        return;
      }
      if (nextMode === "editor" && !state.model?.supportsEditorMode) {
        modeSelect.value = getResolvedViewerMode2();
        return;
      }
      if (nextMode === state.viewerMode) {
        return;
      }
      state.viewerMode = nextMode;
      onViewerModeChange(state.viewerMode);
      refreshLayout();
    });
    invisibleNoteVisibilitySelect.addEventListener("change", () => {
      const nextVisibility = normalizeInvisibleNoteVisibility(invisibleNoteVisibilitySelect.value);
      if (nextVisibility === state.invisibleNoteVisibility) {
        return;
      }
      state.invisibleNoteVisibility = nextVisibility;
      onInvisibleNoteVisibilityChange(state.invisibleNoteVisibility);
      renderScene();
    });
    playbackButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.model) {
        return;
      }
      onPlaybackToggle(!state.isPlaying);
    });
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        refreshLayout();
      });
      resizeObserver.observe(root);
    } else {
      window.addEventListener("resize", refreshLayout);
    }
    function setModel(model) {
      if (state.model === model) {
        return;
      }
      state.model = model;
      state.selectedTimeSec = getClampedSelectedTimeSec(state.model, state.selectedTimeSec);
      state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
      editorFrameStateCache = null;
      updateRootWidth();
      refreshLayout();
    }
    function setSelectedTimeSec(timeSec, { beatHint } = {}) {
      const clampedTimeSec = getClampedSelectedTimeSec(state.model, timeSec);
      const resolvedViewerMode = getResolvedViewerMode2();
      const nextBeat = resolvedViewerMode === "editor" ? resolveSelectedBeat2(clampedTimeSec, beatHint) : getBeatAtTimeSec(state.model, clampedTimeSec);
      if (!hasViewerSelectionChanged(
        state.model,
        resolvedViewerMode,
        state.selectedTimeSec,
        clampedTimeSec,
        state.selectedBeat,
        nextBeat
      ) && state.model) {
        syncScrollPosition();
        renderScene();
        return;
      }
      state.selectedTimeSec = clampedTimeSec;
      state.selectedBeat = nextBeat;
      editorFrameStateCache = null;
      syncScrollPosition();
      renderScene();
    }
    function setPinned(nextPinned) {
      const normalizedPinned = Boolean(nextPinned);
      if (state.isPinned === normalizedPinned) {
        return;
      }
      state.isPinned = normalizedPinned;
      updateScrollInteractivity();
      renderScene();
    }
    function setOpen(nextOpen) {
      const normalizedOpen = Boolean(nextOpen);
      if (state.isOpen === normalizedOpen) {
        return;
      }
      state.isOpen = normalizedOpen;
      root.classList.toggle("is-visible", state.isOpen && Boolean(state.model));
      syncScrollPosition();
      renderScene();
    }
    function setPlaybackState(nextPlaying) {
      const normalizedPlaying = Boolean(nextPlaying);
      if (state.isPlaying === normalizedPlaying) {
        return;
      }
      state.isPlaying = normalizedPlaying;
      updateScrollInteractivity();
      if (!state.isPlaying) {
        syncScrollPosition();
      }
      renderScene();
    }
    function setViewerMode(nextViewerMode) {
      const normalizedMode = normalizeViewerMode(nextViewerMode);
      if (state.viewerMode === normalizedMode) {
        return;
      }
      state.viewerMode = normalizedMode;
      state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
      editorFrameStateCache = null;
      refreshLayout();
    }
    function setInvisibleNoteVisibility(nextVisibility) {
      const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
      if (state.invisibleNoteVisibility === normalizedVisibility) {
        return;
      }
      state.invisibleNoteVisibility = normalizedVisibility;
      renderScene();
    }
    function setEmptyState(_title, _message) {
    }
    function syncScrollPosition() {
      if (!state.model) {
        scrollHost.scrollTop = 0;
        return;
      }
      const viewportHeight = root.clientHeight || 0;
      const resolvedViewerMode = getResolvedViewerMode2();
      const desiredScrollTop = resolvedViewerMode === "editor" ? getEditorScrollTopForBeat(
        state.model,
        state.selectedBeat,
        viewportHeight,
        getPixelsPerBeat()
      ) : getScrollTopForResolvedMode(
        state.model,
        state.selectedTimeSec,
        viewportHeight
      );
      if (!shouldSyncPlaybackScrollPosition({
        viewerMode: resolvedViewerMode,
        isPlaying: state.isPlaying,
        currentScrollTop: scrollHost.scrollTop,
        desiredScrollTop,
        viewportHeight
      })) {
        return;
      }
      ignoreScrollUntilNextFrame = true;
      scrollHost.scrollTop = desiredScrollTop;
      requestAnimationFrame(() => {
        ignoreScrollUntilNextFrame = false;
      });
    }
    function syncTimeFromScrollPosition({ force = false } = {}) {
      if (!state.model || !state.isOpen || !isScrollInteractive()) {
        return;
      }
      if (!force && ignoreScrollUntilNextFrame) {
        return;
      }
      const resolvedViewerMode = getResolvedViewerMode2();
      if (resolvedViewerMode === "editor") {
        const nextBeat = getClampedSelectedBeat(state.model, scrollHost.scrollTop / getPixelsPerBeat());
        if (!hasViewerSelectionChanged(
          state.model,
          resolvedViewerMode,
          state.selectedTimeSec,
          state.selectedTimeSec,
          state.selectedBeat,
          nextBeat
        )) {
          return;
        }
        state.selectedBeat = nextBeat;
        state.selectedTimeSec = getTimeSecForBeat(state.model, nextBeat);
        editorFrameStateCache = null;
        renderScene();
        onTimeChange({
          timeSec: state.selectedTimeSec,
          beat: nextBeat,
          viewerMode: resolvedViewerMode,
          source: "scroll"
        });
        return;
      }
      const nextTimeSec = getTimeSecForResolvedMode(state.model, scrollHost.scrollTop);
      if (!hasViewerSelectionChanged(state.model, resolvedViewerMode, state.selectedTimeSec, nextTimeSec)) {
        return;
      }
      state.selectedTimeSec = nextTimeSec;
      state.selectedBeat = getBeatAtTimeSec(state.model, nextTimeSec);
      editorFrameStateCache = null;
      renderScene();
      onTimeChange({
        timeSec: nextTimeSec,
        beat: state.selectedBeat,
        viewerMode: resolvedViewerMode,
        source: "scroll"
      });
    }
    function refreshLayout() {
      updateRootWidth();
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(260, root.clientHeight);
      renderer.resize(width, height);
      spacer.style.height = `${getContentHeightForResolvedMode(state.model, height)}px`;
      syncScrollPosition();
      renderScene();
    }
    function renderScene() {
      const showScene = Boolean(state.model && state.isOpen);
      const resolvedViewerMode = getResolvedViewerMode2();
      const editorFrameState = resolvedViewerMode === "editor" ? getEditorFrameStateForCurrentView(root.clientHeight || 0) : null;
      const cursor = getViewerCursor(
        state.model,
        state.selectedTimeSec,
        resolvedViewerMode,
        state.selectedBeat
      );
      canvas.hidden = !showScene;
      bottomBar.hidden = !showScene;
      judgeLine.hidden = !showScene;
      setDisabledIfChanged(playbackButton, !state.model, "playbackButtonDisabled");
      setTextIfChanged(playbackButton, state.isPlaying ? "❚❚" : "▶", "playbackButtonText");
      setAttributeIfChanged(
        playbackButton,
        "aria-label",
        state.isPlaying ? "Pause score viewer" : "Play score viewer",
        "playbackButtonLabel"
      );
      setTextIfChanged(playbackTime, `${formatPlaybackTime(cursor.timeSec)} s`, "playbackTime");
      setTextIfChanged(
        measureRow,
        `Measure: ${formatMeasureCounter(cursor.measureIndex, cursor.totalMeasureIndex)}`,
        "measureText"
      );
      setTextIfChanged(comboRow, `Combo: ${cursor.comboCount}/${cursor.totalCombo}`, "comboText");
      setTextIfChanged(spacingValue, formatSpacingScale(state.spacingScale), "spacingText");
      setValueIfChanged(spacingInput, String(state.spacingScale), "spacingInputValue");
      setValueIfChanged(modeSelect, resolvedViewerMode, "modeSelectValue");
      setDisabledIfChanged(modeSelect, !state.model, "modeSelectDisabled");
      setValueIfChanged(invisibleNoteVisibilitySelect, state.invisibleNoteVisibility, "invisibleNoteVisibilityValue");
      setDisabledIfChanged(invisibleNoteVisibilitySelect, !state.model, "invisibleNoteVisibilityDisabled");
      renderer.render(showScene ? state.model : null, cursor.timeSec, {
        viewerMode: resolvedViewerMode,
        pixelsPerSecond: getPixelsPerSecond(),
        pixelsPerBeat: getPixelsPerBeat(),
        editorFrameState,
        showInvisibleNotes: state.invisibleNoteVisibility === "show"
      });
    }
    function destroy() {
      clearDragState();
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", refreshLayout);
      }
    }
    setPinned(false);
    spacingValue.textContent = formatSpacingScale(state.spacingScale);
    modeSelect.value = DEFAULT_VIEWER_MODE;
    invisibleNoteVisibilitySelect.value = DEFAULT_INVISIBLE_NOTE_VISIBILITY;
    refreshLayout();
    return {
      setModel,
      setSelectedTimeSec,
      setPinned,
      setOpen,
      setPlaybackState,
      setViewerMode,
      setInvisibleNoteVisibility,
      setEmptyState,
      refreshLayout,
      destroy
    };
    function handlePointerRelease(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      clearDragState();
    }
    function clearDragState() {
      if (dragState && typeof scrollHost.releasePointerCapture === "function") {
        try {
          if (scrollHost.hasPointerCapture?.(dragState.pointerId)) {
            scrollHost.releasePointerCapture(dragState.pointerId);
          }
        } catch {
        }
      }
      dragState = null;
      scrollHost.classList.remove("is-dragging");
    }
    function canDragScroll(event) {
      return Boolean(
        state.model && state.isOpen && isScrollInteractive() && (event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen")
      );
    }
    function isScrollInteractive() {
      return state.isPinned || state.isPlaying;
    }
    function updateRootWidth() {
      if (!state.model) {
        root.style.removeProperty("--score-viewer-width");
        return;
      }
      root.style.setProperty(
        "--score-viewer-width",
        `${estimateViewerWidth(state.model.score.mode, state.model.score.laneCount)}px`
      );
    }
    function updateScrollInteractivity() {
      const interactive = isScrollInteractive();
      scrollHost.classList.toggle("is-scrollable", interactive);
      scrollHost.style.overflowY = interactive ? "auto" : "hidden";
      if (!interactive) {
        clearDragState();
      }
    }
    function getResolvedViewerMode2() {
      return resolveViewerModeForModel(state.model, state.viewerMode);
    }
    function getPixelsPerSecond() {
      return DEFAULT_VIEWER_PIXELS_PER_SECOND * state.spacingScale;
    }
    function getPixelsPerBeat() {
      return DEFAULT_EDITOR_PIXELS_PER_BEAT * state.spacingScale;
    }
    function getEditorFrameStateForCurrentView(viewportHeight = root.clientHeight || 0) {
      if (!state.model || getResolvedViewerMode2() !== "editor") {
        editorFrameStateCache = null;
        return null;
      }
      const pixelsPerBeat = getPixelsPerBeat();
      if (editorFrameStateCache && editorFrameStateCache.model === state.model && Math.abs(editorFrameStateCache.selectedBeat - state.selectedBeat) < 1e-6 && editorFrameStateCache.viewportHeight === viewportHeight && Math.abs(editorFrameStateCache.pixelsPerBeat - pixelsPerBeat) < 5e-4) {
        return editorFrameStateCache.frameState;
      }
      const frameState = getEditorFrameStateForBeat(
        state.model,
        state.selectedBeat,
        viewportHeight,
        pixelsPerBeat
      );
      editorFrameStateCache = {
        model: state.model,
        selectedBeat: state.selectedBeat,
        viewportHeight,
        pixelsPerBeat,
        frameState
      };
      return frameState;
    }
    function getContentHeightForResolvedMode(model, viewportHeight) {
      if (getResolvedViewerMode2() === "editor") {
        return getEditorContentHeightPx(model, viewportHeight, getPixelsPerBeat());
      }
      return getContentHeightPx(model, viewportHeight, getPixelsPerSecond());
    }
    function getScrollTopForResolvedMode(model, selectedTimeSec, viewportHeight) {
      if (getResolvedViewerMode2() === "editor") {
        return getEditorScrollTopForTimeSec(model, selectedTimeSec, viewportHeight, getPixelsPerBeat());
      }
      return getScrollTopForTimeSec(model, selectedTimeSec, viewportHeight, getPixelsPerSecond());
    }
    function getTimeSecForResolvedMode(model, scrollTop) {
      if (getResolvedViewerMode2() === "editor") {
        return getTimeSecForEditorScrollTop(model, scrollTop, getPixelsPerBeat());
      }
      return getTimeSecForScrollTop(model, scrollTop, getPixelsPerSecond());
    }
    function resolveSelectedBeat2(timeSec, beatHint = void 0) {
      if (!state.model || getResolvedViewerMode2() !== "editor") {
        return 0;
      }
      if (Number.isFinite(beatHint)) {
        return getClampedSelectedBeat(state.model, beatHint);
      }
      return getBeatAtTimeSec(state.model, timeSec);
    }
    function setTextIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.textContent = nextValue;
    }
    function setValueIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.value = nextValue;
    }
    function setDisabledIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.disabled = nextValue;
    }
    function setAttributeIfChanged(element, attributeName, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.setAttribute(attributeName, nextValue);
    }
  }
  function createModeOption(value, label, disabled = false) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    return option;
  }
  function normalizeWheelDeltaY(deltaY, deltaMode, viewportHeight, lineHeightPx = DEFAULT_WHEEL_LINE_HEIGHT_PX) {
    switch (deltaMode) {
      case 1:
        return deltaY * lineHeightPx;
      case 2:
        return deltaY * Math.max(viewportHeight, 1);
      default:
        return deltaY;
    }
  }
  function shouldSyncPlaybackScrollPosition({
    viewerMode,
    isPlaying,
    currentScrollTop,
    desiredScrollTop,
    viewportHeight
  }) {
    if (viewerMode !== "game" || !isPlaying) {
      return true;
    }
    const threshold = Math.max(
      Math.round(Math.max(viewportHeight, 0) * GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO),
      GAME_PLAYBACK_SCROLL_SYNC_MIN_PX
    );
    return Math.abs((desiredScrollTop ?? 0) - (currentScrollTop ?? 0)) >= threshold;
  }
  function clampScale(value) {
    if (!Number.isFinite(value)) {
      return DEFAULT_SPACING_SCALE;
    }
    return Math.min(Math.max(value, MIN_SPACING_SCALE), MAX_SPACING_SCALE);
  }
  function formatSpacingScale(value) {
    return `${clampScale(value).toFixed(2)}x`;
  }
  function formatPlaybackTime(timeSec) {
    const safeTimeSec = Number.isFinite(timeSec) ? Math.max(timeSec, 0) : 0;
    const [secondsPart, fractionPart] = safeTimeSec.toFixed(3).split(".");
    return `${secondsPart.padStart(2, "0")}.${fractionPart}`;
  }
  function formatMeasureCounter(currentMeasureIndex, totalMeasureIndex) {
    const safeTotalMeasureIndex = Math.max(0, Math.floor(Number.isFinite(totalMeasureIndex) ? totalMeasureIndex : 0));
    const safeCurrentMeasureIndex = Math.min(
      Math.max(0, Math.floor(Number.isFinite(currentMeasureIndex) ? currentMeasureIndex : 0)),
      safeTotalMeasureIndex
    );
    const digits = Math.max(3, String(safeTotalMeasureIndex).length);
    return `${String(safeCurrentMeasureIndex).padStart(digits, "0")}/${String(safeTotalMeasureIndex).padStart(digits, "0")}`;
  }

  // shared/preview-runtime/bms-info-data.js
  var BMSDATA_COLUMNS = [
    "md5",
    "sha256",
    "maxbpm",
    "minbpm",
    "length",
    "mode",
    "judge",
    "feature",
    "notes",
    "n",
    "ln",
    "s",
    "ls",
    "total",
    "density",
    "peakdensity",
    "enddensity",
    "mainbpm",
    "distribution",
    "speedchange",
    "lanenotes",
    "tables",
    "stella",
    "bmsid"
  ];
  var BMS_FEATURE_NAMES = [
    "LN(#LNMODE undef)",
    "MINE",
    "RANDOM",
    "LN",
    "CN",
    "HCN",
    "STOP",
    "SCROLL"
  ];
  var DISTRIBUTION_NOTE_COLORS = [
    "#44FF44",
    "#228822",
    "#FF4444",
    "#4444FF",
    "#222288",
    "#CCCCCC",
    "#880000"
  ];
  var DISTRIBUTION_NOTE_NAMES = [
    "LNSCR",
    "LNSCR HOLD",
    "SCR",
    "LN",
    "LN HOLD",
    "NORMAL",
    "MINE"
  ];
  async function fetchBmsInfoRecordByLookupKey(lookupKey) {
    const response = await fetch(`https://bms.howan.jp/${lookupKey}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch BMS data: HTTP ${response.status}`);
    }
    const text = await response.text();
    const values = text.split("");
    if (values.length !== BMSDATA_COLUMNS.length) {
      throw new Error(`BMS data column count mismatch: expected ${BMSDATA_COLUMNS.length}, got ${values.length}`);
    }
    const rawRecord = {};
    for (let index = 0; index < BMSDATA_COLUMNS.length; index += 1) {
      rawRecord[BMSDATA_COLUMNS[index]] = values[index];
    }
    return normalizeBmsInfoRecord(rawRecord);
  }
  function normalizeBmsInfoRecord(rawRecord) {
    const mode = Number(rawRecord.mode);
    const notes = Number(rawRecord.notes);
    const n = Number(rawRecord.n);
    const ln = Number(rawRecord.ln);
    const s = Number(rawRecord.s);
    const ls = Number(rawRecord.ls);
    const total = Number(rawRecord.total);
    const feature = Number(rawRecord.feature);
    const lengthMs = Number(rawRecord.length);
    return {
      md5: rawRecord.md5,
      sha256: rawRecord.sha256,
      maxbpm: Number(rawRecord.maxbpm),
      minbpm: Number(rawRecord.minbpm),
      mainbpm: Number(rawRecord.mainbpm),
      lengthMs,
      durationSec: lengthMs / 1e3,
      mode,
      judge: Number(rawRecord.judge),
      feature,
      featureNames: BMS_FEATURE_NAMES.filter((name, index) => (feature & 1 << index) !== 0),
      notes,
      n,
      ln,
      s,
      ls,
      total,
      density: Number(rawRecord.density),
      peakdensity: Number(rawRecord.peakdensity),
      enddensity: Number(rawRecord.enddensity),
      distribution: rawRecord.distribution,
      distributionSegments: parseDistributionSegments(rawRecord.distribution),
      speedchange: rawRecord.speedchange,
      speedChangePoints: parseSpeedChange(rawRecord.speedchange),
      lanenotesArr: parseLaneNotes(mode, rawRecord.lanenotes),
      tables: parseTables(rawRecord.tables),
      bmsid: Number(rawRecord.bmsid),
      stella: Number(rawRecord.stella),
      notesStr: `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`,
      totalStr: `${total % 1 === 0 ? Math.round(total) : total} (${notes > 0 ? (total / notes).toFixed(3) : "0.000"} T/N)`,
      durationStr: `${(lengthMs / 1e3).toFixed(2)} s`
    };
  }
  function parseTables(tablesRaw) {
    try {
      return JSON.parse(tablesRaw);
    } catch {
      return [];
    }
  }
  function parseLaneNotes(mode, lanenotes) {
    const tokens = String(lanenotes ?? "").split(",").map((token) => Number(token));
    let laneCount = mode;
    if (mode === 7) {
      laneCount = 8;
    } else if (mode === 14) {
      laneCount = 16;
    } else if (mode === 5) {
      laneCount = 6;
    } else if (mode === 10) {
      laneCount = 12;
    }
    const lanenotesArr = [];
    for (let index = 0; index < laneCount; index += 1) {
      const baseIndex = index * 3;
      const normal = tokens[baseIndex] ?? 0;
      const long = tokens[baseIndex + 1] ?? 0;
      const mine = tokens[baseIndex + 2] ?? 0;
      lanenotesArr.push([normal, long, mine, normal + long]);
    }
    if (mode === 7 || mode === 14) {
      const move = lanenotesArr.splice(7, 1)[0];
      if (move) {
        lanenotesArr.unshift(move);
      }
    } else if (mode === 5 || mode === 10) {
      const move = lanenotesArr.splice(5, 1)[0];
      if (move) {
        lanenotesArr.unshift(move);
      }
    }
    return lanenotesArr;
  }
  function parseDistributionSegments(distribution) {
    const noteTypes = 7;
    const data = String(distribution ?? "").startsWith("#") ? String(distribution).slice(1) : String(distribution ?? "");
    const segments = [];
    for (let index = 0; index < data.length; index += 14) {
      const chunk = data.slice(index, index + 14);
      if (chunk.length !== 14) {
        continue;
      }
      const noteCounts = [];
      for (let typeIndex = 0; typeIndex < noteTypes; typeIndex += 1) {
        const base36 = chunk.slice(typeIndex * 2, typeIndex * 2 + 2);
        noteCounts.push(Number.parseInt(base36, 36) || 0);
      }
      segments.push(noteCounts);
    }
    return segments;
  }
  function parseSpeedChange(raw) {
    const numbers = String(raw ?? "").split(",").map((token) => Number(token)).filter((value) => Number.isFinite(value));
    const result = [];
    for (let index = 0; index < numbers.length; index += 2) {
      result.push([numbers[index], numbers[index + 1]]);
    }
    return result;
  }
  function getLaneChipKey(mode, laneIndex) {
    if (mode === 5 || mode === 10) {
      return `g${laneIndex}`;
    }
    if (mode === 9) {
      return `p${laneIndex}`;
    }
    return String(laneIndex);
  }

  // shared/preview-runtime/bms-info-graph.js
  var RECT_WIDTH = 4;
  var RECT_HEIGHT = 2;
  var SPACING = 1;
  var MIN_RATIO = 1 / 8;
  var MAX_RATIO = 8;
  var MIN_LOG = Math.log10(MIN_RATIO);
  var MAX_LOG = Math.log10(MAX_RATIO);
  var GRAPH_SCROLL_FOLLOW_MIN_MARGIN_PX = 48;
  var GRAPH_SCROLL_FOLLOW_MAX_MARGIN_PX = 160;
  function createBmsInfoGraph({
    scrollHost,
    canvas,
    tooltip,
    pinInput,
    onHoverTime = () => {
    },
    onHoverLeave = () => {
    },
    onSelectTime = () => {
    },
    onPinChange = () => {
    }
  }) {
    const context = canvas.getContext("2d");
    const staticCanvas = createLayerCanvas(canvas);
    const staticContext = staticCanvas.getContext("2d");
    const state = {
      record: null,
      selectedTimeSec: 0,
      isPinned: false
    };
    canvas.addEventListener("mousemove", (event) => {
      if (!state.record) {
        hideTooltip(tooltip);
        return;
      }
      const timeSec = getHoverTimeSec(event, canvas);
      if (timeSec < 0 || timeSec > state.record.distributionSegments.length) {
        hideTooltip(tooltip);
        return;
      }
      renderTooltip(tooltip, event, state.record, timeSec);
      onHoverTime(timeSec);
    });
    canvas.addEventListener("mouseleave", () => {
      hideTooltip(tooltip);
      onHoverLeave();
    });
    canvas.addEventListener("click", (event) => {
      if (!state.record) {
        return;
      }
      const timeSec = getHoverTimeSec(event, canvas);
      if (timeSec < 0) {
        return;
      }
      onSelectTime(timeSec);
    });
    pinInput.addEventListener("change", () => {
      onPinChange(pinInput.checked);
    });
    function setRecord(record) {
      state.record = record;
      pinInput.disabled = !record;
      renderStaticScene();
      renderDynamicScene();
    }
    function setSelectedTimeSec(timeSec) {
      state.selectedTimeSec = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
      renderDynamicScene();
      syncScrollToSelected();
    }
    function setPinned(nextPinned) {
      state.isPinned = Boolean(nextPinned);
      pinInput.checked = state.isPinned;
      pinInput.disabled = !state.record;
    }
    function renderStaticScene() {
      const record = state.record;
      if (!record) {
        staticCanvas.width = 640;
        staticCanvas.height = 180;
        staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
        staticContext.fillStyle = "#000000";
        staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
        return;
      }
      const segments = record.distributionSegments;
      const timeLength = Math.max(segments.length, 1);
      const maxNotesPerSecond = Math.max(40, Math.min(record.peakdensity || 0, 100));
      const canvasWidth = timeLength * (RECT_WIDTH + SPACING);
      const canvasHeight = maxNotesPerSecond * (RECT_HEIGHT + SPACING) - SPACING;
      staticCanvas.width = canvasWidth;
      staticCanvas.height = canvasHeight;
      staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
      staticContext.fillStyle = "#000000";
      staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
      drawHorizontalGrid(staticContext, canvasWidth, canvasHeight, maxNotesPerSecond);
      drawVerticalGrid(staticContext, canvasWidth, canvasHeight, timeLength);
      drawDistributionBars(staticContext, segments, canvasHeight, maxNotesPerSecond);
      drawSpeedChangeLines(staticContext, record, canvasWidth, canvasHeight, timeLength);
    }
    function renderDynamicScene() {
      const targetWidth = Math.max(staticCanvas.width || 640, 1);
      const targetHeight = Math.max(staticCanvas.height || 180, 1);
      if (canvas.width !== targetWidth) {
        canvas.width = targetWidth;
      }
      if (canvas.height !== targetHeight) {
        canvas.height = targetHeight;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(staticCanvas, 0, 0);
      drawSelectedTimeLine(context, timeToX(state.selectedTimeSec), canvas.height);
    }
    function syncScrollToSelected() {
      if (!state.record || !scrollHost) {
        return;
      }
      const x = timeToX(state.selectedTimeSec);
      const desired = getGraphFollowScrollLeft({
        targetX: x,
        currentScrollLeft: scrollHost.scrollLeft,
        clientWidth: scrollHost.clientWidth,
        scrollWidth: scrollHost.scrollWidth
      });
      if (Math.abs(scrollHost.scrollLeft - desired) > 1) {
        scrollHost.scrollLeft = desired;
      }
    }
    renderStaticScene();
    renderDynamicScene();
    return {
      setRecord,
      setSelectedTimeSec,
      setPinned,
      render() {
        renderStaticScene();
        renderDynamicScene();
      },
      destroy() {
      }
    };
  }
  function createLayerCanvas(referenceCanvas) {
    if (typeof referenceCanvas?.ownerDocument?.createElement === "function") {
      return referenceCanvas.ownerDocument.createElement("canvas");
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      return document.createElement("canvas");
    }
    throw new Error("Canvas layer creation requires a document.");
  }
  function drawHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond) {
    context.strokeStyle = "#202080";
    context.lineWidth = 1;
    for (let count = 5; count < maxNotesPerSecond; count += 5) {
      const y = canvasHeight - (count * (RECT_HEIGHT + SPACING) - 0.5);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasWidth, y);
      context.stroke();
    }
  }
  function drawVerticalGrid(context, canvasWidth, canvasHeight, timeLength) {
    context.strokeStyle = "#777777";
    context.lineWidth = 1;
    for (let second = 10; second < timeLength; second += 10) {
      const x = second * (RECT_WIDTH + SPACING) - 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvasHeight);
      context.stroke();
    }
  }
  function drawDistributionBars(context, segments, canvasHeight, maxNotesPerSecond) {
    segments.forEach((counts, timeIndex) => {
      let yOffset = 0;
      for (let typeIndex = 0; typeIndex < DISTRIBUTION_NOTE_COLORS.length; typeIndex += 1) {
        const count = counts[typeIndex];
        const color = DISTRIBUTION_NOTE_COLORS[typeIndex];
        for (let index = 0; index < count; index += 1) {
          const x = timeIndex * (RECT_WIDTH + SPACING);
          const y = canvasHeight - ((yOffset + 1) * RECT_HEIGHT + yOffset * SPACING);
          if (y < 0 || yOffset >= maxNotesPerSecond) {
            break;
          }
          context.fillStyle = color;
          context.fillRect(x, y, RECT_WIDTH, RECT_HEIGHT);
          yOffset += 1;
        }
      }
    });
  }
  function drawSpeedChangeLines(context, record, canvasWidth, canvasHeight, timeLength) {
    const points = record.speedChangePoints;
    for (let index = 0; index < points.length; index += 1) {
      const [bpm, time] = points[index];
      const x1 = timeToX(time / 1e3);
      const y1 = logScaleY(bpm, record.mainbpm, canvasHeight) - 1;
      const next = points[index + 1];
      const x2 = next ? timeToX(next[1] / 1e3) : canvasWidth;
      let color = "#ffff00";
      if (bpm <= 0) {
        color = "#ff00ff";
      } else if (bpm === record.mainbpm) {
        color = "#00ff00";
      } else if (bpm === record.minbpm) {
        color = "#0000ff";
      } else if (bpm === record.maxbpm) {
        color = "#ff0000";
      }
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x1 - 1, y1);
      context.lineTo(x2 + 1, y1);
      context.stroke();
      if (next) {
        const y2 = logScaleY(next[0], record.mainbpm, canvasHeight) - 1;
        if (Math.abs(y2 - y1) >= 1) {
          context.strokeStyle = "rgba(127, 127, 127, 0.5)";
          context.beginPath();
          context.moveTo(x2, y2 < y1 ? y1 - 1 : y1 + 1);
          context.lineTo(x2, y2 < y1 ? y2 + 1 : y2 - 1);
          context.stroke();
        }
      }
    }
  }
  function drawSelectedTimeLine(context, x, canvasHeight) {
    context.save();
    context.strokeStyle = "#ff2c2c";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, canvasHeight);
    context.stroke();
    context.restore();
  }
  function renderTooltip(tooltip, event, record, timeSec) {
    const timeIndex = Math.floor(timeSec);
    const counts = record.distributionSegments[timeIndex] ?? Array.from({ length: 7 }, () => 0);
    let bpmDisplay = 0;
    for (let index = record.speedChangePoints.length - 1; index >= 0; index -= 1) {
      if (timeSec * 1e3 >= record.speedChangePoints[index][1]) {
        bpmDisplay = record.speedChangePoints[index][0];
        break;
      }
    }
    let html = `${timeSec.toFixed(1)} sec<br>`;
    html += `BPM: ${bpmDisplay}<br>`;
    html += `Notes: ${counts.reduce((total, count) => total + count, 0)}<br>`;
    counts.forEach((count, index) => {
      if (count > 0) {
        html += `<span style="color: ${DISTRIBUTION_NOTE_COLORS[index]}; background-color: transparent;">■</span> ${count} - ${DISTRIBUTION_NOTE_NAMES[index]}<br>`;
      }
    });
    tooltip.innerHTML = html;
    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY + 10}px`;
    tooltip.style.display = "block";
  }
  function hideTooltip(tooltip) {
    tooltip.style.display = "none";
  }
  function getHoverTimeSec(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    return mouseX / (RECT_WIDTH + SPACING);
  }
  function logScaleY(bpm, mainBpm, canvasHeight) {
    const ratio = Math.min(Math.max(bpm / mainBpm, MIN_RATIO), MAX_RATIO);
    const logValue = Math.log10(ratio);
    const t = (logValue - MIN_LOG) / (MAX_LOG - MIN_LOG);
    return canvasHeight - Math.round(t * (canvasHeight - 2));
  }
  function timeToX(timeSec) {
    return Math.round(timeSec * (RECT_WIDTH + SPACING)) + 1;
  }
  function getGraphFollowScrollLeft({
    targetX,
    currentScrollLeft,
    clientWidth,
    scrollWidth
  }) {
    const safeClientWidth = Math.max(clientWidth ?? 0, 1);
    const maxScrollLeft = Math.max(0, (scrollWidth ?? 0) - safeClientWidth);
    const marginPx = clamp2(safeClientWidth * 0.2, GRAPH_SCROLL_FOLLOW_MIN_MARGIN_PX, GRAPH_SCROLL_FOLLOW_MAX_MARGIN_PX);
    const leftBound = (currentScrollLeft ?? 0) + marginPx;
    const rightBound = (currentScrollLeft ?? 0) + safeClientWidth - marginPx;
    if (targetX >= leftBound && targetX <= rightBound) {
      return clamp2(currentScrollLeft ?? 0, 0, maxScrollLeft);
    }
    return clamp2(targetX - safeClientWidth / 2, 0, maxScrollLeft);
  }
  function clamp2(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  // shared/preview-runtime/index.js
  var BMSDATA_STYLE_ID = "bms-info-extender-style";
  var BMSSEARCH_PATTERN_API_BASE_URL = "https://api.bmssearch.net/v1/patterns/sha256";
  var BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
  var SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS = 250;
  var VIEWER_MODE_STORAGE_KEY = "bms-info-extender.viewerMode";
  var INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY = "bms-info-extender.invisibleNoteVisibility";
  var PREVIEW_RENDER_DIRTY = {
    record: 1 << 0,
    selection: 1 << 1,
    viewerModel: 1 << 2,
    playback: 1 << 3,
    pin: 1 << 4,
    viewerMode: 1 << 5,
    invisible: 1 << 6,
    viewerOpen: 1 << 7
  };
  var PREVIEW_RENDER_ALL = Object.values(PREVIEW_RENDER_DIRTY).reduce((mask, flag) => mask | flag, 0);
  var bmsSearchPatternAvailabilityCache = /* @__PURE__ */ new Map();
  function createPreviewPreferenceStorage({ read = () => null, write = () => {
  } } = {}) {
    return {
      getPersistedViewerMode() {
        try {
          return read(VIEWER_MODE_STORAGE_KEY, DEFAULT_VIEWER_MODE);
        } catch (_error) {
          return DEFAULT_VIEWER_MODE;
        }
      },
      setPersistedViewerMode(nextViewerMode) {
        try {
          write(VIEWER_MODE_STORAGE_KEY, nextViewerMode);
        } catch (_error) {
        }
      },
      getPersistedInvisibleNoteVisibility() {
        try {
          return read(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, DEFAULT_INVISIBLE_NOTE_VISIBILITY);
        } catch (_error) {
          return DEFAULT_INVISIBLE_NOTE_VISIBILITY;
        }
      },
      setPersistedInvisibleNoteVisibility(nextVisibility) {
        try {
          write(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, nextVisibility);
        } catch (_error) {
        }
      }
    };
  }
  function expandPreviewRenderMask(renderMask = 0) {
    let expandedMask = renderMask;
    if (expandedMask & PREVIEW_RENDER_DIRTY.viewerModel) {
      expandedMask |= PREVIEW_RENDER_DIRTY.viewerMode | PREVIEW_RENDER_DIRTY.invisible;
    }
    return expandedMask;
  }
  var BMSDATA_CSS = `
  .bmsdata {
    --bd-dctx: #333;
    --bd-dcbk: #fff;
    --bd-hdtx: #eef;
    --bd-hdbk: #669;
  }
  .bmsdata * { line-height: 100%; color: var(--bd-dctx); background-color: var(--bd-dcbk); font-family: "Inconsolata", "Noto Sans JP"; vertical-align: middle; box-sizing: content-box; }
  .bd-info { display: flex; border: 0px; height: 9.6rem; }
  .bd-info a { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border: 1px solid; border-radius: 2px; font-size: 0.750rem; color: #155dfc; text-decoration: none; }
  .bd-info a:hover { color: red; }
  .bd-icon { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border-radius: 2px; background: var(--bd-dctx); color: var(--bd-dcbk); font-size: 0.750rem; }
  .bd-icon:nth-child(n+2) { margin-left: 0.4rem; }
  .bd-info .bd-info-table { flex: 1; border-collapse: collapse; height: 100%; }
  .bd-info td { border: unset; padding: 0.1rem 0.2rem; height: 1rem; white-space: nowrap; font-size: 0.875rem; }
  .bd-info .bd-header-cell { background-color: var(--bd-hdbk); color: var(--bd-hdtx); }
  .bd-info .bd-lanenote { margin-right: 0.2rem; padding: 0.1rem 0.2rem; border-radius: 2px; font-size: 0.750rem; }
  .bd-table-list { flex: 1; display: flex; min-width: 100px; flex-direction: column; box-sizing: border-box; }
  .bd-table-list .bd-header-cell { padding: 0.1rem 0.2rem; min-height: 1rem; white-space: nowrap; font-size: 0.875rem; color: var(--bd-hdtx); display: flex; align-items: center; }
  .bd-table-scroll { overflow: auto; flex: 1 1 auto; scrollbar-color: var(--bd-hdbk) white; scrollbar-width: thin; }
  .bd-table-list ul { padding: 0.1rem 0.2rem; margin: 0; }
  .bd-table-list li { margin-bottom: 0.2rem; line-height: 1rem; font-size: 0.875rem; white-space: nowrap; list-style-type: none; }
  #bd-graph { position: relative; padding: 0px; border-width: 0px; background-color: #000; overflow-x: auto; line-height: 0; scrollbar-color: var(--bd-hdbk) black; scrollbar-width: thin; }
  #bd-graph-canvas { background-color: #000; }
  #bd-graph-tooltip { line-height: 1.25; position: fixed; background: rgba(32, 32, 64, 0.88); color: #fff; padding: 4px 8px; font-size: 0.8125rem; pointer-events: none; border-radius: 6px; display: none; z-index: 10; white-space: nowrap; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22); }
  .bd-scoreviewer-pin { position: absolute; top: 4px; left: 4px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(32, 32, 64, 0.5); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-sizing: border-box; z-index: 2; width: auto; }
  .bd-scoreviewer-pin * { background: transparent; color: #fff; font-family: "Inconsolata", "Noto Sans JP"; }
  .bd-scoreviewer-pin input { width: auto; flex: 0 0 auto; min-height: auto; margin: 0; padding: 0; border: none; background: transparent; accent-color: #ffffff; }
  .bd-scoreviewer-pin span { display: inline-block; line-height: 1.25; white-space: nowrap; }
  .score-viewer-shell * { box-sizing: content-box; }
  .score-viewer-shell { --score-viewer-width: 520px; position: fixed; top: 0; right: 0; width: var(--score-viewer-width); height: 100dvh; background: #000; border-left: 1px solid rgba(112, 112, 132, 0.4); box-shadow: -12px 0 32px rgba(0, 0, 0, 0.38); overflow: hidden; z-index: 2147483000; opacity: 0; pointer-events: none; transform: translateX(100%); transition: transform 120ms ease, opacity 120ms ease; isolation: isolate; contain: layout paint style; }
  .score-viewer-shell.is-visible { opacity: 1; pointer-events: auto; transform: translateX(0); }
  .score-viewer-scroll-host { position: absolute; inset: 0; overflow-x: hidden; overflow-y: hidden; scrollbar-gutter: stable; contain: layout paint; }
  .score-viewer-scroll-host.is-scrollable { overflow-y: auto; cursor: grab; touch-action: none; }
  .score-viewer-scroll-host.is-scrollable.is-dragging { cursor: grabbing; }
  .score-viewer-spacer { width: 1px; opacity: 0; }
  .score-viewer-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .score-viewer-marker-overlay, .score-viewer-marker-labels { position: absolute; inset: 0; pointer-events: none; contain: layout paint; }
  .score-viewer-marker-label { position: absolute; top: 0; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1; white-space: nowrap; text-shadow: 0 0 4px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.72); }
  .score-viewer-marker-label.is-left { transform: translate(-100%, -50%); text-align: right; }
  .score-viewer-marker-label.is-right { transform: translate(0, -50%); text-align: left; }
  .score-viewer-bottom-bar { position: absolute; left: 12px; bottom: 12px; z-index: 3; pointer-events: none; contain: layout paint; }
  .score-viewer-status-panel { display: grid; gap: 4px; min-width: 180px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(160, 160, 196, 0.22); background: rgba(32, 32, 64, 0.8); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24); pointer-events: auto; contain: layout paint style; }
  .score-viewer-status-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .score-viewer-status-row.is-time { justify-content: flex-start; gap: 8px; }
  .score-viewer-status-metric { font-variant-numeric: tabular-nums; }
  .score-viewer-spacing-row { padding-top: 2px; }
  .score-viewer-spacing-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .score-viewer-spacing-value { margin-left: auto; color: #fff; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
  .score-viewer-mode-row { display: grid; gap: 4px; align-items: stretch; }
  .score-viewer-mode-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .score-viewer-mode-controls { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 6px; width: 100%; min-width: 0; box-sizing: border-box; }
  .score-viewer-mode-select { width: 100%; min-width: 0; min-height: auto; padding: 1px 6px; border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 4px; background: rgba(16, 16, 28, 0.95); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1.25; box-sizing: border-box; }
  .score-viewer-mode-select:disabled { opacity: 0.55; cursor: not-allowed; }
  .score-viewer-playback-button { display: inline-flex; align-items: center; justify-content: center; width: 20px; min-width: 20px; height: 20px; min-height: 20px; padding: 0; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.24); background: rgba(255, 255, 255, 0.16); color: #fff; box-shadow: none; font-size: 0.58rem; line-height: 1; pointer-events: auto; cursor: pointer; }
  .score-viewer-playback-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .score-viewer-playback-time { font-variant-numeric: tabular-nums; }
  .score-viewer-spacing-input { width: 100%; min-height: auto; margin: 0; padding: 0; background: transparent; border: none; accent-color: #ffffff; pointer-events: auto; }
  .score-viewer-judge-line { position: absolute; left: 0; right: 0; top: 50%; display: flex; align-items: center; transform: translateY(-50%); pointer-events: none; }
  .score-viewer-judge-line::after { content: ""; width: 100%; height: 2px; background: linear-gradient(90deg, rgba(187, 71, 49, 0.18) 0%, rgba(187, 71, 49, 0.94) 48%, rgba(187, 71, 49, 0.18) 100%); box-shadow: 0 0 20px rgba(187, 71, 49, 0.2); }
  .bd-lanenote[lane="0"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="1"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="2"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="3"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="4"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="5"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="6"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="7"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="8"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="9"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="10"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="11"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="12"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="13"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="14"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="15"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="g0"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="g1"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g2"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g3"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g4"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g5"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g6"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g7"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g8"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g9"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g10"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g11"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="p0"] { background: #c4c4c4; color: #000; }
  .bd-lanenote[lane="p1"] { background: #fff500; color: #000; }
  .bd-lanenote[lane="p2"] { background: #99ff67; color: #000; }
  .bd-lanenote[lane="p3"] { background: #30b9f9; color: #000; }
  .bd-lanenote[lane="p4"] { background: #ff6c6c; color: #000; }
  .bd-lanenote[lane="p5"] { background: #30b9f9; color: #000; }
  .bd-lanenote[lane="p6"] { background: #99ff67; color: #000; }
  .bd-lanenote[lane="p7"] { background: #fff500; color: #000; }
  .bd-lanenote[lane="p8"] { background: #c4c4c4; color: #000; }
`;
  var BMSDATA_TEMPLATE_HTML = `
  <div id="bmsdata-container" class="bmsdata" style="display: none;">
    <div class="bd-info">
      <table class="bd-info-table">
        <tr>
          <td class="bd-header-cell">LINK</td>
          <td colspan="3">
            <a href="" id="bd-lr2ir" style="display: none;">LR2IR</a><a href="" id="bd-minir" style="display: none;">MinIR</a><a href="" id="bd-mocha" style="display: none;">Mocha</a><a href="" id="bd-viewer" style="display: none;">Viewer</a><a href="" id="bd-bmssearch" style="display: none;">BMS<span style="display:inline-block; width:2px;"></span>SEARCH</a><a href="" id="bd-bokutachi" style="display: none;">Bokutachi</a><a href="" id="bd-stellaverse" style="display: none;">STELLAVERSE</a>
          </td>
        </tr>
        <tr>
          <td class="bd-header-cell">SHA256</td>
          <td colspan="3" id="bd-sha256">Loading...</td>
        </tr>
        <tr>
          <td class="bd-header-cell">MD5</td>
          <td id="bd-md5">Loading...</td>
          <td class="bd-header-cell">BMSID</td>
          <td id="bd-bmsid">Loading...</td>
        </tr>
        <tr>
          <td class="bd-header-cell">BPM</td>
          <td>
            <span class="bd-icon">MAIN</span><span id="bd-mainbpm">0</span><span class="bd-icon">MIN</span><span
              id="bd-minbpm">0</span><span class="bd-icon">MAX</span><span id="bd-maxbpm">0</span>
          </td>
          <td class="bd-header-cell">MODE</td>
          <td id="bd-mode">0</td>
        </tr>
        <tr>
          <td class="bd-header-cell">FEATURE</td>
          <td id="bd-feature">Loading...</td>
          <td class="bd-header-cell">JUDGERANK</td>
          <td id="bd-judgerank">0</td>
        </tr>
        <tr>
          <td class="bd-header-cell">NOTES</td>
          <td id="bd-notes">0 (N: 0, LN: 0, SC: 0, LNSC: 0)</td>
          <td class="bd-header-cell">TOTAL</td>
          <td id="bd-total">0 (0.000 T/N)</td>
        </tr>
        <tr>
          <td class="bd-header-cell">DENSITY</td>
          <td><span class="bd-icon">AVG</span><span id="bd-avgdensity">0.0</span><span class="bd-icon">PEAK</span><span
              id="bd-peakdensity">0</span><span class="bd-icon">END</span><span id="bd-enddensity">0.0</span></td>
          <td class="bd-header-cell">DURATION</td>
          <td id="bd-duration">000.000 s</td>
        </tr>
        <tr>
          <td class="bd-header-cell">LANENOTES</td>
          <td colspan="3">
            <div class="bd-lanenotes" id="bd-lanenotes-div"></div>
          </td>
        </tr>
      </table>
      <div class="bd-table-list">
        <div class="bd-header-cell">TABLES</div>
        <div class="bd-table-scroll">
          <ul id="bd-tables-ul">
          </ul>
        </div>
      </div>
    </div>
    <div id="bd-graph">
      <label class="bd-scoreviewer-pin">
        <input id="bd-scoreviewer-pin-input" type="checkbox">
        <span>Pin the score viewer</span>
      </label>
      <div id="bd-graph-tooltip"></div>
      <canvas id="bd-graph-canvas"></canvas>
    </div>
  </div>
`;
  function ensureBmsDataStyleOnce(documentRef = document) {
    if (documentRef.getElementById(BMSDATA_STYLE_ID)) {
      return;
    }
    const styleElement = documentRef.createElement("style");
    styleElement.id = BMSDATA_STYLE_ID;
    styleElement.textContent = BMSDATA_CSS;
    documentRef.head.appendChild(styleElement);
  }
  function createBmsDataContainer({ documentRef = document, theme }) {
    ensureBmsDataStyleOnce(documentRef);
    const template = documentRef.createElement("template");
    template.innerHTML = BMSDATA_TEMPLATE_HTML.trim();
    const container = template.content.firstElementChild;
    if (!container) {
      throw new Error("BMS preview template did not create a container.");
    }
    if (theme) {
      container.style.setProperty("--bd-dctx", theme.dctx);
      container.style.setProperty("--bd-dcbk", theme.dcbk);
      container.style.setProperty("--bd-hdtx", theme.hdtx);
      container.style.setProperty("--bd-hdbk", theme.hdbk);
    }
    return container;
  }
  function insertBmsDataContainer({ documentRef = document, insertion, theme }) {
    const container = createBmsDataContainer({ documentRef, theme });
    insertion.element.insertAdjacentElement(insertion.position, container);
    return container;
  }
  async function fetchBmsInfoRecordByIdentifiers({ md5 = null, sha256 = null, bmsid = null }) {
    const lookupKey = md5 ?? sha256 ?? bmsid;
    if (!lookupKey) {
      return false;
    }
    try {
      return await fetchBmsInfoRecordByLookupKey(lookupKey);
    } catch (error) {
      console.error("Fetch or parse error:", error);
      return false;
    }
  }
  async function checkBmsSearchPatternExists(sha256) {
    if (!sha256) {
      return false;
    }
    let cachedPromise = bmsSearchPatternAvailabilityCache.get(sha256);
    if (!cachedPromise) {
      cachedPromise = (async () => {
        try {
          const response = await fetch(`${BMSSEARCH_PATTERN_API_BASE_URL}/${sha256}`);
          return response.ok;
        } catch (error) {
          bmsSearchPatternAvailabilityCache.delete(sha256);
          console.warn("BMS SEARCH APIで譜面の存在確認に失敗しました:", error);
          return false;
        }
      })();
      bmsSearchPatternAvailabilityCache.set(sha256, cachedPromise);
    }
    return cachedPromise;
  }
  async function renderBmsSearchLinkIfAvailable(container, sha256) {
    try {
      if (!sha256 || !await checkBmsSearchPatternExists(sha256) || !container.isConnected) {
        return;
      }
      const bmsSearchLink = container.querySelector("#bd-bmssearch");
      if (!bmsSearchLink) {
        return;
      }
      showLink(bmsSearchLink, `${BMSSEARCH_PATTERN_PAGE_BASE_URL}/${sha256}`);
    } catch (error) {
      console.warn("BMS SEARCHリンクの表示に失敗しました:", error);
    }
  }
  function renderBmsData(container, normalizedRecord) {
    const getById = (id) => container.querySelector(`#${id}`);
    renderLinks(container, normalizedRecord);
    getById("bd-sha256").textContent = normalizedRecord.sha256;
    getById("bd-md5").textContent = normalizedRecord.md5;
    getById("bd-bmsid").textContent = normalizedRecord.bmsid ? normalizedRecord.bmsid : "Undefined";
    getById("bd-mainbpm").textContent = formatCompactNumber(normalizedRecord.mainbpm);
    getById("bd-maxbpm").textContent = formatCompactNumber(normalizedRecord.maxbpm);
    getById("bd-minbpm").textContent = formatCompactNumber(normalizedRecord.minbpm);
    getById("bd-mode").textContent = normalizedRecord.mode;
    getById("bd-feature").textContent = normalizedRecord.featureNames.join(", ");
    getById("bd-judgerank").textContent = normalizedRecord.judge;
    getById("bd-notes").textContent = normalizedRecord.notesStr;
    getById("bd-total").textContent = normalizedRecord.totalStr;
    getById("bd-avgdensity").textContent = normalizedRecord.density.toFixed(3);
    getById("bd-peakdensity").textContent = formatCompactNumber(normalizedRecord.peakdensity);
    getById("bd-enddensity").textContent = formatCompactNumber(normalizedRecord.enddensity);
    getById("bd-duration").textContent = normalizedRecord.durationStr;
    renderLaneNotes(container, normalizedRecord);
    renderTables(container, normalizedRecord);
    container.style.display = "block";
    void renderBmsSearchLinkIfAvailable(container, normalizedRecord.sha256);
  }
  function createBmsInfoPreview({
    container,
    documentRef = document,
    loadParsedScore = async () => null,
    prefetchParsedScore = async () => {
    },
    getPersistedViewerMode = () => DEFAULT_VIEWER_MODE,
    setPersistedViewerMode = () => {
    },
    getPersistedInvisibleNoteVisibility = () => DEFAULT_INVISIBLE_NOTE_VISIBILITY,
    setPersistedInvisibleNoteVisibility = () => {
    },
    onSelectedTimeChange = () => {
    },
    onPinChange = () => {
    },
    onPlaybackChange = () => {
    },
    onViewerOpenChange = () => {
    },
    onRuntimeError = () => {
    }
  }) {
    const graphHost = container.querySelector("#bd-graph");
    const graphCanvas = container.querySelector("#bd-graph-canvas");
    const graphTooltip = container.querySelector("#bd-graph-tooltip");
    const pinInput = container.querySelector("#bd-scoreviewer-pin-input");
    if (!graphHost || !graphCanvas || !graphTooltip || !pinInput) {
      throw new Error("BMS preview graph elements are missing.");
    }
    const shell = documentRef.createElement("div");
    shell.className = "score-viewer-shell";
    documentRef.body.appendChild(shell);
    const parsedScoreCache = /* @__PURE__ */ new Map();
    const loadPromiseCache = /* @__PURE__ */ new Map();
    const state = {
      record: null,
      selectedSha256: null,
      selectedTimeSec: 0,
      selectedBeat: 0,
      viewerMode: getInitialViewerMode(getPersistedViewerMode),
      invisibleNoteVisibility: getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility),
      isPinned: false,
      isViewerOpen: false,
      isPlaying: false,
      isGraphHovered: false,
      parsedScore: null,
      viewerModel: null,
      loadToken: 0,
      renderFrameId: null,
      pendingRenderMask: 0,
      playbackFrameId: null,
      lastPlaybackTimestamp: null,
      lastViewerOpenState: false,
      isDestroyed: false
    };
    const viewerController = createScoreViewerController({
      root: shell,
      onTimeChange: (selection) => {
        const nextTimeSec = typeof selection === "object" ? selection.timeSec : selection;
        setSelectedTimeSec(nextTimeSec, {
          openViewer: true,
          notify: true,
          beatHint: selection?.beat,
          source: selection?.source ?? "viewer"
        });
      },
      onPlaybackToggle: (nextPlaying) => {
        setPlaybackState(nextPlaying);
      },
      onViewerModeChange: (nextViewerMode) => {
        setViewerMode(nextViewerMode);
      },
      onInvisibleNoteVisibilityChange: (nextVisibility) => {
        setInvisibleNoteVisibility(nextVisibility);
      }
    });
    const graphController = createBmsInfoGraph({
      scrollHost: graphHost,
      canvas: graphCanvas,
      tooltip: graphTooltip,
      pinInput,
      onHoverTime: (timeSec) => {
        handleGraphHover(timeSec);
      },
      onHoverLeave: () => {
        state.isGraphHovered = false;
        if (!state.isPinned && !state.isPlaying) {
          state.isViewerOpen = false;
        }
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
      },
      onSelectTime: (timeSec) => {
        state.isPinned = true;
        onPinChange(true);
        void activateRecord({ openViewer: true });
        setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
      },
      onPinChange: (nextPinned) => {
        state.isPinned = Boolean(nextPinned);
        onPinChange(state.isPinned);
        if (state.isPinned) {
          state.isViewerOpen = true;
          void activateRecord({ openViewer: true });
        } else if (!state.isGraphHovered && !state.isPlaying) {
          state.isViewerOpen = false;
        }
        scheduleRender(PREVIEW_RENDER_DIRTY.pin | PREVIEW_RENDER_DIRTY.viewerOpen);
      }
    });
    return {
      setRecord,
      setSelectedTimeSec,
      setViewerMode,
      setInvisibleNoteVisibility,
      setPinned,
      setPlaybackState,
      prefetch,
      destroy,
      getState: () => ({
        ...state,
        resolvedViewerMode: getResolvedViewerMode(state)
      })
    };
    function setRecord(normalizedRecord, { parsedScore = null } = {}) {
      const previousSha256 = state.record?.sha256 ?? null;
      const nextSha256Value = normalizedRecord?.sha256 ?? null;
      const recordChanged = previousSha256 !== nextSha256Value || state.record !== normalizedRecord;
      let renderMask = 0;
      state.record = normalizedRecord;
      if (!normalizedRecord) {
        state.selectedSha256 = null;
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedTimeSec = 0;
        state.selectedBeat = 0;
        state.isViewerOpen = false;
        renderMask |= PREVIEW_RENDER_ALL;
        scheduleRender(renderMask);
        return;
      }
      if (recordChanged) {
        renderBmsData(container, normalizedRecord);
        shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode)}px`);
        renderMask |= PREVIEW_RENDER_DIRTY.record;
      }
      const nextSha256 = normalizedRecord.sha256 ? normalizedRecord.sha256.toLowerCase() : null;
      if (parsedScore && nextSha256) {
        const viewerModel = createScoreViewerModel(parsedScore);
        parsedScoreCache.set(nextSha256, { score: parsedScore, viewerModel });
        state.parsedScore = parsedScore;
        state.viewerModel = viewerModel;
        state.selectedSha256 = nextSha256;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
        renderMask |= PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection;
      } else if (state.selectedSha256 !== nextSha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedSha256 = nextSha256;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        state.selectedBeat = 0;
        renderMask |= PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection;
      }
      scheduleRender(renderMask || PREVIEW_RENDER_DIRTY.selection);
    }
    async function prefetch() {
      if (!state.record?.sha256) {
        return;
      }
      try {
        await prefetchParsedScore(state.record);
      } catch (error) {
        console.warn("Score prefetch failed:", error);
      }
    }
    function handleGraphHover(timeSec) {
      state.isGraphHovered = true;
      void activateRecord({ openViewer: true });
      if (state.isPlaying) {
        return;
      }
      setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
    }
    async function activateRecord({ openViewer = false } = {}) {
      if (!state.record) {
        return;
      }
      if (openViewer) {
        state.isViewerOpen = true;
      }
      const sha256 = state.record.sha256 ? state.record.sha256.toLowerCase() : null;
      if (!sha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.viewerOpen);
        return;
      }
      if (state.selectedSha256 === sha256 && state.viewerModel) {
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
        return;
      }
      state.selectedSha256 = sha256;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
      await loadSelectedRecord(state.record);
    }
    async function loadSelectedRecord(normalizedRecord) {
      if (!normalizedRecord?.sha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedBeat = 0;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
        return;
      }
      const sha256 = normalizedRecord.sha256.toLowerCase();
      const loadToken = ++state.loadToken;
      if (parsedScoreCache.has(sha256)) {
        const cached = parsedScoreCache.get(sha256);
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        applyLoadedScore(cached.score, cached.viewerModel);
        return;
      }
      try {
        let loadPromise = loadPromiseCache.get(sha256);
        if (!loadPromise) {
          loadPromise = Promise.resolve(loadParsedScore(normalizedRecord)).then((parsedScore) => {
            if (!parsedScore) {
              throw new Error("Parsed score was not returned.");
            }
            const viewerModel = createScoreViewerModel(parsedScore);
            const cached2 = { score: parsedScore, viewerModel };
            parsedScoreCache.set(sha256, cached2);
            loadPromiseCache.delete(sha256);
            return cached2;
          }).catch((error) => {
            loadPromiseCache.delete(sha256);
            throw error;
          });
          loadPromiseCache.set(sha256, loadPromise);
        }
        const cached = await loadPromise;
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        applyLoadedScore(cached.score, cached.viewerModel);
      } catch (error) {
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        console.warn("Score viewer parse/load failed:", error);
        onRuntimeError(error);
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedBeat = 0;
        state.isViewerOpen = false;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.viewerOpen);
      }
    }
    function applyLoadedScore(parsedScore, viewerModel) {
      state.parsedScore = parsedScore;
      state.viewerModel = viewerModel;
      state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
      state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
    }
    function setSelectedTimeSec(nextTimeSec, { openViewer = false, notify = false, beatHint = void 0, source = "external" } = {}) {
      const clampedTimeSec = clampSelectedTimeSec(state, nextTimeSec);
      const resolvedViewerMode = getResolvedViewerMode(state);
      const nextBeat = resolveSelectedBeat(state, clampedTimeSec, beatHint, resolvedViewerMode);
      const changed = hasViewerSelectionChanged(
        state.viewerModel,
        resolvedViewerMode,
        state.selectedTimeSec,
        clampedTimeSec,
        state.selectedBeat,
        nextBeat
      );
      if (openViewer) {
        state.isViewerOpen = true;
      }
      state.selectedTimeSec = clampedTimeSec;
      state.selectedBeat = nextBeat;
      if (notify && changed) {
        onSelectedTimeChange({
          timeSec: clampedTimeSec,
          beat: nextBeat,
          viewerMode: resolvedViewerMode,
          source
        });
      }
      if (!changed && !openViewer) {
        return;
      }
      scheduleRender(
        PREVIEW_RENDER_DIRTY.selection | (openViewer ? PREVIEW_RENDER_DIRTY.viewerOpen : 0)
      );
    }
    function setViewerMode(nextViewerMode) {
      const normalizedMode = normalizeViewerMode(nextViewerMode);
      if (state.viewerMode === normalizedMode) {
        return;
      }
      state.viewerMode = normalizedMode;
      state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
      try {
        setPersistedViewerMode(normalizedMode);
      } catch (error) {
        console.warn("Failed to persist viewer mode:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerMode | PREVIEW_RENDER_DIRTY.selection);
    }
    function setInvisibleNoteVisibility(nextVisibility) {
      const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
      if (state.invisibleNoteVisibility === normalizedVisibility) {
        return;
      }
      state.invisibleNoteVisibility = normalizedVisibility;
      try {
        setPersistedInvisibleNoteVisibility(normalizedVisibility);
      } catch (error) {
        console.warn("Failed to persist invisible note visibility:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.invisible);
    }
    function setPinned(nextPinned) {
      const normalized = Boolean(nextPinned);
      if (state.isPinned === normalized) {
        return;
      }
      state.isPinned = normalized;
      onPinChange(state.isPinned);
      if (state.isPinned) {
        state.isViewerOpen = true;
        void activateRecord({ openViewer: true });
      } else if (!state.isGraphHovered && !state.isPlaying) {
        state.isViewerOpen = false;
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.pin | PREVIEW_RENDER_DIRTY.viewerOpen);
    }
    function setPlaybackState(nextPlaying) {
      if (state.isPlaying === Boolean(nextPlaying) && state.viewerModel && state.parsedScore) {
        return;
      }
      if (!state.viewerModel || !state.parsedScore) {
        stopPlayback(false);
        scheduleRender(PREVIEW_RENDER_DIRTY.playback);
        return;
      }
      if (nextPlaying) {
        startPlayback();
      } else {
        stopPlayback(true);
      }
    }
    function startPlayback() {
      if (!state.viewerModel || !state.parsedScore) {
        return;
      }
      const maxTimeSec = getScoreTotalDurationSec(state.parsedScore);
      if (maxTimeSec <= 0) {
        return;
      }
      if (state.selectedTimeSec >= maxTimeSec - 5e-4) {
        setSelectedTimeSec(0, { notify: true, source: "playback" });
      }
      state.isPlaying = true;
      state.isViewerOpen = true;
      state.lastPlaybackTimestamp = null;
      onPlaybackChange(true);
      if (state.playbackFrameId !== null) {
        cancelAnimationFrame(state.playbackFrameId);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.playback | PREVIEW_RENDER_DIRTY.viewerOpen);
      state.playbackFrameId = requestAnimationFrame(stepPlayback);
    }
    function stopPlayback(renderAfter = true) {
      if (state.playbackFrameId !== null) {
        cancelAnimationFrame(state.playbackFrameId);
        state.playbackFrameId = null;
      }
      state.lastPlaybackTimestamp = null;
      if (state.isPlaying) {
        state.isPlaying = false;
        onPlaybackChange(false);
      }
      if (renderAfter) {
        scheduleRender(PREVIEW_RENDER_DIRTY.playback);
      }
    }
    function stepPlayback(timestamp) {
      if (!state.isPlaying || !state.viewerModel || !state.parsedScore) {
        state.playbackFrameId = null;
        state.lastPlaybackTimestamp = null;
        return;
      }
      if (state.lastPlaybackTimestamp === null || timestamp - state.lastPlaybackTimestamp > SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS) {
        state.lastPlaybackTimestamp = timestamp;
        state.playbackFrameId = requestAnimationFrame(stepPlayback);
        return;
      }
      const deltaSec = (timestamp - state.lastPlaybackTimestamp) / 1e3;
      state.lastPlaybackTimestamp = timestamp;
      const maxTimeSec = getScoreTotalDurationSec(state.parsedScore);
      const nextTimeSec = Math.min(state.selectedTimeSec + deltaSec, maxTimeSec);
      const resolvedViewerMode = getResolvedViewerMode(state);
      const nextBeat = resolveSelectedBeat(state, nextTimeSec, void 0, resolvedViewerMode);
      const changed = hasViewerSelectionChanged(
        state.viewerModel,
        resolvedViewerMode,
        state.selectedTimeSec,
        nextTimeSec,
        state.selectedBeat,
        nextBeat
      );
      state.selectedTimeSec = nextTimeSec;
      state.selectedBeat = nextBeat;
      if (changed) {
        onSelectedTimeChange({
          timeSec: state.selectedTimeSec,
          beat: nextBeat,
          viewerMode: resolvedViewerMode,
          source: "playback"
        });
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.selection);
      if (nextTimeSec >= maxTimeSec - 5e-4) {
        stopPlayback(false);
        scheduleRender(PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.playback);
        return;
      }
      state.playbackFrameId = requestAnimationFrame(stepPlayback);
    }
    function scheduleRender(renderMask = PREVIEW_RENDER_ALL) {
      if (state.isDestroyed) {
        return;
      }
      state.pendingRenderMask |= renderMask;
      if (state.renderFrameId !== null) {
        return;
      }
      state.renderFrameId = requestAnimationFrame(() => {
        state.renderFrameId = null;
        flushRender(state.pendingRenderMask);
        state.pendingRenderMask = 0;
      });
    }
    function flushRender(renderMask = PREVIEW_RENDER_ALL) {
      const expandedRenderMask = expandPreviewRenderMask(renderMask);
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.record) {
        graphController.setRecord(state.record);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.pin) {
        graphController.setPinned(state.isPinned);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.selection) {
        graphController.setSelectedTimeSec(state.selectedTimeSec);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel) {
        viewerController.setModel(state.viewerModel);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerMode) {
        viewerController.setViewerMode(state.viewerMode);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.invisible) {
        viewerController.setInvisibleNoteVisibility(state.invisibleNoteVisibility);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.playback) {
        viewerController.setPlaybackState(state.isPlaying);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.pin) {
        viewerController.setPinned(state.isPinned);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.selection || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerMode) {
        viewerController.setSelectedTimeSec(state.selectedTimeSec, { beatHint: state.selectedBeat });
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerOpen || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel) {
        viewerController.setOpen(Boolean(state.isViewerOpen && state.viewerModel));
      }
      const isActuallyOpen = Boolean(state.isViewerOpen && state.viewerModel);
      if (state.lastViewerOpenState !== isActuallyOpen) {
        state.lastViewerOpenState = isActuallyOpen;
        onViewerOpenChange(isActuallyOpen);
      }
    }
    function destroy() {
      state.isDestroyed = true;
      if (state.renderFrameId !== null) {
        cancelAnimationFrame(state.renderFrameId);
        state.renderFrameId = null;
      }
      stopPlayback(false);
      graphController.destroy();
      viewerController.destroy();
      shell.remove();
    }
  }
  function renderLinks(container, normalizedRecord) {
    const getById = (id) => container.querySelector(`#${id}`);
    if (normalizedRecord.md5) {
      showLink(getById("bd-lr2ir"), `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${normalizedRecord.md5}`);
      showLink(getById("bd-viewer"), `https://bms-score-viewer.pages.dev/view?md5=${normalizedRecord.md5}`);
    }
    if (normalizedRecord.sha256) {
      showLink(getById("bd-minir"), `https://www.gaftalk.com/minir/#/viewer/song/${normalizedRecord.sha256}/0`);
      showLink(getById("bd-mocha"), `https://mocha-repository.info/song.php?sha256=${normalizedRecord.sha256}`);
    }
    if (normalizedRecord.stella) {
      showLink(getById("bd-stellaverse"), `https://stellabms.xyz/song/${normalizedRecord.stella}`);
    }
  }
  function renderLaneNotes(container, normalizedRecord) {
    const laneNotesContainer = container.querySelector("#bd-lanenotes-div");
    if (!laneNotesContainer) {
      return;
    }
    laneNotesContainer.replaceChildren();
    normalizedRecord.lanenotesArr.forEach((laneNotes, index) => {
      const span = container.ownerDocument.createElement("span");
      span.className = "bd-lanenote";
      span.setAttribute("lane", getLaneChipKey(normalizedRecord.mode, index));
      span.textContent = String(laneNotes[3]);
      laneNotesContainer.appendChild(span);
    });
  }
  function renderTables(container, normalizedRecord) {
    const tableList = container.querySelector("#bd-tables-ul");
    if (!tableList) {
      return;
    }
    tableList.replaceChildren();
    normalizedRecord.tables.forEach((text) => {
      const item = container.ownerDocument.createElement("li");
      item.textContent = text;
      tableList.appendChild(item);
    });
  }
  function showLink(linkElement, href) {
    if (!linkElement) {
      return;
    }
    linkElement.href = href;
    linkElement.style.display = "inline";
  }
  function clampSelectedTimeSec(state, timeSec) {
    if (state.viewerModel) {
      return getClampedSelectedTimeSec(state.viewerModel, timeSec);
    }
    const maxTimeSec = state.record?.durationSec ?? 0;
    return clampValue(Number.isFinite(timeSec) ? timeSec : 0, 0, Math.max(maxTimeSec, 0));
  }
  function getResolvedViewerMode(state) {
    return resolveViewerModeForModel(state.viewerModel, state.viewerMode);
  }
  function resolveSelectedBeat(state, timeSec, beatHint = void 0, resolvedViewerMode = getResolvedViewerMode(state)) {
    if (resolvedViewerMode === "time") {
      return 0;
    }
    if (Number.isFinite(beatHint)) {
      return getClampedSelectedBeat(state.viewerModel, beatHint);
    }
    return getBeatAtTimeSec(state.viewerModel, timeSec);
  }
  function getInitialViewerMode(getPersistedViewerMode) {
    try {
      return normalizeViewerMode(getPersistedViewerMode?.());
    } catch (error) {
      console.warn("Failed to read persisted viewer mode:", error);
      return DEFAULT_VIEWER_MODE;
    }
  }
  function getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility) {
    try {
      return normalizeInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility?.());
    } catch (error) {
      console.warn("Failed to read persisted invisible note visibility:", error);
      return DEFAULT_INVISIBLE_NOTE_VISIBILITY;
    }
  }
  function estimateViewerWidthFromNumericMode(mode) {
    switch (Number(mode)) {
      case 5:
        return estimateViewerWidth("5k", 6);
      case 7:
        return estimateViewerWidth("7k", 8);
      case 9:
        return estimateViewerWidth("popn-9k", 9);
      case 10:
        return estimateViewerWidth("10k", 12);
      case 14:
        return estimateViewerWidth("14k", 16);
      default:
        return estimateViewerWidth(String(mode ?? ""), getDisplayLaneCount(mode));
    }
  }
  function getDisplayLaneCount(mode) {
    switch (mode) {
      case 5:
      case "5k":
        return 6;
      case 7:
      case "7k":
        return 8;
      case 10:
      case "10k":
        return 12;
      case 14:
      case "14k":
        return 16;
      case 9:
      case "9k":
      case "popn-9k":
        return 9;
      case "popn-5k":
        return 5;
      default:
        return Number.isFinite(Number(mode)) && Number(mode) > 0 ? Number(mode) : 8;
    }
  }
  function formatCompactNumber(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return Number.isInteger(value) ? String(Math.trunc(value)) : String(value);
  }
  function clampValue(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  // tampermonkey/src/main.js
  (function() {
    "use strict";
    console.info("BMS Info Extenderが起動しました");
    const fontCSS = GM_getResourceText("googlefont");
    GM_addStyle(fontCSS);
    const SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
    const SCORE_PARSER_BASE_URL = "https://bms-info-extender.netlify.app/score-parser";
    const SCORE_PARSER_VERSION = "0.6.2";
    const BMSSEARCH_PATTERN_PAGE_BASE_URL2 = "https://bmssearch.net/patterns";
    let scoreLoaderContextPromise = null;
    let activeBmsPreviewRuntime = null;
    const LR2IR_SELECTORS = {
      allAnchors: "a",
      registeredSongHeading: "#box > h2",
      search: "#search",
      registeredSongFallbackBody: "#box > table:nth-child(10) > tbody"
    };
    const STELLAVERSE_SELECTORS = {
      datetimeElem: "#thread-1 > div:nth-child(1) > div > div:nth-child(1) > div:nth-child(1) > p:last-of-type",
      targetElem: "#scroll-area > section > main > h2",
      tableContainer: '[data-slot="table-container"]',
      tableRow: '[data-slot="table-row"]',
      tableHead: '[data-slot="table-head"]',
      tableCell: '[data-slot="table-cell"]',
      anchor: "a"
    };
    const STELLAVERSE_INDEXES = {
      notesCell: 1,
      totalCell: 3,
      removeRowsAfterSuccess: [4, 0]
    };
    const MINIR_SELECTORS = {
      targetElement: "#root > div > div > div > div.compact.tabulator"
    };
    const MOCHA_SELECTORS = {
      songInfoTable: "#main > table.songinfo",
      songInfoBody: "#main > table.songinfo > tbody",
      form: "#main > form",
      songInfoContentCell: "td.songinfo_content",
      anchor: "a"
    };
    const MOCHA_ROW_INDEXES = {
      mode: 1,
      totalNotes: 3,
      total: 4,
      judgerank: 5,
      bpm: 6,
      otherIr: 10
    };
    const MOCHA_LINK_INDEXES = {
      lr2irInOtherIrRow: 2
    };
    bootstrap();
    function bootstrap() {
      switch (location.hostname) {
        case "www.dream-pro.info":
          lr2ir();
          break;
        case "stellabms.xyz":
          stellaverse();
          break;
        case "www.gaftalk.com":
          minir();
          break;
        case "mocha-repository.info":
          mocha();
          break;
        default:
          break;
      }
    }
    function installLocationChangeHookOnce() {
      const hookFlag = "__bmsInfoExtenderLocationHookInstalled";
      if (window[hookFlag]) {
        return;
      }
      window[hookFlag] = true;
      const dispatchLocationChange = () => {
        window.dispatchEvent(new Event("locationchange"));
      };
      const pushState = history.pushState;
      history.pushState = function(...args) {
        const result = pushState.apply(this, args);
        dispatchLocationChange();
        return result;
      };
      const replaceState = history.replaceState;
      history.replaceState = function(...args) {
        const result = replaceState.apply(this, args);
        dispatchLocationChange();
        return result;
      };
      window.addEventListener("popstate", dispatchLocationChange);
    }
    function watchSpaPage({ siteName, matchUrl, updatePage, isSettled }) {
      let lastUrl = location.href;
      let completedUrl = null;
      let observer = null;
      let isUpdating = false;
      function markUpdated() {
        completedUrl = location.href;
      }
      function shouldStopObserving() {
        return completedUrl === location.href || !matchUrl(location.href) || Boolean(isSettled?.());
      }
      async function runUpdate() {
        if (isUpdating || completedUrl === location.href || !matchUrl(location.href) || isSettled?.()) {
          if (shouldStopObserving()) {
            stopObserving();
          }
          return;
        }
        isUpdating = true;
        try {
          await updatePage({ markUpdated });
        } finally {
          isUpdating = false;
          if (shouldStopObserving()) {
            stopObserving();
          }
        }
      }
      function startObserving() {
        if (observer || !matchUrl(location.href) || !document.body) {
          return;
        }
        console.log(`👁️ ${siteName}: MutationObserverによる監視を開始します`);
        observer = new MutationObserver(async () => {
          console.info("MutationObserverがDOMの変化を検知しました");
          if (!document.hidden) {
            await runUpdate();
          }
          if (shouldStopObserving()) {
            stopObserving();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
      function stopObserving() {
        if (observer) {
          observer.disconnect();
          observer = null;
          console.log(`🛑 ${siteName}: MutationObserverによる監視を停止します`);
        }
      }
      installLocationChangeHookOnce();
      if (document.readyState === "complete") {
        console.info("🔥 loadイベントは発火済でした");
        startObserving();
        void runUpdate();
      } else {
        window.addEventListener("load", () => {
          console.info("🔥 loadイベントが発火しました");
          startObserving();
          void runUpdate();
        });
      }
      document.addEventListener("visibilitychange", () => {
        console.info("🔥 Visibilitychangeイベントが発火しました");
        if (document.hidden) {
          return;
        }
        startObserving();
        void runUpdate();
      });
      window.addEventListener("locationchange", () => {
        if (location.href === lastUrl) {
          return;
        }
        lastUrl = location.href;
        completedUrl = null;
        console.log("🔄 URLが変化しました:", lastUrl);
        resetActiveBmsPreviewRuntime();
        if (matchUrl(location.href)) {
          startObserving();
          if (!document.hidden) {
            void runUpdate();
          }
        } else {
          stopObserving();
        }
      });
      startObserving();
    }
    function resetActiveBmsPreviewRuntime() {
      if (!activeBmsPreviewRuntime) {
        return;
      }
      activeBmsPreviewRuntime.destroy();
      activeBmsPreviewRuntime = null;
    }
    function findAnchorByText(anchors, text) {
      let matchedAnchor = null;
      for (const anchor of anchors) {
        if (anchor.innerText == text) {
          matchedAnchor = anchor;
        }
      }
      return matchedAnchor;
    }
    function getStellaverseDomRefs() {
      const datetimeElem = document.querySelector(STELLAVERSE_SELECTORS.datetimeElem);
      const targetElem = document.querySelector(STELLAVERSE_SELECTORS.targetElem);
      const tableContainer = document.querySelector(STELLAVERSE_SELECTORS.tableContainer);
      const tableRows = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableRow)) : [];
      const tableHeads = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableHead)) : [];
      const tableCells = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableCell)) : [];
      const anchors = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.anchor)) : [];
      return { datetimeElem, targetElem, tableContainer, tableRows, tableHeads, tableCells, anchors };
    }
    function getMochaSongInfoRefs() {
      const songInfoTable = document.querySelector(MOCHA_SELECTORS.songInfoTable);
      const songInfoBody = document.querySelector(MOCHA_SELECTORS.songInfoBody);
      const songInfoRows = songInfoBody ? Array.from(songInfoBody.children) : [];
      return { songInfoTable, songInfoBody, songInfoRows };
    }
    async function lr2ir() {
      console.info("LR2IRの処理に入りました");
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", async (event) => {
          console.info("🔥 DOMContentLoadedイベントが発火しました");
          await updatePage();
        });
      } else {
        console.info("🔥 DOMContentLoadedイベントは発火済です");
        await updatePage();
      }
      async function updatePage() {
        if (!location.href.startsWith("http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking")) {
          return;
        }
        console.info("LR2IR曲ページの書き換え処理に入りました");
        let targetbmsid = null;
        const anchors = Array.from(document.querySelectorAll(LR2IR_SELECTORS.allAnchors));
        const historyAnchor = findAnchorByText(anchors, "更新履歴");
        if (historyAnchor) {
          targetbmsid = new URL(historyAnchor.href).searchParams.get("bmsid");
        }
        const targetmd5 = new URL(window.location.href).searchParams.get("bmsmd5");
        let htmlTargetElement = document.querySelector(LR2IR_SELECTORS.registeredSongHeading);
        let htmlTargetDest = "afterend";
        if (!htmlTargetElement) {
          htmlTargetElement = document.querySelector(LR2IR_SELECTORS.search);
        }
        if ((targetmd5 || targetbmsid) && htmlTargetElement && htmlTargetDest) {
          const pageContext = {
            identifiers: { md5: targetmd5, sha256: null, bmsid: targetbmsid },
            insertion: { element: htmlTargetElement, position: htmlTargetDest },
            theme: { dctx: "#333", dcbk: "#fff", hdtx: "#eef", hdbk: "#669" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
            const tbody = document.querySelector(LR2IR_SELECTORS.registeredSongFallbackBody);
            if (tbody) {
              const md5Row = document.createElement("tr");
              md5Row.innerHTML = `<th>MD5</th><td colspan="7">${targetmd5}</td>`;
              const viewerRow = document.createElement("tr");
              viewerRow.innerHTML = `<th>VIEWER</th><td colspan="7"><a href="https://bms-score-viewer.pages.dev/view?md5=${targetmd5}">https://bms-score-viewer.pages.dev/view?md5=${targetmd5}</a></td>`;
              tbody.appendChild(md5Row);
              tbody.appendChild(viewerRow);
            } else {
              const table_element = document.createElement("table");
              table_element.innerHTML = `<tr><th>MD5</th><td>${targetmd5}</td></tr><tr><th>VIEWER</th><td><a href="https://bms-score-viewer.pages.dev/view?md5=${targetmd5}">https://bms-score-viewer.pages.dev/view?md5=${targetmd5}</a></td></tr>`;
              const searchElement = document.querySelector(LR2IR_SELECTORS.search);
              if (searchElement) {
                searchElement.after(table_element);
              } else {
                console.error("❌ LR2IRの検索フォームが見つかりませんでした");
              }
            }
          }
        } else {
          console.info("❌ LR2IRのページ書き換えはスキップされました。MD5/BMSIDかターゲット要素が取得できませんでした");
        }
      }
    }
    async function stellaverse() {
      console.info("STELLAVERSEの処理に入りました");
      watchSpaPage({
        siteName: "STELLAVERSE",
        matchUrl: (url) => url.startsWith("https://stellabms.xyz/thread/"),
        updatePage
      });
      async function updatePage({ markUpdated }) {
        if (!location.href.startsWith("https://stellabms.xyz/thread/")) {
          return;
        }
        console.info("スレッドページの書き換え処理に入りました");
        const stellaverseRefs = getStellaverseDomRefs();
        const { datetimeElem, targetElem, tableContainer, anchors } = stellaverseRefs;
        if (!datetimeElem || !targetElem || !tableContainer) {
          console.info("処理対象エレメントのいずれかが見つかりません");
          return;
        }
        const match = datetimeElem.textContent.trim().match(/@ (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
        if (!match) {
          console.info("❌ 投稿日時がパースできませんでした");
          return;
        }
        const postedDate = new Date(match[1].replace(/\//g, "-"));
        const now = /* @__PURE__ */ new Date();
        const diffMs = now - postedDate;
        const diffDays = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs % (1e3 * 60 * 60 * 24) / (1e3 * 60 * 60));
        const diffMinutes = Math.floor(diffMs % (1e3 * 60 * 60) / (1e3 * 60));
        const elapsedText = `Elapsed time: ${diffDays} days ${String(diffHours).padStart(2, "0")} hours ${String(diffMinutes).padStart(2, "0")} minutes`;
        const elapsedTimeElement = document.createElement("p");
        elapsedTimeElement.textContent = elapsedText;
        targetElem.insertAdjacentElement("afterend", elapsedTimeElement);
        markUpdated();
        const firstTableRow = stellaverseRefs.tableRows[0];
        if (!firstTableRow) {
          console.info("処理対象のテーブル行が見つかりません");
          return;
        }
        const removedHeadCount = firstTableRow.querySelectorAll(STELLAVERSE_SELECTORS.tableHead).length;
        const removedCellCount = firstTableRow.querySelectorAll(STELLAVERSE_SELECTORS.tableCell).length;
        const tableRows = stellaverseRefs.tableRows.slice(1);
        const tableHeads = stellaverseRefs.tableHeads.slice(removedHeadCount);
        const tableCells = stellaverseRefs.tableCells.slice(removedCellCount);
        firstTableRow.remove();
        tableRows.forEach((el) => {
          el.style.borderBottomWidth = "0";
        });
        tableHeads.forEach((el) => {
          el.style.height = "1.2rem";
          el.style.lineHeight = "100%";
          el.style.padding = "0.1rem 0.2rem";
          el.style.fontFamily = '"Inconsolata"';
        });
        tableCells.forEach((el) => {
          el.style.lineHeight = "100%";
          el.style.padding = "0.1rem 0.2rem";
          el.style.fontFamily = '"Inconsolata"';
        });
        const totalCellElement = tableCells[STELLAVERSE_INDEXES.totalCell];
        const notesCellElement = tableCells[STELLAVERSE_INDEXES.notesCell];
        if (!totalCellElement || !notesCellElement) {
          console.info("TOTALかNOTESのセルが見つかりません");
          return;
        }
        const total = Number(totalCellElement.textContent.trim());
        const notes = Number(notesCellElement.textContent.trim());
        let beatorajaTotal;
        let lr2Total;
        if (total === 0) {
          beatorajaTotal = Math.max(260, 7.605 * notes / (0.01 * notes + 6.5));
          lr2Total = 160 + (notes + Math.min(Math.max(notes - 400, 0), 200)) * 0.16;
          totalCellElement.textContent = `0, so #TOTAL is undefined. beatoraja is ${beatorajaTotal.toFixed(2)}(${(beatorajaTotal / notes).toFixed(3)}T/N), LR2 is ${lr2Total.toFixed(2)}(${(lr2Total / notes).toFixed(3)}T/N).`;
        }
        let bokutachi;
        let targetmd5 = null;
        for (const a of anchors) {
          if (a.textContent.trim() === "LR2IR") {
            const href = a.href;
            const match2 = href.match(/[a-f0-9]{32}$/i);
            if (match2) {
              targetmd5 = match2[0];
            }
          } else if (a.textContent.trim() === "Bokutachi") {
            bokutachi = a.href;
          }
          if (targetmd5 && bokutachi) break;
        }
        if (targetmd5) {
          const isDarkMode = document.documentElement.style.getPropertyValue("color-scheme").includes("dark");
          const pageContext = {
            identifiers: { md5: targetmd5, sha256: null, bmsid: null },
            insertion: { element: tableContainer, position: "beforeend" },
            theme: isDarkMode ? { dctx: "#fafafa", dcbk: "#09090b", hdtx: "#fafafa", hdbk: "#18191d" } : { dctx: "#09090b", dcbk: "#ffffff", hdtx: "#09090b", hdbk: "#e9eaed" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
            const bokutachiLink = container.querySelector("#bd-bokutachi");
            if (bokutachi && bokutachiLink) {
              bokutachiLink.setAttribute("href", `${bokutachi}`);
              bokutachiLink.setAttribute("style", "display: inline;");
            }
            const rowsToRemoveAfterSuccess = STELLAVERSE_INDEXES.removeRowsAfterSuccess.map((index) => tableRows[index]).filter(Boolean);
            rowsToRemoveAfterSuccess.forEach((row) => {
              row.remove();
            });
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          }
        } else {
          console.info("❌ STELLAVERSEのページ書き換えはスキップされました。MD5が取得できませんでした");
        }
      }
    }
    async function minir() {
      console.info("MinIRの処理に入りました");
      watchSpaPage({
        siteName: "MinIR",
        matchUrl: (url) => url.startsWith("https://www.gaftalk.com/minir/#/viewer/song/"),
        updatePage,
        isSettled: () => Boolean(document.getElementById("bmsdata-container"))
      });
      async function updatePage({ markUpdated }) {
        if (!location.href.startsWith("https://www.gaftalk.com/minir/#/viewer/song/")) {
          return;
        }
        console.info("MinIRの曲ページ書き換え処理に入りました");
        const url = window.location.href;
        let targetsha256 = null;
        const match = url.match(/\/song\/([a-f0-9]{64})\/\d/);
        if (match) {
          targetsha256 = match[1];
        }
        const htmlTargetElement = document.querySelector(MINIR_SELECTORS.targetElement);
        const htmlTargetDest = "beforebegin";
        if (targetsha256 && htmlTargetElement && htmlTargetDest && !document.getElementById("bmsdata-container")) {
          const pageContext = {
            identifiers: { md5: null, sha256: targetsha256, bmsid: null },
            insertion: { element: htmlTargetElement, position: htmlTargetDest },
            theme: { dctx: "#1A202C", dcbk: "#ffffff", hdtx: "#000000DE", hdbk: "#f1f1f1" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
            markUpdated();
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          }
        } else {
          console.info("❌ MinIRのページ書き換えはスキップされました。既にbmsdataが挿入済みか、ターゲット要素が見つかりませんでした");
        }
      }
    }
    async function mocha() {
      console.info("Mochaの処理に入りました");
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", async (event) => {
          console.info("🔥 DOMContentLoadedイベントが発火しました");
          await updatePage();
        });
      } else {
        console.info("🔥 DOMContentLoadedイベントは発火済です");
        await updatePage();
      }
      async function updatePage() {
        console.info("Mochaの曲ページ書き換え処理に入りました");
        const url = window.location.href;
        let targetsha256 = null;
        const match = url.match(/sha256=([a-f0-9]{64})/);
        if (match) {
          targetsha256 = match[1];
        }
        const { songInfoTable, songInfoBody, songInfoRows } = getMochaSongInfoRefs();
        let htmlTargetElement = songInfoTable;
        let htmlTargetDest = "afterend";
        if (!htmlTargetElement) {
          htmlTargetElement = document.querySelector(MOCHA_SELECTORS.form);
          htmlTargetDest = "beforebegin";
        }
        if (targetsha256 && htmlTargetElement && htmlTargetDest) {
          const pageContext = {
            identifiers: { md5: null, sha256: targetsha256, bmsid: null },
            insertion: { element: htmlTargetElement, position: htmlTargetDest },
            theme: { dctx: "#ffffff", dcbk: "#333333", hdtx: "#ffffff", hdbk: "#666666" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            if (songInfoTable) {
              const rowsToRemove = [
                songInfoRows[MOCHA_ROW_INDEXES.otherIr],
                songInfoRows[MOCHA_ROW_INDEXES.bpm],
                songInfoRows[MOCHA_ROW_INDEXES.judgerank],
                songInfoRows[MOCHA_ROW_INDEXES.total],
                songInfoRows[MOCHA_ROW_INDEXES.totalNotes],
                songInfoRows[MOCHA_ROW_INDEXES.mode]
              ].filter(Boolean);
              rowsToRemove.forEach((row) => {
                row.remove();
              });
            }
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
            const otherIrRow = songInfoRows[MOCHA_ROW_INDEXES.otherIr];
            const otherIrLinks = otherIrRow ? Array.from(otherIrRow.querySelectorAll(MOCHA_SELECTORS.anchor)) : [];
            const lr2irLink = otherIrLinks[MOCHA_LINK_INDEXES.lr2irInOtherIrRow];
            if (lr2irLink) {
              const href = lr2irLink.getAttribute("href");
              const md5Match = href ? href.match(/bmsmd5=([0-9a-fA-F]{32})/) : null;
              if (!md5Match) {
                console.error("❌ LR2IRリンクからMD5が取得できませんでした");
                return;
              }
              const md5 = md5Match[1];
              const sha256Row = document.createElement("tr");
              sha256Row.setAttribute("height", "20");
              sha256Row.className = "ranking_header";
              sha256Row.innerHTML = `<td class="songinfo_header">Sha256</td><td class="songinfo_content">${targetsha256}</td>`;
              const md5Row = document.createElement("tr");
              md5Row.setAttribute("height", "20");
              md5Row.className = "ranking_header";
              md5Row.innerHTML = `<td class="songinfo_header">Md5</td><td class="songinfo_content">${md5}</td>`;
              if (songInfoBody) {
                songInfoBody.appendChild(sha256Row);
                songInfoBody.appendChild(md5Row);
              } else {
                console.error("❌ Mochaの曲情報テーブル本文が見つかりませんでした");
                return;
              }
              const targetTd = otherIrRow.querySelector(MOCHA_SELECTORS.songInfoContentCell);
              if (targetTd) {
                const viewerLink = document.createElement("a");
                viewerLink.href = `https://bms-score-viewer.pages.dev/view?md5=${md5}`;
                viewerLink.target = "_blank";
                viewerLink.textContent = "Viewer";
                targetTd.appendChild(document.createTextNode("　"));
                targetTd.appendChild(viewerLink);
                void appendBmsSearchLinkIfAvailable(targetTd, targetsha256);
              } else {
                console.error("❌ Mochaのリンク追加先セルが見つかりませんでした");
              }
            } else {
              console.error("❌ LR2IRリンクが見つかりませんでした");
            }
          }
        } else {
          console.info("❌ Mochaのページ書き換えはスキップされました。sha256かターゲット要素が取得できませんでした");
        }
      }
    }
    function insertBmsDataTemplate(pageContext) {
      return insertBmsDataContainer({
        documentRef: document,
        insertion: pageContext.insertion,
        theme: pageContext.theme
      });
    }
    async function insertBmsData(pageContext, container) {
      const normalizedRecord = await fetchBmsInfoRecordByIdentifiers(pageContext.identifiers);
      if (!normalizedRecord) {
        container.remove();
        return false;
      }
      renderBmsData(container, normalizedRecord);
      if (container.__bmsPreviewRuntime) {
        container.__bmsPreviewRuntime.destroy();
      }
      resetActiveBmsPreviewRuntime();
      const previewPreferenceStorage = createPreviewPreferenceStorage({
        read: (key, fallbackValue) => {
          return typeof GM_getValue === "function" ? GM_getValue(key, fallbackValue) : fallbackValue;
        },
        write: (key, value) => {
          if (typeof GM_setValue === "function") {
            GM_setValue(key, value);
          }
        }
      });
      container.__bmsPreviewRuntime = createBmsInfoPreview({
        container,
        documentRef: document,
        loadParsedScore: async (record) => {
          const loaderContext = await ensureScoreLoaderContext();
          const parsedResult = await loaderContext.loader.loadParsedScore(record.sha256.toLowerCase());
          return parsedResult.score;
        },
        prefetchParsedScore: async (record) => {
          if (!record?.sha256) {
            return;
          }
          const loaderContext = await ensureScoreLoaderContext();
          await loaderContext.loader.prefetchScore(record.sha256.toLowerCase());
        },
        ...previewPreferenceStorage,
        onRuntimeError: (error) => {
          console.warn("Score viewer runtime failed:", error);
        }
      });
      activeBmsPreviewRuntime = container.__bmsPreviewRuntime;
      container.__bmsPreviewRuntime.setRecord(normalizedRecord);
      if (normalizedRecord.sha256) {
        void container.__bmsPreviewRuntime.prefetch();
      }
      return true;
    }
    async function checkBmsSearchPatternExists2(sha256) {
      return checkBmsSearchPatternExists(sha256);
    }
    async function appendBmsSearchLinkIfAvailable(targetTd, sha256) {
      try {
        if (!sha256) {
          return;
        }
        if (!await checkBmsSearchPatternExists2(sha256)) {
          return;
        }
        if (!targetTd.isConnected) {
          return;
        }
        const href = `${BMSSEARCH_PATTERN_PAGE_BASE_URL2}/${sha256}`;
        const existingLink = Array.from(targetTd.querySelectorAll("a")).find((anchor) => anchor.href === href);
        if (existingLink) {
          return;
        }
        const bmsSearchLink = document.createElement("a");
        bmsSearchLink.href = href;
        bmsSearchLink.target = "_blank";
        bmsSearchLink.textContent = "BMS SEARCH";
        targetTd.appendChild(document.createTextNode("　"));
        targetTd.appendChild(bmsSearchLink);
      } catch (error) {
        console.warn("MochaフォールバックへのBMS SEARCHリンク追加に失敗しました:", error);
      }
    }
    async function ensureScoreLoaderContext() {
      if (scoreLoaderContextPromise) {
        return scoreLoaderContextPromise;
      }
      const moduleUrl = `${SCORE_PARSER_BASE_URL}/v${SCORE_PARSER_VERSION}/score_loader.js`;
      scoreLoaderContextPromise = import(moduleUrl).then((module) => ({
        moduleUrl,
        loader: module.createScoreLoader({
          scoreBaseUrl: SCORE_BASE_URL
        })
      })).catch((error) => {
        scoreLoaderContextPromise = null;
        throw error;
      });
      return scoreLoaderContextPromise;
    }
  })();
})();
