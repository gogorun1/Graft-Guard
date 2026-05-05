import type { DomSummary, ToolSchema } from "./schemaTypes";
import { compileWithMiniMax, isMiniMaxConfigured } from "./minimaxClient";

const CACHE_KEY = "graftguard.schemas.acme-erp";

const queryOrdersSchema: ToolSchema = {
  name: "queryOrders",
  description: "Search Acme ERP orders by date range and minimum amount",
  risk: "read",
  inputSchema: {
    type: "object",
    properties: {
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      minAmount: { type: "number" },
    },
    required: ["startDate", "endDate", "minAmount"],
  },
  replayPlan: [
    { type: "setValue", selector: "#start-date", valueFrom: "startDate" },
    { type: "setValue", selector: "#end-date", valueFrom: "endDate" },
    { type: "setValue", selector: "#min-amount", valueFrom: "minAmount" },
    { type: "click", selector: "#search-orders" },
    { type: "extractTable", selector: "#orders-table" },
  ],
};

const exportCsvSchema: ToolSchema = {
  name: "exportCsv",
  description: "Export the current Acme ERP order table to CSV",
  risk: "export",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  replayPlan: [{ type: "click", selector: "#export-csv" }],
};

const hardcodedSchemas = [queryOrdersSchema, exportCsvSchema];

export async function compileApp(domSummary: DomSummary): Promise<ToolSchema[]> {
  if (!domSummary.stableIds.includes("#orders-table")) {
    throw new Error("Acme ERP table was not found in the DOM summary.");
  }

  if (isMiniMaxConfigured()) {
    const schemas = await compileWithMiniMax(domSummary);
    localStorage.setItem(CACHE_KEY, JSON.stringify(schemas));
    return schemas;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 350));
  localStorage.setItem(CACHE_KEY, JSON.stringify(hardcodedSchemas));
  return hardcodedSchemas;
}

export function loadCachedSchemas(): ToolSchema[] {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ToolSchema[];
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return [];
  }
}

export function schemaSignature(schema: ToolSchema): string {
  if (schema.name === "queryOrders") {
    return "queryOrders(startDate: Date, endDate: Date, minAmount: Number): Order[]";
  }

  return "exportCsv(): CsvFile";
}
