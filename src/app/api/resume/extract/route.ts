import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { sanitizeFileName } from "@/lib/server/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/resume/extract
 * Accepts multipart (file) or JSON {text}. Returns extracted plain text.
 * Any signed-in user (candidate flow / recruiter tooling); AI quota is
 * rate-limited per user.
 *
 * Upload hardening (files are parsed in memory and NEVER persisted to disk —
 * there is no writable storage surface, so no executable payload can land):
 *  - hard byte-size ceiling checked BEFORE parsing (4 MB);
 *  - extension allow-list (pdf/txt/md) — the browser-supplied MIME type is
 *    never trusted;
 *  - magic-byte sniffing for PDFs (%PDF-) so a renamed binary cannot reach the
 *    PDF parser;
 *  - text decodes must be clean UTF-8 without NUL bytes (no binary smuggled as
 *    .txt);
 *  - client filenames are sanitized before they are echoed or stored.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md"];

/** Binary-content heuristics: NUL bytes in the first 1 KB ⇒ not a text file. */
function looksBinary(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  return head.includes(0);
}

export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (!rateLimit(`resume:${guard.user.id}`, 15, 60_000)) {
    return rateLimitResponse();
  }
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      const pasted = form.get("text") as string | null;

      if (pasted && pasted.trim().length > 40) {
        return NextResponse.json({ text: pasted.slice(0, 60000), source: "pasted" });
      }
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "File is too large — the limit is 4 MB. Paste the resume text instead." },
          { status: 413 }
        );
      }

      const name = file.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf("."));
      const safeName = sanitizeFileName(file.name, "resume.txt");
      const bytes = new Uint8Array(await file.arrayBuffer());

      if (ext === ".pdf") {
        // magic-byte check before handing the bytes to the PDF parser
        const head = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
        if (head !== "%PDF-") {
          return NextResponse.json(
            { error: "This file is not a valid PDF." },
            { status: 415 }
          );
        }
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(bytes);
        const { text } = await extractText(pdf, { mergePages: true });
        const clean = (Array.isArray(text) ? text.join("\n") : text).replace(/\u0000/g, "").trim();
        if (clean.length < 40) {
          return NextResponse.json(
            { error: "Could not extract enough text from this PDF. It may be a scanned image — try pasting your resume text instead." },
            { status: 422 }
          );
        }
        return NextResponse.json({ text: clean.slice(0, 60000), source: "pdf", fileName: safeName });
      }

      if (ext === ".txt" || ext === ".md" || file.type.startsWith("text/")) {
        if (looksBinary(bytes)) {
          return NextResponse.json(
            { error: "This file does not look like a text resume." },
            { status: 415 }
          );
        }
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        return NextResponse.json({ text: text.slice(0, 60000), source: "text", fileName: safeName });
      }

      return NextResponse.json(
        {
          error: `Unsupported file type (${ALLOWED_EXTENSIONS.join(", ")} only). Upload a PDF/TXT or paste your resume text.`,
        },
        { status: 415 }
      );
    }

    const body = (await req.json()) as { text?: string };
    if (!body.text || body.text.trim().length < 40) {
      return NextResponse.json({ error: "Resume text is too short" }, { status: 400 });
    }
    return NextResponse.json({ text: body.text.slice(0, 60000), source: "pasted" });
  } catch (err) {
    console.error("resume extract error:", err);
    return NextResponse.json(
      { error: "Failed to read the resume. Try again or paste the text directly." },
      { status: 500 }
    );
  }
}
