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
  const { startDate, endDate } = parseDateRange(input);

  return {
    toolName: "queryOrders",
    params: {
      startDate,
      endDate,
      minAmount,
    },
  };
}

function parseDateRange(input: string): { startDate: string; endDate: string } {
  const lowered = input.toLowerCase();
  const explicitMonth = Object.entries(monthNumbers).find(([month]) => lowered.includes(month));

  if (explicitMonth) {
    const month = explicitMonth[1];
    return monthRange(2026, month);
  }

  return monthRange(2026, 4);
}

function monthRange(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

const monthNumbers: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
