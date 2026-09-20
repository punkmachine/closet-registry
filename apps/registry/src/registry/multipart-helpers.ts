import type { FastifyRequest } from "fastify";
import type { z } from "zod";

export async function collectMultipartParts(
  request: FastifyRequest,
): Promise<{ metadataRaw: unknown; fileBuffers: Map<string, Buffer> }> {
  const fileBuffers = new Map<string, Buffer>();
  let metadataRaw: unknown;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuffers.set(part.fieldname, await part.toBuffer());
    } else if (part.fieldname === "metadata") {
      metadataRaw = part.value;
    }
  }

  return { metadataRaw, fileBuffers };
}

export function parseMetadataJson(metadataRaw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof metadataRaw !== "string") {
    return { ok: false, error: "Missing required 'metadata' field" };
  }

  try {
    return { ok: true, value: JSON.parse(metadataRaw) };
  } catch {
    return { ok: false, error: "'metadata' field must contain valid JSON" };
  }
}

export function formatZodError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
  return `Validation error: ${issues}`;
}
