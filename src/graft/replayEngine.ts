import type { ReplayResult, ReplayStep, ReplayTrace, ToolSchema } from "./schemaTypes";

type Params = Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function replayTool(
  schema: ToolSchema,
  params: Params,
  onTrace?: (trace: ReplayTrace) => void,
): Promise<ReplayResult> {
  validateParams(schema, params);

  const trace: ReplayTrace[] = [];
  const record = (step: ReplayStep, message: string) => {
    const event = { step, message };
    trace.push(event);
    onTrace?.(event);
  };

  let rows: Record<string, string | number>[] = [];

  for (const step of schema.replayPlan) {
    if (step.type === "setValue") {
      const target = queryElement<HTMLInputElement>(step.selector);
      const rawValue = params[step.valueFrom];
      target.value = String(rawValue ?? "");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      record(step, `Set ${step.selector} from ${step.valueFrom}`);
      await sleep(100);
    }

    if (step.type === "click") {
      queryElement<HTMLElement>(step.selector).click();
      record(step, `Clicked ${step.selector}`);
      await sleep(220);
    }

    if (step.type === "extractTable") {
      rows = extractTable(step.selector);
      record(step, `Extracted ${rows.length} rows from ${step.selector}`);
      await sleep(80);
    }
  }

  return { rows, trace, llmCalls: 0 };
}

function validateParams(schema: ToolSchema, params: Params) {
  const required = schema.inputSchema.required ?? [];
  const missing = required.filter((key) => params[key] === undefined || params[key] === "");

  if (missing.length > 0) {
    throw new Error(`Missing required params: ${missing.join(", ")}`);
  }
}

function queryElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`Replay selector not found: ${selector}`);
  }

  return element as T;
}

function extractTable(selector: string): Record<string, string | number>[] {
  const table = queryElement<HTMLTableElement>(selector);
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) =>
    normalizeKey(cell.textContent ?? ""),
  );

  return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
    const values = Array.from(row.querySelectorAll("td"));
    return headers.reduce<Record<string, string | number>>((record, key, index) => {
      const value = values[index]?.textContent?.trim() ?? "";
      record[key] = key === "amount" ? Number(value.replace(/[^\d.]/g, "")) : value;
      return record;
    }, {});
  });
}

function normalizeKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "_");
}
