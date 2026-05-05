import {
  configuredAgentProvider,
  isMiniMaxConfigured,
  parseCommandWithMiniMax,
  type ToolInvocation,
} from "./minimaxClient";

export async function parseNaturalLanguageCommand(command: string): Promise<ToolInvocation> {
  if (isMiniMaxConfigured()) {
    return parseCommandWithMiniMax(command);
  }

  return parseLocalOrderQuery(command);
}

export function activeParserLabel(): string {
  return configuredAgentProvider() === "minimax" ? "MiniMax provider hook" : "deterministic local parser";
}

function parseLocalOrderQuery(input: string): ToolInvocation {
  const amountMatch = input.match(/over\s+(\d+(?:\.\d+)?)/i);
  const minAmount = amountMatch ? Number(amountMatch[1]) : 1000;

  return {
    toolName: "queryOrders",
    params: {
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      minAmount,
    },
  };
}
