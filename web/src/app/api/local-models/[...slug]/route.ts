import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { WHISPER_MODEL_ID, WHISPER_REQUIRED_FILES, WHISPER_SUPPORTED_MODEL_ID } from "@/features/speech/lib/whisper-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".onnx": "application/octet-stream",
};

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_WHISPER_MODEL_SOURCE !== "local") {
    return new Response("Not found", { status: 404 });
  }
  if (WHISPER_MODEL_ID !== WHISPER_SUPPORTED_MODEL_ID) return Response.json({ error: "Only the pinned Whisper base.en manifest is supported." }, { status: 400 });
  const modelDirectory = process.env.WHISPER_MODEL_DIR?.trim();
  if (!modelDirectory) return Response.json({ error: "WHISPER_MODEL_DIR is not configured in web/.env.local." }, { status: 503 });

  const { slug } = await params;
  const modelParts = WHISPER_MODEL_ID.split("/");
  if (slug.length <= modelParts.length || !modelParts.every((part, index) => slug[index] === part)) {
    return new Response("Not found", { status: 404 });
  }
  const relativePath = slug.slice(modelParts.length).join("/");
  if (!WHISPER_REQUIRED_FILES.includes(relativePath as typeof WHISPER_REQUIRED_FILES[number])) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const root = await realpath(modelDirectory);
    const candidate = await realpath(path.join(root, relativePath));
    if (!candidate.startsWith(`${root}${path.sep}`)) return new Response("Not found", { status: 404 });
    const fileInfo = await stat(candidate);
    if (!fileInfo.isFile()) return new Response("Not found", { status: 404 });

    const stream = Readable.toWeb(createReadStream(candidate)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Length": String(fileInfo.size),
        "Content-Type": contentTypes[path.extname(candidate)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return Response.json({ error: `Model file is missing: ${relativePath}` }, { status: 404 });
    }
    return Response.json({ error: "Could not read the configured local model directory." }, { status: 500 });
  }
}
