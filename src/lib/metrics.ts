import type { BehaviorEvent, BehaviorMetrics } from "./types";

export function computeMetrics(
  events: BehaviorEvent[],
  versions: { code: string }[],
  finalCode: string
): BehaviorMetrics {
  const totalMs = events.length ? Math.max(...events.map((e) => e.t)) : 0;
  const firstKey = events.find((e) => e.type === "first_keystroke" || e.type === "code_change" || e.type === "paste");

  let typedChars = 0;
  let removedChars = 0;
  let pastedChars = 0;
  let pasteEvents = 0;
  let maxSingleInsert = 0;
  let runs = 0;
  let errorRuns = 0;
  let codeChanges = 0;
  let tabBlurs = 0;

  // active-edit time: merge edit intervals (edit + 4s window)
  const editTimes: number[] = [];
  for (const e of events) {
    switch (e.type) {
      case "code_change":
        codeChanges++;
        typedChars += e.added ?? 0;
        removedChars += e.removed ?? 0;
        maxSingleInsert = Math.max(maxSingleInsert, e.added ?? 0);
        editTimes.push(e.t);
        break;
      case "paste":
        pasteEvents++;
        pastedChars += e.pastedChars ?? 0;
        maxSingleInsert = Math.max(maxSingleInsert, e.pastedChars ?? 0);
        editTimes.push(e.t);
        break;
      case "first_keystroke":
        editTimes.push(e.t);
        break;
      case "run":
        runs++;
        if (e.error) errorRuns++;
        break;
      case "tab_blur":
        tabBlurs++;
        break;
    }
  }

  let activeMs = 0;
  const WINDOW = 4000;
  if (editTimes.length) {
    editTimes.sort((a, b) => a - b);
    let segStart = editTimes[0];
    let segEnd = editTimes[0];
    for (let i = 1; i < editTimes.length; i++) {
      if (editTimes[i] - segEnd <= WINDOW) {
        segEnd = editTimes[i];
      } else {
        activeMs += segEnd - segStart;
        segStart = editTimes[i];
        segEnd = editTimes[i];
      }
    }
    activeMs += segEnd - segStart;
  }

  const activeSec = Math.max(activeMs / 1000, 1);
  const totalTyped = typedChars + pastedChars;
  const initialLen = Math.max(finalCode.length - totalTyped, 0);

  return {
    totalMs,
    timeToFirstCodeMs: firstKey ? firstKey.t : null,
    typedChars,
    removedChars,
    pastedChars,
    pasteEvents,
    maxSingleInsert,
    runs,
    errorRuns,
    codeChanges,
    tabBlurs,
    versionCount: versions.length,
    activeEditRatio: totalMs ? Math.min(activeMs / totalMs, 1) : 0,
    charsPerActiveSec: activeSec > 0 ? totalTyped / activeSec : 0,
    ...({ initialLen } as object),
  } as BehaviorMetrics & { initialLen?: number };
}

/** Format a human-readable summary line for the activity feed */
export function summarizeEvent(e: BehaviorEvent): string {
  const time = new Date(e.t).toISOString().slice(14, 22);
  switch (e.type) {
    case "question_open": return `${time} — Question opened`;
    case "first_keystroke": return `${time} — Started coding`;
    case "code_change": return `${time} — Code modified (+${e.added ?? 0}/-${e.removed ?? 0})`;
    case "paste": return `${time} — Pasted ${e.pastedChars ?? 0} characters`;
    case "run": return `${time} — Ran tests${e.total != null ? ` (${e.passCount ?? 0}/${e.total} passed)` : ""}`;
    case "submit_attempt": return `${time} — Solution submitted`;
    case "tab_blur": return `${time} — Window focus lost`;
    case "tab_focus": return `${time} — Window focus regained`;
    case "snapshot": return `${time} — Code snapshot taken`;
    case "hint": return `${time} — Hint revealed (disclosed)`;
    case "question_skipped": return `${time} — Question skipped (parked for revisit)`;
  }
}
