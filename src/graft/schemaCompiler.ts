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
      startDate: {
        type: "string",
        format: "date",
        title: "Start date",
        default: "2026-04-01",
      },
      endDate: {
        type: "string",
        format: "date",
        title: "End date",
        default: "2026-04-30",
      },
      minAmount: {
        type: "number",
        title: "Minimum amount",
        default: 1000,
        minimum: 0,
        step: 1,
      },
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

  if (schema.name === "exportCsv") {
    return "exportCsv(): CsvFile";
  }

  const required = schema.inputSchema.required ?? [];
  const params = required.map((name) => `${name}: ${typeLabel(schema.inputSchema.properties[name])}`).join(", ");
  const result = schema.risk === "read" ? "Record[]" : "ActionResult";
  return `${schema.name}(${params}): ${result}`;
}

function typeLabel(property: unknown): string {
  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    typeof property.type === "string"
  ) {
    if (property.type === "number") {
      return "Number";
    }

    if (property.type === "boolean") {
      return "Boolean";
    }

    return "String";
  }

  return "unknown";
}
