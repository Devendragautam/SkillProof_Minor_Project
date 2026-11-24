import { PDFDocument, StandardFonts, PDFFont, PDFPage, rgb, RGB } from "pdf-lib";
import type { Assessment, Candidate, Report } from "@prisma/client";

// ─── Palette (matches the app's design system, print-friendly) ──────────────

const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const INK = hex("#18181b");
const SUB = hex("#52525b");
const FAINT = hex("#a1a1aa");
const LINE = hex("#e4e4e7");
const TRACK = hex("#e4e4e7");
const BAND = hex("#022c22"); // emerald-950
const BAND_ACCENT = hex("#34d399"); // emerald-400
const CARD_BG = hex("#fafafa");

/** Same thresholds as the client's scoreColor() */
const scoreColor = (score: number): RGB => {
  if (score >= 80) return hex("#34d399");
  if (score >= 60) return hex("#fbbf24");
  if (score >= 40) return hex("#fb923c");
  return hex("#fb7185");
};

const confidenceColor = (level: string): RGB => {
  if (level === "HIGH") return hex("#34d399");
  if (level === "MEDIUM") return hex("#fbbf24");
  return hex("#fb7185");
};

// ─── Layout constants (A4) ──────────────────────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BAND_H = 96;
const BOTTOM_LIMIT = PAGE_H - 64; // footer zone starts here

/** Convert "distance from top of page" to PDF y (measured from bottom). */
const Y = (top: number) => PAGE_H - top;

const CATEGORY_LABELS: Record<string, string> = {
  problemSolving: "Problem solving",
  debugging: "Debugging",
  efficiency: "Efficiency",
  codeQuality: "Code quality",
  explanation: "Explanation",
  timeManagement: "Time management",
  consistency: "Consistency",
};

interface PdfSkill {
  skill: string;
  claimedLevel?: string | null;
  score: number;
  confidence?: string;
  assessed?: boolean;
  evidence?: string[];
}

interface PdfCategory {
  [k: string]: number;
}

interface PdfBreakdownRow {
  questionTitle: string;
  skill: string;
  category: string;
  difficulty: string;
  status: string;
  score: number | null;
  timeSpentSec: number | null;
}

type AssessmentWithRelations = Assessment & { candidate: Candidate; report: Report | null };

// ─── Text helpers ───────────────────────────────────────────────────────────

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      // hard-break very long single words (urls, ids)
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        cur = chunk;
      } else cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Render an assessment's verified report as a branded, print-friendly A4 PDF.
 * Shared by the single-report route (GET /api/report/[id]/pdf) and the
 * recruiter bundle export (POST /api/report/pdf-zip).
 */
export async function renderReportPdf(
  assessment: AssessmentWithRelations
): Promise<{ bytes: Uint8Array; filename: string }> {
  if (!assessment.report) throw new Error("Report not found");

  const r = assessment.report;
  const rawSkills = JSON.parse(r.skillScoresJson) as Array<Record<string, unknown>>;
  const skills: PdfSkill[] = (Array.isArray(rawSkills) ? rawSkills : []).map((s) => ({
    skill: String(s.skill ?? ""),
    claimedLevel: (s.claimedLevel as string) ?? null,
    score: Number(s.score ?? 0),
    confidence: s.confidence as string,
    assessed: Boolean(s.assessed),
    evidence: Array.isArray(s.evidence) ? (s.evidence as string[]) : [],
  }));
  const categories = JSON.parse(r.categoryScoresJson) as PdfCategory;
  const rawSignals = JSON.parse(r.aiRiskSignalsJson);
  const aiSignals: string[] = Array.isArray(rawSignals) ? (rawSignals as string[]) : [];
  const rawBreakdown = JSON.parse(r.breakdownJson);
  const breakdown: PdfBreakdownRow[] = (Array.isArray(rawBreakdown) ? rawBreakdown : []).map((b) => ({
    questionTitle: String(b.questionTitle ?? ""),
    skill: String(b.skill ?? ""),
    category: String(b.category ?? ""),
    difficulty: String(b.difficulty ?? ""),
    status: String(b.status ?? ""),
    score: b.score == null ? null : Number(b.score),
    timeSpentSec: b.timeSpentSec == null ? null : Number(b.timeSpentSec),
  }));

  // ── Document setup ──
  const pdf = await PDFDocument.create();
  pdf.setTitle(`SkillProof verified report — ${assessment.candidate.name}`);
  pdf.setSubject("Evidence-based skill verification");
  pdf.setProducer("SkillProof");
  pdf.setCreator("SkillProof");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let top = 0; // cursor measured from top of page (PDF y flipped via Y())

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    // continuation header
    page.drawText(`${assessment.candidate.name} — verified skill report (cont.)`, {
      x: MARGIN,
      y: Y(40),
      size: 8,
      font: bold,
      color: FAINT,
    });
    top = 58;
  };

  const ensure = (needed: number) => {
    if (top + needed > BOTTOM_LIMIT) newPage();
  };

  const text = (
    s: string,
    x: number,
    topPos: number,
    opts: { size?: number; f?: PDFFont; color?: RGB; opacity?: number } = {}
  ) => {
    page.drawText(s, {
      x,
      y: Y(topPos + (opts.size ?? 9)), // baseline shifted so topPos is the visual top
      size: opts.size ?? 9,
      font: opts.f ?? font,
      color: opts.color ?? INK,
      opacity: opts.opacity,
    });
  };

  const hr = (topPos: number, color: RGB = LINE) => {
    page.drawLine({
      start: { x: MARGIN, y: Y(topPos) },
      end: { x: MARGIN + CONTENT_W, y: Y(topPos) },
      thickness: 0.75,
      color,
    });
  };

  // ── Header band ──
  page.drawRectangle({ x: 0, y: Y(BAND_H), width: PAGE_W, height: BAND_H, color: BAND });
  page.drawRectangle({ x: 0, y: Y(BAND_H + 3), width: PAGE_W, height: 3, color: BAND_ACCENT });

  // brand mark + wordmark
  page.drawRectangle({
    x: MARGIN,
    y: Y(58),
    width: 26,
    height: 26,
    color: BAND_ACCENT,
    opacity: 0.16,
    borderColor: BAND_ACCENT,
    borderWidth: 1,
  });
  text("SP", MARGIN + 7, 36, { size: 12, f: bold, color: BAND_ACCENT });
  text("SkillProof", MARGIN + 34, 36, { size: 19, f: bold, color: hex("#ffffff") });
  text("Evidence-based skill verification", MARGIN + 34, 58, { size: 8, color: hex("#6ee7b7") });

  const stamp = "V E R I F I E D   R E P O R T";
  const stampW = bold.widthOfTextAtSize(stamp, 8);
  text(stamp, PAGE_W - MARGIN - stampW, 34, { size: 8, f: bold, color: BAND_ACCENT });
  const dateStr = new Date(assessment.createdAt).toISOString().slice(0, 10);
  const dateW = font.widthOfTextAtSize(dateStr, 8);
  text(dateStr, PAGE_W - MARGIN - dateW, 48, { size: 8, color: hex("#a7f3d0") });

  // ── Candidate block ──
  top = BAND_H + 24;
  text(assessment.candidate.name, MARGIN, top, { size: 23, f: bold, color: INK });
  top += 34;
  const assessedCount = skills.filter((s) => s.assessed).length;
  const meta = `${assessedCount} skill${assessedCount === 1 ? "" : "s"} verified · ${breakdown.length} question${breakdown.length === 1 ? "" : "s"} · assessment ${assessment.id.slice(0, 8)}`;
  text(meta, MARGIN, top, { size: 9, color: SUB });
  top += 22;

  // ── Score ring (SVG arc, y-down space anchored at page top) ──
  const overall = r.overallScore;
  const ringCx = MARGIN + 42;
  const ringCy = top + 40;
  const ringR = 34;
  const sweep = (Math.max(0, Math.min(100, overall)) / 100) * 360;
  const endRad = ((-90 + sweep) * Math.PI) / 180;
  const sx = ringCx + ringR * Math.cos((-90 * Math.PI) / 180);
  const sy = ringCy + ringR * Math.sin((-90 * Math.PI) / 180);
  const ex = ringCx + ringR * Math.cos(endRad);
  const ey = ringCy + ringR * Math.sin(endRad);
  const largeArc = sweep > 180 ? 1 : 0;
  const ringColor = scoreColor(overall);

  // track (full circle) in PDF space
  page.drawCircle({
    x: ringCx,
    y: Y(ringCy),
    size: ringR,
    borderColor: TRACK,
    borderWidth: 7,
    color: hex("#ffffff"),
  });
  // score arc — pdf-lib maps svg (px,py) → PDF (x+px, y−py), so anchoring at
  // y=PAGE_H makes svg y coordinates measured downward from the page top
  if (sweep >= 359.9) {
    // SVG arcs degenerate when start == end — draw a full ring instead
    page.drawCircle({ x: ringCx, y: Y(ringCy), size: ringR, borderColor: ringColor, borderWidth: 7 });
  } else if (sweep > 0.5) {
    page.drawSvgPath(
      `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${ringR} ${ringR} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`,
      { x: 0, y: PAGE_H, borderColor: ringColor, borderWidth: 7, borderLineCap: 1 }
    );
  }
  // inner number + caption
  const scoreStr = String(Math.round(overall));
  const scoreW = bold.widthOfTextAtSize(scoreStr, 26);
  text(scoreStr, ringCx - scoreW / 2, ringCy - 14, { size: 26, f: bold, color: ringColor });
  const overallW = font.widthOfTextAtSize("OVERALL", 6.5);
  text("OVERALL", ringCx - overallW / 2, ringCy + 14, { size: 6.5, color: FAINT });

  // ── Right-of-ring stats ──
  const statX = MARGIN + 108;
  const statTop = top + 2;
  text("CONFIDENCE", statX, statTop, { size: 6.5, color: FAINT });
  const confLabel = r.confidence === "HIGH" ? "HIGH" : r.confidence === "MEDIUM" ? "MEDIUM" : "LOW";
  const confW = bold.widthOfTextAtSize(confLabel, 10) + 14;
  page.drawRectangle({
    x: statX,
    y: Y(statTop + 25),
    width: confW,
    height: 16,
    color: confidenceColor(confLabel),
    opacity: 0.14,
    borderColor: confidenceColor(confLabel),
    borderWidth: 1,
  });
  text(confLabel, statX + 7, statTop + 12, { size: 10, f: bold, color: confidenceColor(confLabel) });

  text("AI-ASSIST RISK", statX + 150, statTop, { size: 6.5, color: FAINT });
  text(`${Math.round(r.aiRiskScore)}%`, statX + 150, statTop + 11, {
    size: 14,
    f: bold,
    color: r.aiRiskScore < 30 ? hex("#34d399") : r.aiRiskScore < 60 ? hex("#fbbf24") : hex("#fb7185"),
  });
  text(r.aiRiskScore < 30 ? "Low" : r.aiRiskScore < 60 ? "Medium" : "High", statX + 192, statTop + 13, {
    size: 9,
    color: SUB,
  });

  text("COMPLETED", statX + 150, statTop + 34, { size: 6.5, color: FAINT });
  const completedStr = assessment.completedAt ? new Date(assessment.completedAt).toISOString().slice(0, 10) : "—";
  text(completedStr, statX + 150, statTop + 45, { size: 11, f: bold, color: INK });

  top = ringCy + ringR + 22;

  // ── Category breakdown ──
  ensure(190);
  text("Category breakdown", MARGIN, top, { size: 11.5, f: bold, color: INK });
  hr(top + 17);
  top += 26;

  const catEntries = Object.entries(categories).filter(([k]) => CATEGORY_LABELS[k]);
  const barLabelW = 104;
  const barW = CONTENT_W - barLabelW - 34;
  for (const [key, val] of catEntries) {
    const v = Math.max(0, Math.min(100, Math.round(val)));
    text(CATEGORY_LABELS[key], MARGIN, top, { size: 8.5, color: SUB });
    page.drawRectangle({ x: MARGIN + barLabelW, y: Y(top + 8), width: barW, height: 6, color: TRACK });
    page.drawRectangle({
      x: MARGIN + barLabelW,
      y: Y(top + 8),
      width: Math.max(2, (barW * v) / 100),
      height: 6,
      color: scoreColor(v),
    });
    const vStr = String(v);
    text(vStr, MARGIN + barLabelW + barW + 8, top, { size: 8.5, f: bold, color: scoreColor(v) });
    top += 17;
  }

  // ── Top verified skills ──
  const topSkills = skills
    .filter((s) => s.assessed)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (topSkills.length > 0) {
    ensure(topSkills.length * 40 + 60);
    top += 14;
    text("Top verified skills", MARGIN, top, { size: 11.5, f: bold, color: INK });
    hr(top + 17);
    top += 26;
    for (const s of topSkills) {
      const chipW = 30;
      page.drawRectangle({
        x: MARGIN,
        y: Y(top + 15),
        width: chipW,
        height: 15,
        color: scoreColor(s.score),
        opacity: 0.13,
        borderColor: scoreColor(s.score),
        borderWidth: 0.8,
      });
      const scStr = String(Math.round(s.score));
      text(scStr, MARGIN + (chipW - bold.widthOfTextAtSize(scStr, 9)) / 2, top + 4.5, {
        size: 9,
        f: bold,
        color: scoreColor(s.score),
      });
      const claimed = s.claimedLevel ? `  ·  claimed ${s.claimedLevel}` : "";
      text(`${s.skill}${claimed}`, MARGIN + chipW + 8, top + 3, { size: 9.5, f: bold, color: INK });
      top += 18;
      const ev = (s.evidence ?? []).find((e) => e.trim().length > 0);
      if (ev) {
        const lines = wrapText(ev, font, 8, CONTENT_W - chipW - 8);
        text(lines[0], MARGIN + chipW + 8, top, { size: 8, color: SUB });
        top += 10;
        if (lines.length > 1) {
          text(lines[1], MARGIN + chipW + 8, top, { size: 8, color: SUB });
          top += 10;
        }
      }
      top += 8;
    }
  }

  // ── AI-assistance review ──
  ensure(110);
  top += 10;
  text("AI-assistance review", MARGIN, top, { size: 11.5, f: bold, color: INK });
  hr(top + 17);
  top += 24;
  const riskVerdict =
    aiSignals.length === 0
      ? "No suspicious behavior signals detected — editing cadence, run patterns and focus behavior look organic."
      : `${aiSignals.length} behavioral signal${aiSignals.length === 1 ? "" : "s"} raised during the run:`;
  for (const line of wrapText(riskVerdict, font, 8.5, CONTENT_W)) {
    text(line, MARGIN, top, { size: 8.5, color: SUB });
    top += 12;
  }
  top += 4;
  for (const sig of aiSignals.slice(0, 4)) {
    page.drawCircle({ x: MARGIN + 2.5, y: Y(top + 4.5), size: 1.6, color: BAND_ACCENT });
    for (const line of wrapText(sig, font, 8.5, CONTENT_W - 14)) {
      text(line, MARGIN + 12, top, { size: 8.5, color: INK });
      top += 12;
    }
    top += 2;
  }

  // ── Question results table ──
  const MAX_ROWS = 8;
  const rows = breakdown.slice(0, MAX_ROWS);
  const rowH = 15;
  ensure(30 + rowH * (rows.length + 1) + 20);
  top += 12;
  text("Question results", MARGIN, top, { size: 11.5, f: bold, color: INK });
  hr(top + 17);
  top += 24;

  page.drawRectangle({ x: MARGIN, y: Y(top + rowH), width: CONTENT_W, height: rowH, color: CARD_BG });
  const colQ = MARGIN + 6;
  const colSkill = MARGIN + 240;
  const colDiff = MARGIN + 350;
  const colScore = MARGIN + 400;
  const colTime = MARGIN + 452;
  text("QUESTION", colQ, top + 4.5, { size: 6.5, f: bold, color: FAINT });
  text("SKILL", colSkill, top + 4.5, { size: 6.5, f: bold, color: FAINT });
  text("DIFF", colDiff, top + 4.5, { size: 6.5, f: bold, color: FAINT });
  text("SCORE", colScore, top + 4.5, { size: 6.5, f: bold, color: FAINT });
  text("TIME", colTime, top + 4.5, { size: 6.5, f: bold, color: FAINT });
  top += rowH;

  const truncate = (s: string, maxPx: number, f: PDFFont, size: number) => {
    if (f.widthOfTextAtSize(s, size) <= maxPx) return s;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, size) > maxPx) out = out.slice(0, -1);
    return `${out}…`;
  };

  rows.forEach((b, i) => {
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: Y(top + rowH), width: CONTENT_W, height: rowH, color: hex("#f4f4f5") });
    }
    const passed = b.status === "correct" || b.status === "passed";
    const scoreOut = b.score == null ? "—" : `${Math.round(b.score)}`;
    text(truncate(b.questionTitle, colSkill - colQ - 12, font, 8), colQ, top + 4, { size: 8, color: INK });
    text(truncate(b.skill, colDiff - colSkill - 10, font, 8), colSkill, top + 4, { size: 8, color: SUB });
    text(b.difficulty, colDiff, top + 4, { size: 8, color: SUB });
    text(scoreOut, colScore, top + 4, { size: 8, f: bold, color: b.score == null ? FAINT : scoreColor(b.score) });
    text(b.timeSpentSec != null ? `${Math.round(b.timeSpentSec)}s` : "—", colTime, top + 4, {
      size: 8,
      color: passed ? hex("#34d399") : SUB,
    });
    top += rowH;
  });
  if (breakdown.length > MAX_ROWS) {
    top += 4;
    text(
      `+ ${breakdown.length - MAX_ROWS} more question${breakdown.length - MAX_ROWS === 1 ? "" : "s"} — see the full report online`,
      MARGIN,
      top,
      { size: 7.5, color: FAINT }
    );
    top += 10;
  }

  // ── Footer on every page ──
  const sharePath = `/?report=${assessment.id}`;
  for (const [idx, p] of pages.entries()) {
    p.drawLine({
      start: { x: MARGIN, y: Y(PAGE_H - 46) },
      end: { x: PAGE_W - MARGIN, y: Y(PAGE_H - 46) },
      thickness: 0.75,
      color: LINE,
    });
    p.drawText("Generated by SkillProof — skills proven, not claimed.", {
      x: MARGIN,
      y: Y(PAGE_H - 34),
      size: 7,
      font,
      color: FAINT,
    });
    const linkStr = `Verify online: ${sharePath}`;
    p.drawText(linkStr, {
      x: PAGE_W - MARGIN - mono.widthOfTextAtSize(linkStr, 7),
      y: Y(PAGE_H - 34),
      size: 7,
      font: mono,
      color: hex("#10b981"),
    });
    if (pages.length > 1) {
      const pn = `${idx + 1} / ${pages.length}`;
      p.drawText(pn, {
        x: PAGE_W - MARGIN - bold.widthOfTextAtSize(pn, 7),
        y: Y(PAGE_H - 24),
        size: 7,
        font: bold,
        color: FAINT,
      });
    }
  }

  const bytes = await pdf.save();
  const slug =
    assessment.candidate.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "candidate";
  const filename = `skillproof-${slug}-${dateStr}.pdf`;

  return { bytes, filename };
}
