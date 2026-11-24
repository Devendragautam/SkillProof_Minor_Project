import { NextRequest, NextResponse } from "next/server";
import { requireRecruiter } from "@/lib/server/auth";
import { extractMcqsFromText } from "@/lib/ai";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { sanitizeFileName } from "@/lib/server/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * POST /api/questions/import-pdf
 * Recruiter uploads a question-paper PDF (multipart/form-data, `file` field).
 * Extracts text with unpdf, runs LLM MCQ extraction (heuristic fallback) and
 * returns a DRAFT list — nothing is saved until /api/questions/import-mcq.
 * Upload hardening: size ceiling before parse, magic-byte sniffing (%PDF-,
 * the browser MIME type is never trusted), sanitized filename echo.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  if (!rateLimit(`qimport:${auth.user.id}`, 10, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: "Send the PDF as multipart/form-data with a `file` field." },
        { status: 400 }
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided — attach a PDF question paper." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Unsupported file type — upload a text-based PDF question paper." },
        { status: 415 }
      );
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: "PDF is larger than 8 MB — split or compress the question paper and try again." },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // magic-byte sniffing: a renamed non-PDF never reaches the parser
    const magic = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
    if (magic !== "%PDF-") {
      return NextResponse.json(
        { error: "This file is not a valid PDF." },
        { status: 415 }
      );
    }
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n\n") : text)
      .replace(/\u0000/g, "")
      .trim();

    if (clean.length < 200) {
      return NextResponse.json(
        { error: "Could not extract text — the PDF may be a scan. Use text-based question papers." },
        { status: 422 }
      );
    }

    const result = await extractMcqsFromText(clean);

    if (result.questions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No multiple-choice questions could be identified in this PDF. Make sure it contains numbered questions with lettered options (A–D) and an answer key.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      questions: result.questions,
      source: result.source,
      pages: totalPages,
      textChars: clean.length,
      fileName: sanitizeFileName(file.name, "question-paper.pdf"),
    });
  } catch (err) {
    console.error("import-pdf error:", err);
    return NextResponse.json(
      { error: "Failed to read the PDF — it may be corrupted. Try re-exporting the question paper." },
      { status: 500 }
    );
  }
}
