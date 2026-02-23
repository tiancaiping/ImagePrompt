import { NextResponse } from "next/server";
import { env } from "~/env.mjs";

export const runtime = "nodejs";

interface UploadJson {
  data?: { id?: string; file_id?: string; file_url?: string };
  file_id?: string;
  id?: string;
  file_url?: string;
}

interface WorkflowRunJson {
  code?: number;
  msg?: string;
  data?: unknown; // ✅ 真实返回里 data 是 string
  debug_url?: string;
  execute_id?: string;
  detail?: unknown;
  usage?: unknown;

  // 兼容字段
  output?: unknown;
  message?: unknown;
  error?: unknown;
  errors?: unknown;
}

function extractErrorMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractErrorMessage(item);
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
      const nested = extractErrorMessage(record.errors);
      if (nested) return nested;
    }

    for (const k of Object.keys(record)) {
      const nested = extractErrorMessage(record[k]);
      if (nested) return nested;
    }
  }

  return null;
}

// ✅ 只从 workflowJson.data（JSON字符串）里提取 output
function extractOutputFromCozeData(data: unknown): string | null {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.output === "string" && obj.output.trim()) return obj.output.trim();
      }
    } catch {
      return null;
    }
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.output === "string" && obj.output.trim()) return obj.output.trim();
  }

  return null;
}

function toShortOutput(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  const maxLength = 200;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength).trimEnd()}...`;
}

export async function POST(req: Request) {
  if (!env.COZE_API_TOKEN || !env.COZE_WORKFLOW_ID) {
    return NextResponse.json(
      { error: "Missing Coze configuration" },
      { status: 500 },
    );
  }

  const baseUrl = env.COZE_API_BASE ?? "https://api.coze.cn";

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const userQuery =
    typeof formData.get("userQuery") === "string" ? String(formData.get("userQuery")) : "";

  const promptType =
    typeof formData.get("promptType") === "string"
      ? String(formData.get("promptType")).trim()
      : "";

  const allowedPromptTypes = ["midjourney", "stableDiffusion", "flux", "normal"];
  if (!allowedPromptTypes.includes(promptType)) {
    return NextResponse.json(
      { error: `promptType 无效，请选择: ${allowedPromptTypes.join(" / ")}` },
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
      return NextResponse.json({ error: "extraParameters JSON 无效" }, { status: 400 });
    }
  }

  // 1) upload
  const uploadForm = new FormData();
  uploadForm.append("file", file, file.name);

  const uploadResponse = await fetch(`${baseUrl}/v1/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.COZE_API_TOKEN}` },
    body: uploadForm,
  });

  const uploadJson = (await uploadResponse.json()) as UploadJson;
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

  // 2) workflow run parameters (start node: img, promptType, userQuery)
  const parameters: Record<string, unknown> = { ...extraParameters };
  parameters.promptType = promptType;
  parameters.userQuery = userQuery;

  // ✅ img 用 JSON 字符串（Coze最稳）
  if (fileId) {
    parameters.img = JSON.stringify({ file_id: String(fileId) });
  } else {
    parameters.img = JSON.stringify({ file_url: String(fileUrl) });
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

  const workflowJson = (await workflowResponse.json()) as WorkflowRunJson;

  if (!workflowResponse.ok) {
    return NextResponse.json(
      {
        error: extractErrorMessage(workflowJson) ?? "Workflow run failed",
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

  // ✅ 只提取 data 里的 output
  const output =
    extractOutputFromCozeData(workflowJson.data) ??
    (typeof workflowJson.output === "string" ? workflowJson.output : null);

  return NextResponse.json({
    output: toShortOutput(output),
    fileId,
    fileUrl,
    raw: workflowJson,
  });
}
