"use client";

import type { BehaviorEvent, CodeVersion } from "@/lib/types";

/**
 * Client-side behavior tracker — records disclosed, relevant coding-session
 * events (edits, pastes, runs, focus changes) plus code snapshots so the
 * backend can analyze the problem-solving process.
 */
export class BehaviorTracker {
  events: BehaviorEvent[] = [];
  versions: CodeVersion[] = [];
  private startedAt = Date.now();
  private firstEditLogged = false;
  private lastSnapshotCode = "";
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.events = [];
    this.versions = [];
    this.startedAt = Date.now();
    this.firstEditLogged = false;
    this.lastSnapshotCode = "";
    this.push({ type: "question_open", t: this.t() });
  }

  t(): number {
    return Date.now() - this.startedAt;
  }

  private push(e: BehaviorEvent): void {
    if (this.events.length < 1200) this.events.push(e);
  }

  codeChange(added: number, removed: number): void {
    if (!this.firstEditLogged && added + removed > 0) {
      this.firstEditLogged = true;
      this.push({ type: "first_keystroke", t: this.t() });
    }
    this.push({ type: "code_change", t: this.t(), added, removed, codeLen: undefined });
  }

  paste(chars: number): void {
    if (!this.firstEditLogged && chars > 0) {
      this.firstEditLogged = true;
      this.push({ type: "first_keystroke", t: this.t() });
    }
    this.push({ type: "paste", t: this.t(), pastedChars: chars });
  }

  run(passCount: number, total: number, error: boolean): void {
    this.push({ type: "run", t: this.t(), passCount, total, error });
  }

  submitAttempt(): void {
    this.push({ type: "submit_attempt", t: this.t() });
  }

  hintUsed(): void {
    this.push({ type: "hint", t: this.t() });
  }

  tabBlur(): void {
    this.push({ type: "tab_blur", t: this.t() });
  }

  tabFocus(): void {
    this.push({ type: "tab_focus", t: this.t() });
  }

  snapshot(code: string, label: string): void {
    if (code === this.lastSnapshotCode) return;
    this.lastSnapshotCode = code;
    if (this.versions.length < 24) {
      this.versions.push({ t: this.t(), code, label });
    }
  }

  startPeriodicSnapshots(getCode: () => string, intervalMs = 30000): void {
    this.stopPeriodicSnapshots();
    this.snapshotTimer = setInterval(() => {
      const code = getCode();
      if (code && code !== this.lastSnapshotCode) {
        this.snapshot(code, "autosave");
      }
    }, intervalMs);
  }

  stopPeriodicSnapshots(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  reset(): void {
    this.stopPeriodicSnapshots();
    this.start();
  }

  elapsedSec(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
