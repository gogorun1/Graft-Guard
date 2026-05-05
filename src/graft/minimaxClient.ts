import type { DomSummary, ToolSchema } from "./schemaTypes";

export type AgentProvider = "local" | "minimax";

export type ToolInvocation = {
  toolName: string;
  params: Record<string, unknown>;
};

type MiniMaxCompileResponse = {
  schemas: ToolSchema[];
};

type MiniMaxParseResponse = ToolInvocation;

export function configuredAgentProvider(): AgentProvider {
  return import.meta.env.VITE_AGENT_PROVIDER === "minimax" ? "minimax" : "local";
}

export function miniMaxProxyUrl(): string {
  return import.meta.env.VITE_MINIMAX_PROXY_URL ?? "";
}

export function isMiniMaxConfigured(): boolean {
  return configuredAgentProvider() === "minimax" && miniMaxProxyUrl().length > 0;
}

export async function compileWithMiniMax(domSummary: DomSummary): Promise<ToolSchema[]> {
  const response = await callMiniMaxProxy<MiniMaxCompileResponse>("/compile", {
    domSummary,
    model: import.meta.env.VITE_MINIMAX_MODEL,
  });

  return response.schemas;
}

export async function parseCommandWithMiniMax(command: string): Promise<ToolInvocation> {
  return callMiniMaxProxy<MiniMaxParseResponse>("/parse-command", {
    command,
    model: import.meta.env.VITE_MINIMAX_MODEL,
  });
}

async function callMiniMaxProxy<T>(path: string, body: unknown): Promise<T> {
  const proxyUrl = miniMaxProxyUrl();

  if (!proxyUrl) {
    throw new Error("MiniMax proxy URL is not configured.");
  }

  const response = await fetch(`${proxyUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`MiniMax proxy failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
