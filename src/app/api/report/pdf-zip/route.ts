import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { renderReportPdf } from "@/lib/server/report-pdf";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { z } from "zod";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/report/pdf-zip — recruiter bundle export.
 * Body: { ids: string[] } — candidate ids. Resolves each candidate's latest
 * completed verified report and returns a single zip of branded PDFs.
 * Deduplicates filenames (multiple runs same-day) with an index suffix.
 * Recruiter-gated: bundles full verified reports.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    // zip-of-PDFs is the heaviest render path on the platform — hard limit
    if (!rateLimit(`pdf-zip:${auth.user.id}`, 5, 60_000)) {
      return rateLimitResponse();
    }

    const body = await req.json().catch(() => ({}));
    const parsed = z.object({ ids: z.array(z.string().min(6).max(40)).min(1).max(30) }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "No candidates selected" }, { status: 400 });
    }
    const ids = parsed.data.ids;

    // Latest completed assessment per candidate — fetched at the root so each
    // row carries the full candidate + report relations the PDF renderer needs.
    const assessments = await db.assessment.findMany({
      where: { candidateId: { in: ids }, status: "completed" },
      include: { report: true, candidate: true },
      orderBy: { createdAt: "desc" },
    });
    const latestByCandidate = new Map<string, (typeof assessments)[number]>();
    for (const a of assessments) {
      if (a.report && !latestByCandidate.has(a.candidateId)) latestByCandidate.set(a.candidateId, a);
    }

    const namesById = new Map(
      (
        await db.candidate.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      ).map((c) => [c.id, c.name])
    );

    const zip = new JSZip();
    const used = new Map<string, number>();
    let rendered = 0;
    const skipped: string[] = [];

    for (const id of ids) {
      const assessment = latestByCandidate.get(id);
      if (!assessment) {
        skipped.push(namesById.get(id) ?? "unknown candidate");
        continue;
      }
      const { bytes, filename } = await renderReportPdf(assessment);
      const seen = used.get(filename) ?? 0;
      used.set(filename, seen + 1);
      const finalName = seen === 0 ? filename : filename.replace(/\.pdf$/, `-${seen + 1}.pdf`);
      zip.file(finalName, bytes);
      rendered += 1;
    }

    if (rendered === 0) {
      return NextResponse.json(
        { error: "None of the selected candidates have a completed verified report yet" },
        { status: 404 }
      );
    }

    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const dateStr = new Date().toISOString().slice(0, 10);
    const zipName = `skillproof-reports-${rendered}-${dateStr}.zip`;

    return new NextResponse(Buffer.from(out) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Cache-Control": "no-store",
        "X-Skillproof-Rendered": String(rendered),
        ...(skipped.length > 0 ? { "X-Skillproof-Skipped": skipped.join(",").slice(0, 900) } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Bundle export failed" }, { status: 500 });
  }
}
