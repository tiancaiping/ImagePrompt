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
}

// 只从“可信结构”提取 output，避免把 run_id/trace_id 误当输出
function pickWorkflowOutput(raw: unknown): string | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        const nested = pickWorkflowOutput(parsed);
        if (nested) return nested;
      } catch {
        return s;
      }
    }
    return s;
  }

  // 常见对象结构：{ output: "xxx" } / { text: "xxx" } / { content: "xxx" }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    const directKeys = ["output", "text", "content", "value", "prompt", "result"];
    for (const k of directKeys) {
      if (typeof obj[k] === "string" && (obj[k] as string).trim()) {
        return (obj[k] as string).trim();
      }
    }

    // 常见：outputs: [{ name: "...", value: "..." }]
    if (Array.isArray(obj.outputs)) {
      for (const item of obj.outputs) {
        if (item && typeof item === "object") {
          const it = item as Record<string, unknown>;
          if (typeof it.value === "string" && it.value.trim()) return it.value.trim();
          if (typeof it.output === "string" && it.output.trim()) return it.output.trim();
          if (typeof it.text === "string" && it.text.trim()) return it.text.trim();
        }
      }
    }

    // 有些会嵌一层 data/result/output
    const nested = obj.data ?? obj.result ?? obj.output;
    if (nested && nested !== raw) {
      const v = pickWorkflowOutput(nested);
      if (v) return v;
    }
  }

  return null;
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

export async function POST(req: Request) {
  // 0) 必要环境变量
  if (!env.COZE_API_TOKEN || !env.COZE_WORKFLOW_ID) {
    return NextResponse.json(
      { error: "Missing Coze configuration" },
      { status: 500 },
    );
  }

  const baseUrl = env.COZE_API_BASE ?? "https://api.coze.cn";

  // 1) 读取表单
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

  // 你的工作流开始节点必填 promptType，所以这里也必须校验
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

  // extraParameters（可选 JSON 对象）
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

  // 2) 上传文件 -> file_id / file_url
  const uploadForm = new FormData();
  uploadForm.append("file", file, file.name);

  const uploadResponse = await fetch(`${baseUrl}/v1/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COZE_API_TOKEN}`,
    },
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

  // 3) 组装 workflow parameters（严格对齐开始节点：img、promptType、userQuery）
  // ✅ 关键：img 用 JSON 字符串传（最稳），避免 Coze 判定“缺少图片参数”
  const parameters: Record<string, unknown> = {
    ...extraParameters, // 允许加别的，但不能覆盖必填
  };

  // 强制必填/标准字段
  parameters.promptType = promptType;
  parameters.userQuery = userQuery;

  if (fileId) {
    parameters.img = JSON.stringify({ file_id: String(fileId) });
  } else {
    parameters.img = JSON.stringify({ file_url: String(fileUrl) });
  }

  // 4) 调用 workflow run
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

  // 5) 只从“可信字段”取输出，避免拿到 trace_id/run_id
  const rawOutput =
    workflowJson?.data?.output ??
    workflowJson?.output ??
    workflowJson?.data?.result ??
    workflowJson?.data?.outputs ??
    null;

  const output = pickWorkflowOutput(rawOutput);

  return NextResponse.json({
    output,     // 这里应该是 prompt 文本
    fileId,
    fileUrl,
    raw: workflowJson,
  });
}
