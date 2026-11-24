import { PDFDocument, StandardFonts, PDFFont, PDFPage, PDFImage, rgb, RGB, degrees } from "pdf-lib";
import QRCode from "qrcode";
import type { CertificatePayload, CertificateSkill } from "@/lib/types";

/**
 * Server-rendered certificate PDF (A4 landscape) — the downloadable twin of
 * the in-app CertificateView sheet. Same registry language: warm cream stock,
 * engraved double frame with corner diamonds, faint rosette watermark, serif
 * certified name, scale-ticked proficiency bars, ink score dial, verification
 * QR, askew AUTHENTIC stamp, serrated seal and issuer signature line.
 * Standard PDF fonts only (Times/Courier/Helvetica) so it renders anywhere.
 */

const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const INK = hex("#1c1917");
const SUB = hex("#57534e");
const FAINT = hex("#a8a29e");
const LINE = hex("#d6d3d1");
const CREAM = hex("#faf7f0");
const SAGE = hex("#5c7250");
const SCORE_INK = hex("#18181b");

// A4 landscape
const PAGE_W = 841.89;
const PAGE_H = 595.28;

const Y = (top: number) => PAGE_H - top;

/** Left (main) column band and right (ledger) column band. */
const MAIN_X = 60;
const MAIN_W = 450;
const MAIN_CX = MAIN_X + MAIN_W / 2; // 285
const LEDGER_X = 555;
const LEDGER_W = 210;
const LEDGER_CX = LEDGER_X + LEDGER_W / 2; // 660

const scoreColor = (score: number): RGB => {
  if (score >= 80) return hex("#15803d"); // green-700 (print-friendly ink)
  if (score >= 60) return hex("#a16207"); // yellow-700
  if (score >= 40) return SAGE;
  return hex("#be123c"); // rose-700
};

function wrapName(name: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(name, size) <= maxWidth) return name;
  let out = name;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** Word-wrap a sentence into lines that fit maxWidth. */
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const attempt = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(attempt, size) <= maxWidth) {
      cur = attempt;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Fake letter-spacing — pdf-lib has none, so we space the glyphs out. */
const tracked = (text: string) => text.split("").join(" ");

/**
 * Width of a string when drawn with per-glyph tracking (see drawTrackedName).
 */
function trackedWidth(text: string, font: PDFFont, size: number, trackingEm: number): number {
  const glyphs = [...text];
  const natural = glyphs.reduce((acc, ch) => acc + font.widthOfTextAtSize(ch, size), 0);
  return natural + size * trackingEm * (glyphs.length - 1);
}

/**
 * Draw a name centered at cx with real engraved tracking — pdf-lib applies no
 * kerning, so a plain drawText at display sizes reads cramped and templated.
 * Each glyph is placed individually with a fixed em of air between them and a
 * slightly widened word gap, which is what gives diploma names their rhythm.
 */
function drawTrackedName(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  cx: number,
  topBaseline: number,
  color: RGB,
  trackingEm = 0.055
) {
  const tracking = size * trackingEm;
  // uniform tracking: the word gap is the font's own space plus the same air
  const wordGap = font.widthOfTextAtSize(" ", size) + tracking;
  const glyphs = [...text];
  const widths = glyphs.map((ch) => (ch === " " ? wordGap : font.widthOfTextAtSize(ch, size)));
  const total = widths.reduce((acc, w) => acc + w, 0) + tracking * (glyphs.length - 1);
  let x = cx - total / 2;
  glyphs.forEach((ch, i) => {
    if (ch !== " ") page.drawText(ch, { x, y: Y(topBaseline), size, font, color });
    x += widths[i] + tracking;
  });
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};

/** A small rotated square centered on (cx, cy) — the frame's corner diamond. */
function drawDiamond(page: PDFPage, cx: number, cy: number, size = 5) {
  page.drawRectangle({
    x: cx,
    y: Y(cy) - (size / 2) * Math.SQRT2,
    width: size,
    height: size,
    rotate: degrees(45),
    color: SAGE,
  });
}

/**
 * Arc for the score dial as an SVG polyline (page-lib arcs don't exist).
 * Points are emitted in SVG coords (y down) relative to the returned anchor;
 * drawSvgPath maps anchor → page position with y flipped, which is exactly
 * the transform we computed for.
 */
function scoreArc(cx: number, cy: number, r: number, frac: number): { path: string; x: number; y: number } {
  const N = 48;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = Math.PI / 2 - 2 * Math.PI * frac * (i / N);
    const sx = r + r * Math.cos(theta);
    const sy = r - r * Math.sin(theta);
    pts.push(`${i === 0 ? "M" : "L"} ${sx.toFixed(2)} ${sy.toFixed(2)}`);
  }
  return { path: pts.join(" "), x: cx - r, y: Y(cy) + r };
}

export async function renderCertificatePdf(
  cert: CertificatePayload,
  opts?: { verifyOrigin?: string }
): Promise<{ bytes: Uint8Array; filename: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`SkillProof certificate — ${cert.candidateName} (${cert.code})`);
  pdf.setSubject("Verified skill certificate");
  pdf.setProducer("SkillProof");
  pdf.setCreator("SkillProof");

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);

  // ── cream stock + engraved double frame ────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: CREAM });
  page.drawRectangle({ x: 20, y: 20, width: PAGE_W - 40, height: PAGE_H - 40, borderColor: LINE, borderWidth: 0.9 });
  page.drawRectangle({
    x: 28, y: 28, width: PAGE_W - 56, height: PAGE_H - 56,
    borderColor: hex("#a8a29e"), borderWidth: 1.3,
  });
  // corner diamonds straddling the inner rule
  drawDiamond(page, 28, 28);
  drawDiamond(page, PAGE_W - 28, 28);
  drawDiamond(page, 28, PAGE_H - 28);
  drawDiamond(page, PAGE_W - 28, PAGE_H - 28);
  // top & bottom center ornaments on the frame
  const ornament = (topY: number) => {
    page.drawLine({ start: { x: MAIN_CX - 80, y: Y(topY) }, end: { x: MAIN_CX - 12, y: Y(topY) }, thickness: 0.8, color: FAINT });
    drawDiamond(page, MAIN_CX, topY, 5);
    page.drawLine({ start: { x: MAIN_CX + 12, y: Y(topY) }, end: { x: MAIN_CX + 80, y: Y(topY) }, thickness: 0.8, color: FAINT });
  };
  ornament(28);
  ornament(PAGE_H - 28);

  // ── watermark rosette behind the certified name ────────────────────────
  const rosetteCx = 292;
  const rosetteCy = 330;
  for (const r of [18, 34, 50, 66, 82, 97]) {
    page.drawCircle({ x: rosetteCx, y: Y(rosetteCy), size: r, borderColor: INK, borderWidth: 0.35, borderOpacity: 0.06 });
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * 2 * Math.PI;
    page.drawLine({
      start: { x: rosetteCx + 18 * Math.cos(a), y: Y(rosetteCy + 18 * Math.sin(a)) },
      end: { x: rosetteCx + 97 * Math.cos(a), y: Y(rosetteCy + 97 * Math.sin(a)) },
      thickness: 0.3,
      color: INK,
      opacity: 0.05,
    });
  }

  // ── ledger column rule ─────────────────────────────────────────────────
  page.drawLine({ start: { x: 535, y: Y(64) }, end: { x: 535, y: Y(530) }, thickness: 0.8, color: LINE });

  // ── letterhead band (main column) ──────────────────────────────────────
  const brand = tracked("SKILLPROOF");
  page.drawText(brand, {
    x: MAIN_CX - sansBold.widthOfTextAtSize(brand, 11) / 2,
    y: Y(66), size: 11, font: sansBold, color: INK,
  });
  const mottoTop = "evidence over adjectives";
  page.drawText(mottoTop, {
    x: MAIN_CX - sans.widthOfTextAtSize(mottoTop, 5.5) / 2,
    y: Y(78), size: 5.5, font: sans, color: FAINT,
  });
  const registryTag = "EST. 2026 · PROCTORED SKILL REGISTRY";
  page.drawText(registryTag, {
    x: MAIN_X + MAIN_W - sans.widthOfTextAtSize(registryTag, 5.5),
    y: Y(66), size: 5.5, font: sans, color: FAINT,
  });
  page.drawLine({ start: { x: MAIN_X, y: Y(94) }, end: { x: MAIN_X + MAIN_W, y: Y(94) }, thickness: 0.8, color: LINE });

  // ── certification statement ────────────────────────────────────────────
  const kicker = tracked("CERTIFICATE OF VERIFIED PROFICIENCY");
  page.drawText(kicker, {
    x: MAIN_CX - sans.widthOfTextAtSize(kicker, 7) / 2,
    y: Y(124), size: 7, font: sans, color: SUB,
  });
  const certify = "This is to certify that";
  page.drawText(certify, {
    x: MAIN_CX - serifItalic.widthOfTextAtSize(certify, 12.5) / 2,
    y: Y(154), size: 12.5, font: serifItalic, color: SUB,
  });

  // Engraved name: pick the largest size (with tracking) that fits the column.
  // Extreme-length names wrap to two balanced tracked lines instead of being
  // chopped with an ellipsis — a truncated name has no place on a credential.
  const NAME_TRACK_EM = 0.055;
  const nameFits = (s: number, text: string) =>
    trackedWidth(text, serifBold, s, NAME_TRACK_EM) <= MAIN_W - 30;

  let nameSize = [44, 40, 36, 32, 28, 24, 21].find((s) => nameFits(s, cert.candidateName));
  let nameLines: string[];
  if (nameSize) {
    nameLines = [cert.candidateName];
  } else {
    nameSize = 21;
    const wrapped = wrapLine(cert.candidateName, serifBold, nameSize, MAIN_W - 50);
    nameLines = wrapped.slice(0, 2);
    if (wrapped.length > 2) {
      // pathological (>120-char) names: ellipsize the second line, guarded
      // against tracking pushing it past the column
      nameLines[1] = wrapName(nameLines[1], serifBold, nameSize, MAIN_W - 70);
    }
  }
  const twoLineName = nameLines.length === 2;
  const nameBaselines = twoLineName ? [184, 212] : [204];
  nameLines.forEach((line, i) => {
    drawTrackedName(page, line, serifBold, nameSize!, MAIN_CX, nameBaselines[i], INK, NAME_TRACK_EM);
  });

  // hairline flourish with a center diamond (drops a touch for two-line names)
  const flourishTop = twoLineName ? 228 : 222;
  page.drawLine({ start: { x: MAIN_CX - 80, y: Y(flourishTop) }, end: { x: MAIN_CX - 12, y: Y(flourishTop) }, thickness: 0.8, color: LINE });
  drawDiamond(page, MAIN_CX, flourishTop, 4.5);
  page.drawLine({ start: { x: MAIN_CX + 12, y: Y(flourishTop) }, end: { x: MAIN_CX + 80, y: Y(flourishTop) }, thickness: 0.8, color: LINE });

  const statement =
    "has completed a proctored, evidence-based skill verification and is hereby recorded as demonstrating the proficiencies below.";
  const statementLines = wrapLine(statement, serif, 10.5, MAIN_W - 60);
  const statementTop = twoLineName ? 256 : 248;
  statementLines.forEach((line, i) => {
    page.drawText(line, {
      x: MAIN_CX - serif.widthOfTextAtSize(line, 10.5) / 2,
      y: Y(statementTop + i * 15), size: 10.5, font: serif, color: SUB,
    });
  });

  // ── skill bars — two columns, scale-ticked ─────────────────────────────
  // Same ordering the screen shows: strongest evidence first.
  const skills: CertificateSkill[] = cert.skills
    .filter((s) => s.assessed)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const colW = 210;
  const colX = [MAIN_X + 10, MAIN_X + 10 + colW + 30];
  page.drawRectangle({ x: MAIN_X + 4, y: Y(288) - 2, width: 4, height: 4, color: SAGE });
  page.drawText("VERIFIED PROFICIENCIES", { x: MAIN_X + 14, y: Y(290), size: 7, font: sansBold, color: SUB });

  let rows = 3;
  if (skills.length === 0) {
    const none = "No assessed skill percentages were recorded on this certificate.";
    page.drawText(none, { x: colX[0], y: Y(312), size: 9, font: serifItalic, color: FAINT });
    rows = 0;
  }
  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];
    const cx0 = colX[i % 2];
    const top = 312 + Math.floor(i / 2) * 34;
    const v = Math.max(0, Math.min(100, Math.round(s.score)));

    const label = s.name.toUpperCase();
    page.drawText(label, { x: cx0, y: Y(top), size: 7, font: monoBold, color: INK });
    if (s.level) {
      page.drawText(s.level.toLowerCase(), {
        x: cx0 + monoBold.widthOfTextAtSize(label, 7) + 5,
        y: Y(top), size: 6.5, font: serifItalic, color: FAINT,
      });
    }
    const vStr = `${v}%`;
    page.drawText(vStr, {
      x: cx0 + colW - sansBold.widthOfTextAtSize(vStr, 10),
      y: Y(top - 2), size: 10, font: sansBold, color: INK,
    });

    // track + ink fill + cream scale ticks + sage reading edge
    const barY = Y(top + 11);
    page.drawRectangle({ x: cx0, y: barY, width: colW, height: 4.5, color: hex("#e5e0d4") });
    page.drawRectangle({ x: cx0, y: barY, width: Math.max(2, (colW * v) / 100), height: 4.5, color: SCORE_INK });
    for (const t of [25, 50, 75]) {
      page.drawRectangle({ x: cx0 + (colW * t) / 100, y: barY, width: 0.8, height: 4.5, color: CREAM });
    }
    page.drawRectangle({ x: cx0 + Math.max(2, (colW * v) / 100), y: barY - 2.2, width: 1, height: 8.9, color: SAGE });
    rows = Math.max(rows, Math.floor(i / 2) + 1);
  }

  // ── signature + seal (main column, bottom) ─────────────────────────────
  const sigY = 468;
  const issuer = wrapName(cert.issuedBy, serifItalic, 16, 230);
  page.drawText(issuer, { x: MAIN_X + 10, y: Y(sigY), size: 16, font: serifItalic, color: INK });
  page.drawLine({
    start: { x: MAIN_X + 10, y: Y(sigY + 14) }, end: { x: MAIN_X + 230, y: Y(sigY + 14) },
    thickness: 0.8, color: hex("#a8a29e"),
  });
  page.drawText("ISSUING RECRUITER", { x: MAIN_X + 10, y: Y(sigY + 26), size: 5.5, font: sans, color: FAINT });

  // serrated sage seal
  const sealCx = 400;
  const sealCy = 476;
  page.drawCircle({ x: sealCx, y: Y(sealCy), size: 40, borderColor: SAGE, borderWidth: 1.6, borderDashArray: [1.2, 1.9] });
  page.drawCircle({ x: sealCx, y: Y(sealCy), size: 37, borderColor: SAGE, borderWidth: 0.8 });
  page.drawCircle({ x: sealCx, y: Y(sealCy), size: 22.5, borderColor: SAGE, borderWidth: 0.8 });
  page.drawCircle({ x: sealCx, y: Y(sealCy), size: 17.5, color: SAGE });
  page.drawText("SP", {
    x: sealCx - monoBold.widthOfTextAtSize("SP", 9) / 2,
    y: Y(sealCy + 3.5), size: 9, font: monoBold, color: CREAM,
  });
  const sealTop = "SKILLPROOF";
  page.drawText(sealTop, {
    x: sealCx - sans.widthOfTextAtSize(sealTop, 4.5) / 2,
    y: Y(sealCy - 27), size: 4.5, font: sans, color: SAGE,
  });
  const sealBottom = "VERIFIED";
  page.drawText(sealBottom, {
    x: sealCx - sans.widthOfTextAtSize(sealBottom, 4.5) / 2,
    y: Y(sealCy + 31), size: 4.5, font: sans, color: SAGE,
  });

  // ── registry ledger (right column) ─────────────────────────────────────
  page.drawRectangle({ x: LEDGER_X, y: Y(76) - 2, width: 4, height: 4, color: SAGE });
  page.drawText("REGISTRY LEDGER", { x: LEDGER_X + 10, y: Y(78), size: 7, font: sansBold, color: SUB });

  // score dial: bezel + track + arc + number
  const dialCx = LEDGER_CX;
  const dialCy = 150;
  const dialR = 34;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const long = i % 5 === 0;
    page.drawLine({
      start: { x: dialCx + (dialR + 3.5) * Math.cos(a), y: Y(dialCy + (dialR + 3.5) * Math.sin(a)) },
      end: { x: dialCx + (dialR + (long ? 6 : 5)) * Math.cos(a), y: Y(dialCy + (dialR + (long ? 6 : 5)) * Math.sin(a)) },
      thickness: long ? 0.7 : 0.45,
      color: hex("#b8b0a0"),
    });
  }
  page.drawCircle({ x: dialCx, y: Y(dialCy), size: dialR, borderColor: hex("#e6e0d2"), borderWidth: 5.5 });
  const frac = Math.max(0, Math.min(1, cert.overallScore / 100));
  const arc = scoreArc(dialCx, dialCy, dialR, frac);
  page.drawSvgPath(arc.path, { x: arc.x, y: arc.y, borderColor: scoreColor(cert.overallScore), borderWidth: 5.5 });
  const ovStr = String(Math.round(cert.overallScore));
  page.drawText(ovStr, {
    x: dialCx - serifBold.widthOfTextAtSize(ovStr, 24) / 2,
    y: Y(dialCy + 8.5), size: 24, font: serifBold, color: INK,
  });
  const perStr = "/ 100";
  page.drawText(perStr, {
    x: dialCx - mono.widthOfTextAtSize(perStr, 5.5) / 2,
    y: Y(dialCy + 20), size: 5.5, font: mono, color: SUB,
  });

  const conf = cert.confidence === "HIGH" ? "CONFIDENCE · HIGH" : cert.confidence === "LOW" ? "CONFIDENCE · LOW" : "CONFIDENCE · MEDIUM";
  const confW = sansBold.widthOfTextAtSize(conf, 6) + 14;
  page.drawRectangle({
    x: LEDGER_CX - confW / 2, y: Y(210) - 6, width: confW, height: 12,
    borderColor: scoreColor(cert.overallScore), borderWidth: 0.8, borderOpacity: 0.8,
  });
  page.drawText(conf, {
    x: LEDGER_CX - sansBold.widthOfTextAtSize(conf, 6) / 2,
    y: Y(210) - 2, size: 6, font: sansBold, color: scoreColor(cert.overallScore),
  });

  page.drawLine({ start: { x: LEDGER_X, y: Y(228) }, end: { x: LEDGER_X + LEDGER_W, y: Y(228) }, thickness: 0.7, color: LINE });

  // AUTHENTIC stamp — embossed double-frame plate, spaced caps
  page.drawRectangle({
    x: LEDGER_X + 18, y: Y(278), width: LEDGER_W - 36, height: 34,
    borderColor: SAGE, borderWidth: 1.4, borderOpacity: 0.55,
  });
  page.drawRectangle({
    x: LEDGER_X + 23, y: Y(273), width: LEDGER_W - 46, height: 24,
    borderColor: SAGE, borderWidth: 0.7, borderOpacity: 0.8,
  });
  const stampMain = tracked("AUTHENTIC");
  page.drawText(stampMain, {
    x: LEDGER_CX - sansBold.widthOfTextAtSize(stampMain, 8) / 2,
    y: Y(263), size: 8, font: sansBold, color: SAGE, opacity: 0.9,
  });
  const stampSub = "SKILLPROOF REGISTRY";
  page.drawText(stampSub, {
    x: LEDGER_CX - sans.widthOfTextAtSize(stampSub, 4.5) / 2,
    y: Y(270), size: 4.5, font: sans, color: SAGE, opacity: 0.8,
  });

  page.drawLine({ start: { x: LEDGER_X, y: Y(286) }, end: { x: LEDGER_X + LEDGER_W, y: Y(286) }, thickness: 0.7, color: LINE });

  // scan-to-verify plate: QR + code
  const verifyUrl = `${opts?.verifyOrigin ?? "https://skillproof.local"}/?cert=${cert.code}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    type: "png",
    margin: 0,
    errorCorrectionLevel: "M",
    width: 512,
    color: { dark: "#1c1917ff", light: "#faf7f0ff" },
  });
  const qrImage: PDFImage = await pdf.embedPng(qrPng);
  const qrSize = 92;
  page.drawRectangle({
    x: LEDGER_CX - qrSize / 2 - 6, y: Y(394), width: qrSize + 12, height: qrSize + 12,
    borderColor: LINE, borderWidth: 0.8, color: hex("#ffffff"),
  });
  page.drawImage(qrImage, {
    x: LEDGER_CX - qrSize / 2, y: Y(394) + 6, width: qrSize, height: qrSize,
  });
  const scan = "SCAN TO VERIFY";
  page.drawText(scan, {
    x: LEDGER_CX - sans.widthOfTextAtSize(scan, 5.5) / 2,
    y: Y(408), size: 5.5, font: sans, color: SUB,
  });
  page.drawText(cert.code, {
    x: LEDGER_CX - monoBold.widthOfTextAtSize(cert.code, 12) / 2,
    y: Y(424), size: 12, font: monoBold, color: INK,
  });
  const orOpen = `or open /?cert=${cert.code}`;
  page.drawText(orOpen, {
    x: LEDGER_CX - mono.widthOfTextAtSize(orOpen, 4.5) / 2,
    y: Y(436), size: 4.5, font: mono, color: FAINT,
  });

  page.drawLine({ start: { x: LEDGER_X, y: Y(448) }, end: { x: LEDGER_X + LEDGER_W, y: Y(448) }, thickness: 0.7, color: LINE });

  // register rows — dotted spacing tightens when the cohort row joins so the
  // block never collides with the bottom motto
  const cohort = cert.cohort;
  const cohortLabel = cohort ? "top " + (Number.isInteger(cohort.topPct) ? String(cohort.topPct) : cohort.topPct.toFixed(1)) + "%" : "";
  const cohortValue = cohort ? cohortLabel + " · rank " + cohort.rank + " of " + cohort.size : "";
  const ledgerRows: Array<{ label: string; value: string; size: number; font: PDFFont; color: RGB }> = [
    { label: "ISSUED ON", value: fmtDate(cert.issuedAt), size: 9, font: serifBold, color: INK },
    { label: "COMPLETED", value: fmtDate(cert.completedAt ?? cert.issuedAt), size: 9, font: serifBold, color: INK },
  ];
  if (cohort) {
    ledgerRows.push({ label: "COHORT AT ISSUE", value: cohortValue, size: 8.5, font: serifBold, color: SUB });
  }
  // the internal run id appears on the sheet only when present (owner/recruiter
  // context); public verification sheets carry the code alone
  if (cert.assessmentId) {
    ledgerRows.push({ label: "ASSESSMENT", value: cert.assessmentId.slice(0, 8).toUpperCase(), size: 7.5, font: mono, color: SUB });
  }
  const rowStep = cohort ? 25 : 28;
  const rowStart = cohort ? 454 : 462;
  ledgerRows.forEach((row, i) => {
    const labelTop = rowStart + i * rowStep;
    page.drawText(row.label, { x: LEDGER_X, y: Y(labelTop), size: 5, font: sans, color: FAINT });
    page.drawText(row.value, { x: LEDGER_X, y: Y(labelTop + 12), size: row.size, font: row.font, color: row.color });
  });

  // bottom motto
  const footMotto = "Evidence over adjectives — this credential can be verified by anyone with the code.";
  page.drawText(footMotto, {
    x: (PAGE_W - serifItalic.widthOfTextAtSize(footMotto, 8.5)) / 2,
    y: Y(550), size: 8.5, font: serifItalic, color: FAINT,
  });

  const bytes = await pdf.save();
  const filename = `skillproof-certificate-${cert.code}.pdf`;
  return { bytes, filename };
}
