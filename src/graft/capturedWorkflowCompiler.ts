import type { CapturedStep, PageDomSummary } from "../extension/pageSummary";
import type { ReplayStep, RiskLevel, ToolSchema } from "./schemaTypes";

export type CandidateTool = {
  schema: ToolSchema;
  warnings: string[];
};

export function compileCapturedWorkflow(steps: CapturedStep[], page?: PageDomSummary): CandidateTool {
  if (steps.length === 0) {
    throw new Error("Capture at least one workflow step before generating a schema.");
  }

  const warnings: string[] = [];
  const clickLabels = steps
    .filter((step) => step.type === "click")
    .map((step) => step.label ?? "")
    .filter(Boolean);
  const toolName = inferToolName(clickLabels, page);
  const risk = inferRisk(steps);
  const parameterNames = new Map<string, string>();
  const parameterSchemas = new Map<string, Record<string, unknown>>();
  const usedNames = new Set<string>();

  const replayPlan: ReplayStep[] = steps.map((step): ReplayStep => {
    if (step.type === "click") {
      if (looksDynamicSelector(step.selector)) {
        warnings.push(`Selector may be dynamic: ${step.selector}`);
      }

      return { type: "click" as const, selector: step.selector };
    }

    const name = uniqueName(inferParameterName(step), usedNames);
    parameterNames.set(step.selector, name);
    parameterSchemas.set(name, inferParameterSchema(step));

    if (looksDynamicSelector(step.selector)) {
      warnings.push(`Selector may be dynamic: ${step.selector}`);
    }

    return { type: "setValue" as const, selector: step.selector, valueFrom: name };
  });

  if (risk === "read" && page?.tables[0]) {
    replayPlan.push({ type: "extractTable", selector: page.tables[0].selector });
  }

  const properties = Array.from(parameterNames.values()).reduce<Record<string, unknown>>((record, name) => {
    record[name] = parameterSchemas.get(name) ?? { type: "string" };
    return record;
  }, {});

  if (Object.keys(properties).length === 0) {
    warnings.push("No input parameters were inferred. This tool will only replay clicks.");
  }

  return {
    schema: {
      name: toolName,
      description: describeTool(toolName, risk, page),
      risk,
      inputSchema: {
        type: "object",
        properties,
        required: Object.keys(properties),
      },
      replayPlan,
    },
    warnings: Array.from(new Set(warnings)),
  };
}

export function loadPageSchemas(page: PageDomSummary): ToolSchema[] {
  const raw = localStorage.getItem(pageSchemaCacheKey(page));
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ToolSchema[];
  } catch {
    localStorage.removeItem(pageSchemaCacheKey(page));
    return [];
  }
}

export function savePageSchema(page: PageDomSummary, schema: ToolSchema): ToolSchema[] {
  const current = loadPageSchemas(page);
  const next = [schema, ...current.filter((tool) => tool.name !== schema.name)];
  localStorage.setItem(pageSchemaCacheKey(page), JSON.stringify(next));
  return next;
}

export function replacePageSchemas(page: PageDomSummary, schemas: ToolSchema[]): ToolSchema[] {
  localStorage.setItem(pageSchemaCacheKey(page), JSON.stringify(schemas));
  return schemas;
}

function pageSchemaCacheKey(page: PageDomSummary): string {
  return `graftguard.schemas.page.${hashString(`${page.origin}:${page.fingerprint}`)}`;
}

function inferToolName(clickLabels: string[], page?: PageDomSummary): string {
  const actionLabel =
    clickLabels.find((label) => /\b(add|invite|create|save|submit|export|download|search|find|delete|remove)\b/i.test(label)) ??
    clickLabels.at(-1) ??
    page?.title ??
    "captured workflow";

  const normalized = actionLabel.replace(/[^\w\s]/g, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean).slice(0, 4);
  return toCamelCase(words.length > 0 ? words.join(" ") : "captured workflow");
}

function inferParameterName(step: Extract<CapturedStep, { type: "setValue" }>): string {
  const source = step.label || step.selector;
  const lowered = source.toLowerCase();

  if (/\b(find people|person|people|collaborator|user|member|assignee)\b/.test(lowered)) {
    return "personName";
  }

  if (/\b(email|e-mail)\b/.test(lowered)) {
    return "email";
  }

  if (/\b(date|day)\b/.test(lowered)) {
    return "date";
  }

  if (/\b(amount|price|total|minimum|min)\b/.test(lowered)) {
    return "amount";
  }

  if (/\b(dropdown|select)\b/.test(lowered)) {
    return toCamelCase(source.replace(/\b(open this select menu|one|two|three)\b/gi, ""));
  }

  return toCamelCase(source.replace(/^(find|search|enter|select|choose)\s+/i, ""));
}

function inferParameterSchema(step: Extract<CapturedStep, { type: "setValue" }>): Record<string, unknown> {
  if (step.inputType === "checkbox" || step.inputType === "radio") {
    return { type: "boolean" };
  }

  if (step.inputType === "number" || step.inputType === "range") {
    return { type: "number" };
  }

  if (step.inputType === "date") {
    return { type: "string", format: "date" };
  }

  return { type: "string" };
}

function inferRisk(steps: CapturedStep[]): RiskLevel {
  const text = steps
    .map((step) => (step.type === "click" ? step.label : step.label || step.selector))
    .join(" ")
    .toLowerCase();

  if (/\b(delete|remove|destroy|revoke|terminate|drop)\b/.test(text)) {
    return "destructive";
  }

  if (/\b(export|download|csv|xlsx|pdf)\b/.test(text)) {
    return "export";
  }

  if (/\b(add|invite|create|save|submit|update|edit|collaborator|access|permission)\b/.test(text)) {
    return "write";
  }

  return "read";
}

function describeTool(name: string, risk: RiskLevel, page?: PageDomSummary): string {
  const scope = page ? ` on ${page.origin}` : "";
  return `${name} captured from a demonstrated ${risk} workflow${scope}`;
}

function looksDynamicSelector(selector: string): boolean {
  return /#(_r_|item-[0-9a-f-]{12,}|[0-9a-f-]{8,})/i.test(selector);
}

function uniqueName(baseName: string, usedNames: Set<string>): string {
  const safeBase = baseName || "value";
  let name = safeBase;
  let suffix = 2;

  while (usedNames.has(name)) {
    name = `${safeBase}${suffix}`;
    suffix += 1;
  }

  usedNames.add(name);
  return name;
}

function toCamelCase(value: string): string {
  const words = value
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "capturedWorkflow";
  }

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}
