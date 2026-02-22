import { NextResponse } from "next/server";

import { env } from "~/env.mjs";

export async function POST(req: Request) {
  if (!env.COZE_API_TOKEN || !env.COZE_WORKFLOW_ID) {
    return NextResponse.json(
      { error: "Missing Coze configuration" },
      { status: 500 },
    );
  }
  const allowedPromptTypes = [
    "midjourney",
    "stableDiffusion",
    "flux",
    "normal",
  ];
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const userQuery =
    typeof formData.get("userQuery") === "string"
      ? String(formData.get("userQuery"))
      : "";
  const promptType =
    typeof formData.get("promptType") === "string"
      ? String(formData.get("promptType"))
      : "";
  if (!allowedPromptTypes.includes(promptType)) {
    return NextResponse.json(
      {
        error: `promptType 无效，请选择: ${allowedPromptTypes.join(" / ")}`,
      },
      { status: 400 },
    );
  }

  const baseUrl = env.COZE_API_BASE ?? "https://api.coze.cn";

  const uploadForm = new FormData();
  uploadForm.append("file", file, file.name);
  const uploadResponse = await fetch(`${baseUrl}/v1/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COZE_API_TOKEN}`,
    },
    body: uploadForm,
  });
  const uploadJson = (await uploadResponse.json()) as {
    data?: {
      id?: string;
      file_id?: string;
      file_url?: string;
    };
    file_id?: string;
    id?: string;
    file_url?: string;
  };
  if (!uploadResponse.ok) {
    return NextResponse.json(
      { error: "File upload failed", details: uploadJson },
      { status: uploadResponse.status },
    );
  }

  const fileId =
    uploadJson?.data?.id ??
    uploadJson?.data?.file_id ??
    uploadJson?.file_id ??
    uploadJson?.id ??
    null;
  const fileUrl = uploadJson?.data?.file_url ?? uploadJson?.file_url ?? null;
  const parameters: Record<string, string> = {
    userQuery,
    promptType,
  };
  if (fileId) {
    parameters.file_id = String(fileId);
  }
  if (fileUrl) {
    parameters.file_url = String(fileUrl);
  }

  const workflowResponse = await fetch(`${baseUrl}/v1/workflow/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COZE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: env.COZE_WORKFLOW_ID,
      parameters,
    }),
  });
  const workflowJson = (await workflowResponse.json()) as {
    data?: {
      output?: unknown;
      result?: unknown;
      outputs?: unknown;
    };
    output?: unknown;
    message?: unknown;
    msg?: unknown;
    error?: unknown;
    errors?: unknown;
  };
  if (!workflowResponse.ok) {
    const extractError = (value: unknown): string | null => {
      if (!value) return null;
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        for (const item of value) {
          const extracted = extractError(item);
          if (extracted) return extracted;
        }
        return null;
      }
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const direct =
          record.message ?? record.msg ?? record.error ?? record.description;
        if (typeof direct === "string") return direct;
        if (record.errors) {
          const nested = extractError(record.errors);
          if (nested) return nested;
        }
        for (const key of Object.keys(record)) {
          const nested = extractError(record[key]);
          if (nested) return nested;
        }
      }
      return null;
    };
    const errorMessage =
      extractError(workflowJson) ?? "Workflow run failed";
    return NextResponse.json(
      { error: errorMessage, details: workflowJson },
      { status: workflowResponse.status },
    );
  }

  const rawOutput =
    workflowJson?.data?.output ??
    workflowJson?.output ??
    workflowJson?.data?.result ??
    workflowJson?.data?.outputs ??
    null;
  const parseJsonIfString = (value: unknown): unknown => {
    if (typeof value !== "string") {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed;
    } catch {
      return null;
    }
  };
  const extractFromObject = (value: Record<string, unknown>): string | null => {
    if (typeof value.output === "string") return value.output;
    if (typeof value.text === "string") return value.text;
    if (typeof value.value === "string") return value.value;
    const nested = value.output ?? value.data ?? value.result ?? value.outputs;
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object") {
      return extractFromObject(nested as Record<string, unknown>);
    }
    return null;
  };
  const extractFromArray = (value: unknown[]): string | null => {
    for (const item of value) {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const extracted = extractFromObject(item as Record<string, unknown>);
        if (typeof extracted === "string") return extracted;
      }
    }
    return null;
  };
  const findFirstString = (value: unknown, depth = 0): string | null => {
    if (depth > 6) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFirstString(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const priorityKeys = ["output", "text", "content", "value", "prompt", "result"];
      for (const key of priorityKeys) {
        if (typeof record[key] === "string") return record[key] as string;
      }
      for (const key of Object.keys(record)) {
        const found = findFirstString(record[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const collectStrings = (
    value: unknown,
    depth = 0,
    acc: Set<string> = new Set(),
  ): Set<string> => {
    if (depth > 6) return acc;
    if (typeof value === "string") {
      acc.add(value);
      return acc;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectStrings(item, depth + 1, acc);
      }
      return acc;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        collectStrings(record[key], depth + 1, acc);
      }
    }
    return acc;
  };
  const isLikelyId = (value: string) => {
    if (value.length < 12) return false;
    if (/^[0-9a-f]{16,}$/i.test(value)) return true;
    if (/^[0-9a-f-]{20,}$/i.test(value) && !value.includes(" ")) return true;
    return false;
  };
  const scoreString = (value: string) => {
    let score = 0;
    if (value.includes(" ")) score += 3;
    if (value.length >= 30) score += 2;
    if (/[a-zA-Z]/.test(value)) score += 1;
    if (/[\u4e00-\u9fa5]/.test(value)) score += 2;
    if (/[,.!?，。！？]/.test(value)) score += 1;
    if (isLikelyId(value)) score -= 10;
    return score;
  };
  const parsedOutput = parseJsonIfString(rawOutput);
  const fallbackParsed = parseJsonIfString(workflowJson);
  const stringOutput = typeof rawOutput === "string" ? rawOutput : null;
  const parsedObjectOutput =
    parsedOutput && typeof parsedOutput === "object"
      ? extractFromObject(parsedOutput as Record<string, unknown>)
      : null;
  const arrayOutput = Array.isArray(rawOutput) ? extractFromArray(rawOutput) : null;
  const objectOutput =
    rawOutput && typeof rawOutput === "object"
      ? extractFromObject(rawOutput as Record<string, unknown>)
      : null;
  const fallbackOutput =
    fallbackParsed && typeof fallbackParsed === "object"
      ? extractFromObject(fallbackParsed as Record<string, unknown>)
      : null;
  const candidates = [
    stringOutput,
    parsedObjectOutput,
    arrayOutput,
    objectOutput,
    fallbackOutput,
    findFirstString(rawOutput),
    findFirstString(workflowJson),
    ...Array.from(collectStrings(rawOutput)),
    ...Array.from(collectStrings(workflowJson)),
  ].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  const best = candidates.reduce((acc, current) => {
    if (!acc) return current;
    return scoreString(current) > scoreString(acc) ? current : acc;
  }, "");
  const output = best || null;
  return NextResponse.json({
    output,
    fileId,
    fileUrl,
    raw: workflowJson,
  });
}
