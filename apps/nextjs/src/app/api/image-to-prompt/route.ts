import { NextResponse } from "next/server";
import { env } from "~/env.mjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!env.COZE_API_TOKEN || !env.COZE_WORKFLOW_ID) {
    return NextResponse.json(
      { error: "Missing Coze configuration" },
      { status: 500 },
    );
  }

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
      ? String(formData.get("promptType")).trim()
      : "";

  const allowedPromptTypes = ["midjourney", "stableDiffusion", "flux", "normal"];
  if (!allowedPromptTypes.includes(promptType)) {
    return NextResponse.json(
      {
        error: `promptType 无效，请选择: ${allowedPromptTypes.join(" / ")}`,
      },
      { status: 400 },
    );
  }

  const botId =
    typeof formData.get("botId") === "string"
      ? String(formData.get("botId")).trim()
      : env.COZE_BOT_ID ?? "";

  const appId =
    typeof formData.get("appId") === "string"
      ? String(formData.get("appId")).trim()
      : env.COZE_APP_ID ?? "";

  const extraParametersRaw =
    typeof formData.get("extraParameters") === "string"
      ? String(formData.get("extraParameters")).trim()
      : "";

  let extraParameters: Record<string, unknown> = {};
  if (extraParametersRaw) {
    try {
      const parsed = JSON.parse(extraParametersRaw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "extraParameters 必须是 JSON 对象" },
          { status: 400 },
        );
      }
      extraParameters = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "extraParameters JSON 无效" },
        { status: 400 },
      );
    }
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
    data?: { id?: string; file_id?: string; file_url?: string };
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

  if (!fileId && !fileUrl) {
    return NextResponse.json(
      { error: "Upload succeeded but no file_id/file_url returned", details: uploadJson },
      { status: 500 },
    );
  }

  const parameters: Record<string, unknown> = {
    promptType,
    userQuery,
    ...extraParameters,
  };

  parameters.promptType = promptType;
  parameters.userQuery = userQuery;

  if (fileId) {
    parameters.img = { file_id: String(fileId) };
  } else {
    parameters.img = { file_url: String(fileUrl) };
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
      bot_id: botId || undefined,
      app_id: appId || undefined,
    }),
  });

  const workflowJson = (await workflowResponse.json()) as {
    data?: { output?: unknown; result?: unknown; outputs?: unknown };
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

    return NextResponse.json(
      {
        error: extractError(workflowJson) ?? "Workflow run failed",
        details: {
          response: workflowJson,
          requestPayload: {
            workflow_id: env.COZE_WORKFLOW_ID,
            parameters,
            bot_id: botId || undefined,
            app_id: appId || undefined,
          },
          fileId,
          fileUrl,
        },
      },
      { status: workflowResponse.status },
    );
  }

  const rawOutput =
    workflowJson?.data?.output ??
    workflowJson?.output ??
    workflowJson?.data?.result ??
    workflowJson?.data?.outputs ??
    null;

  const extractText = (value: unknown, depth = 0): string | null => {
    if (depth > 6) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = extractText(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const keys = ["output", "text", "content", "value", "prompt", "result"];
      for (const key of keys) {
        if (typeof record[key] === "string") return record[key] as string;
      }
      for (const key of Object.keys(record)) {
        const found = extractText(record[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const output =
    extractText(rawOutput) ??
    extractText(workflowJson) ??
    (rawOutput ? JSON.stringify(rawOutput) : JSON.stringify(workflowJson));

  return NextResponse.json({
    output,
    fileId,
    fileUrl,
    raw: workflowJson,
  });
}
