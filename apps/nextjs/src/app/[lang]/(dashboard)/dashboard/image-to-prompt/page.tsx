"use client";

import * as React from "react";

import { Button } from "@saasfly/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saasfly/ui/card";
import * as Icons from "@saasfly/ui/icons";
import { Input } from "@saasfly/ui/input";
import { Label } from "@saasfly/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@saasfly/ui/select";

import { DashboardHeader } from "~/components/header";
import { DashboardShell } from "~/components/shell";

export default function ImageToPromptPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [userQuery, setUserQuery] = React.useState("");
  const [promptType, setPromptType] = React.useState("midjourney");
  const [extraParameters, setExtraParameters] = React.useState("");
  const [result, setResult] = React.useState("");
  const [error, setError] = React.useState("");
  const [errorDetails, setErrorDetails] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [fileId, setFileId] = React.useState("");
  const [fileUrl, setFileUrl] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const IconsTyped = Icons as unknown as Record<string, React.ComponentType<{
    className?: string;
  }>>;
  const SpinnerIcon = IconsTyped.Spinner;

  React.useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || isLoading) {
      return;
    }
    setIsLoading(true);
    setError("");
    setErrorDetails("");
    setResult("");
    setFileId("");
    setFileUrl("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("userQuery", userQuery);
      body.append("promptType", promptType);
      if (extraParameters.trim()) {
        body.append("extraParameters", extraParameters.trim());
      }

      const response = await fetch("/api/image-to-prompt", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        error?: string;
        details?: unknown;
        output?: unknown;
        fileId?: string;
        fileUrl?: string;
        raw?: unknown;
      };
      if (!response.ok) {
        setError(data?.error ?? "请求失败");
        const details = data?.details ?? data;
        const nextDetails =
          typeof details === "string"
            ? details
            : JSON.stringify(details, null, 2);
        setErrorDetails(nextDetails);
        return;
      }
      const output = data?.output;
      const raw = data?.raw ?? data;
      setFileId(typeof data?.fileId === "string" ? data.fileId : "");
      setFileUrl(typeof data?.fileUrl === "string" ? data.fileUrl : "");
      const nextResult =
        typeof output === "string"
          ? output
          : output
            ? JSON.stringify(output, null, 2)
            : JSON.stringify(raw, null, 2);
      setResult(nextResult === "null" ? "无可用输出" : nextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Image to Prompt"
        text="上传图片并生成提示词，自动调用工作流获取结果"
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>图片生成提示词</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="image-file">图片</Label>
                <Input
                  id="image-file"
                  type="file"
                  accept="image/*"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
              {previewUrl ? (
                <div className="rounded-md border p-3">
                  <img
                    src={previewUrl}
                    alt="preview"
                    className="max-h-64 w-auto"
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="user-query">userQuery</Label>
                <Input
                  id="user-query"
                  placeholder="请输入你的需求或描述"
                  value={userQuery}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setUserQuery(event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prompt-type">promptType</Label>
                <Select value={promptType} onValueChange={setPromptType}>
                  <SelectTrigger id="prompt-type">
                    <SelectValue placeholder="请选择提示词类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Prompt Type</SelectLabel>
                      <SelectItem value="midjourney">midjourney</SelectItem>
                      <SelectItem value="stableDiffusion">stableDiffusion</SelectItem>
                      <SelectItem value="flux">flux</SelectItem>
                      <SelectItem value="normal">normal</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="extra-params">extraParameters</Label>
                <textarea
                  id="extra-params"
                  placeholder='{"image":"file_id","style":"cinematic"}'
                  value={extraParameters}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setExtraParameters(event.target.value)
                  }
                  className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <Button type="submit" disabled={!file || isLoading}>
                {isLoading && (
                  <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
                )}
                生成提示词
              </Button>
            </form>
          </CardContent>
        </Card>
        {fileId || fileUrl ? (
          <div className="rounded-md border p-4 text-sm">
            <div className="grid gap-2">
              {fileId ? (
                <div>
                  <span className="font-medium">file_id:</span> {fileId}
                </div>
              ) : null}
              {fileUrl ? (
                <div>
                  <span className="font-medium">file_url:</span> {fileUrl}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
            <div>{error}</div>
            {errorDetails ? (
              <div className="mt-2 whitespace-pre-wrap text-xs text-destructive/80">
                {errorDetails}
              </div>
            ) : null}
          </div>
        ) : null}
        {result ? (
          <div className="rounded-md border p-4 text-sm whitespace-pre-wrap">
            {result}
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
