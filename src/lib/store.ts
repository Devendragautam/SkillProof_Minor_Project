"use client";

import { create } from "zustand";
import type { AssessmentReport, CertificatePayload, ClaimedLevel, ClientQuestion, ExtractedProfile } from "@/lib/types";

export type View = "landing" | "candidate" | "recruiter" | "auth" | "certificate";
export type CandidateStep = "resume" | "skills" | "assessment" | "results";

/** Signed-in account (mirrors the server SessionUser shape). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "recruiter" | "candidate";
}
export type AuthMode = "login" | "register";

export interface SkillSelection {
  level: ClaimedLevel;
  selected: boolean;
}

interface SkillProofState {
  view: View;
  candidateStep: CandidateStep;

  candidateName: string;
  candidateEmail: string;
  resumeText: string;
  resumeFileName: string;
  profile: ExtractedProfile | null;
  selection: Record<string, SkillSelection>;

  candidateId: string | null;
  assessmentId: string | null;
  assessmentTotal: number;
  question: ClientQuestion | null;
  report: AssessmentReport | null;
  resultsAssessmentId: string | null;
  /** viewing a shared report via ?report=<id> link (read-only context) */
  sharedReport: boolean;
  /** the share token from a shared report link (?report=<id>&t=<token>) — authorizes PDF download for share viewers */
  sharedReportToken: string | null;
  /** candidate arrived via a recruiter invite link (?invite=<candidateId>) — display name for the banner */
  inviteName: string | null;

  /** issued certificate being viewed (?cert=<code> or opened from report/results) */
  certificate: CertificatePayload | null;
  /** the view the certificate was opened from (Back returns there) */
  certificateFrom: View | null;

  /** signed-in account + whether the initial /api/auth/me check has resolved */
  user: AuthUser | null;
  authChecked: boolean;
  /** which screen the auth view should show */
  authMode: AuthMode;
  /** the runner is mid-exam — the shell hides chrome (stepper/footer) for a focused test screen */
  examActive: boolean;

  setView: (v: View) => void;
  setUser: (u: AuthUser | null) => void;
  setAuthChecked: (v: boolean) => void;
  setAuthMode: (m: AuthMode) => void;
  setExamActive: (v: boolean) => void;
  setCandidateStep: (s: CandidateStep) => void;
  setCandidateInfo: (name: string, email: string) => void;
  setResume: (text: string, fileName: string) => void;
  setProfile: (p: ExtractedProfile | null) => void;
  toggleSkill: (skill: string) => void;
  setSkillLevel: (skill: string, level: ClaimedLevel) => void;
  setAssessment: (id: string, candidateId: string, total: number) => void;
  /** update just the plan total (resume paths) without touching the session ids */
  setAssessmentTotal: (total: number) => void;
  setQuestion: (q: ClientQuestion | null) => void;
  setReport: (r: AssessmentReport | null, assessmentId: string) => void;
  setSharedReport: (v: boolean) => void;
  setInvite: (candidateId: string, name: string, email: string) => void;
  setCertificate: (c: CertificatePayload | null) => void;
  resetFlow: () => void;
}

export const useStore = create<SkillProofState>((set) => ({
  view: "landing",
  candidateStep: "resume",

  candidateName: "",
  candidateEmail: "",
  resumeText: "",
  resumeFileName: "",
  profile: null,
  selection: {},

  candidateId: null,
  assessmentId: null,
  assessmentTotal: 0,
  question: null,
  report: null,
  resultsAssessmentId: null,
  sharedReport: false,
  sharedReportToken: null,
  inviteName: null,
  certificate: null,
  certificateFrom: null,

  user: null,
  authChecked: false,
  authMode: "login",
  examActive: false,

  setView: (view) => set({ view }),
  setUser: (user) => set({ user }),
  setAuthChecked: (authChecked) => set({ authChecked }),
  setAuthMode: (authMode) => set({ authMode }),
  setExamActive: (examActive) => set({ examActive }),
  setCandidateStep: (candidateStep) => set({ candidateStep }),
  setCandidateInfo: (candidateName, candidateEmail) => set({ candidateName, candidateEmail }),
  setResume: (resumeText, resumeFileName) => set({ resumeText, resumeFileName }),
  setProfile: (profile) =>
    set({
      profile,
      selection: profile
        ? Object.fromEntries(
            profile.skills.map((s) => [
              s.name,
              {
                level: (["Advanced", "Intermediate", "Basic"].includes(s.level) ? s.level : "Intermediate") as ClaimedLevel,
                selected: true,
              },
            ])
          )
        : {},
    }),
  toggleSkill: (skill) =>
    set((st) => {
      const cur = st.selection[skill];
      if (!cur) return st;
      return { selection: { ...st.selection, [skill]: { ...cur, selected: !cur.selected } } };
    }),
  setSkillLevel: (skill, level) =>
    set((st) => ({ selection: { ...st.selection, [skill]: { ...st.selection[skill], level } } })),
  setAssessment: (assessmentId, candidateId, assessmentTotal) =>
    set({ assessmentId, candidateId, assessmentTotal }),
  setAssessmentTotal: (assessmentTotal) => set({ assessmentTotal }),
  setQuestion: (question) => set({ question }),
  setReport: (report, resultsAssessmentId) => set({ report, resultsAssessmentId }),
  setSharedReport: (sharedReport) => set({ sharedReport }),
  setCertificate: (certificate) =>
    set((st) => ({
      certificate,
      certificateFrom: certificate ? (st.view === "certificate" ? st.certificateFrom : st.view) : null,
      // opening a certificate navigates to the certificate view (Back returns to certificateFrom)
      view: certificate ? "certificate" : st.view,
    })),
  // bind the flow to a recruiter-invited candidate profile (invite link)
  setInvite: (candidateId, name, email) =>
    set({
      view: "candidate",
      candidateStep: "resume",
      candidateId,
      candidateName: name,
      candidateEmail: email,
      inviteName: name,
      sharedReport: false,
      sharedReportToken: null,
    }),
  resetFlow: () => {
    try {
      localStorage.removeItem("skillproof:session");
    } catch {}
    // drop stale ?report= / ?invite= / ?cert= params so refreshes don't re-open those contexts
    if (typeof window !== "undefined" && /[?&](report|invite|cert)=/.test(window.location.search)) {
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {}
    }
    set({
      candidateStep: "resume",
      candidateName: "",
      candidateEmail: "",
      resumeText: "",
      resumeFileName: "",
      profile: null,
      selection: {},
      candidateId: null,
      assessmentId: null,
      assessmentTotal: 0,
      question: null,
      report: null,
      resultsAssessmentId: null,
      sharedReport: false,
      sharedReportToken: null,
      inviteName: null,
      certificate: null,
      certificateFrom: null,
    });
  },
}));

// ─── Session persistence (survives page refresh mid-flow) ──────────────────

const STORAGE_KEY = "skillproof:session";

interface PersistedSession {
  view: View;
  candidateStep: CandidateStep;
  candidateName: string;
  candidateEmail: string;
  resumeText: string;
  resumeFileName: string;
  profile: ExtractedProfile | null;
  selection: Record<string, SkillSelection>;
  candidateId: string | null;
  assessmentId: string | null;
  assessmentTotal: number;
  resultsAssessmentId: string | null;
  inviteName: string | null;
}

export function persistSession(state: SkillProofState): void {
  try {
    const data: PersistedSession = {
      view: state.view,
      candidateStep: state.candidateStep,
      candidateName: state.candidateName,
      candidateEmail: state.candidateEmail,
      resumeText: state.resumeText.slice(0, 60000),
      resumeFileName: state.resumeFileName,
      profile: state.profile,
      selection: state.selection,
      candidateId: state.candidateId,
      assessmentId: state.assessmentId,
      assessmentTotal: state.assessmentTotal,
      resultsAssessmentId: state.resultsAssessmentId,
      inviteName: state.inviteName,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — session simply won't persist
  }
}

/** Drop the persisted session (kept in sync with resetFlow's manual removal). */
export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Whether this page load is a refresh/back navigation (→ safe to restore a
 * finished "results" state) as opposed to a fresh navigation (typed URL, new
 * tab, reopened browser → show the landing page instead of a stale report).
 * Fail-open to `true` when the Navigation Timing API is unavailable.
 */
export function isReloadishNavigation(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav ? nav.type === "reload" || nav.type === "back_forward" : true;
  } catch {
    return true;
  }
}

export function hydrateSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedSession;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export function applyHydrated(data: PersistedSession): void {
  useStore.setState({
    view: data.view ?? "candidate",
    candidateStep: data.candidateStep ?? "resume",
    candidateName: data.candidateName ?? "",
    candidateEmail: data.candidateEmail ?? "",
    resumeText: data.resumeText ?? "",
    resumeFileName: data.resumeFileName ?? "",
    profile: data.profile ?? null,
    selection: data.selection ?? {},
    candidateId: data.candidateId ?? null,
    assessmentId: data.assessmentId ?? null,
    assessmentTotal: data.assessmentTotal ?? 0,
    resultsAssessmentId: data.resultsAssessmentId ?? null,
    inviteName: data.inviteName ?? null,
  });
}
