import type { PageButtonSummary, PageDomSummary, PageInputSummary } from "../extension/pageSummary";
import type { ReplayStep, RiskLevel, ToolSchema } from "./schemaTypes";
import type { CandidateTool } from "./capturedWorkflowCompiler";

export function compileWebsiteIntent(intent: string, page: PageDomSummary): CandidateTool {
  const usableInputs = page.inputs.filter((input) => input.type !== "submit" && input.type !== "button");
  const submitButton = chooseButton(intent, page.buttons);
  const toolName = inferToolName(intent, submitButton);
  const risk = inferRisk(intent, submitButton);
  const usedNames = new Set<string>();
  const warnings: string[] = [];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  const replayPlan: ReplayStep[] = usableInputs.map((input) => {
    const name = uniqueName(inferParameterName(input), usedNames);
    properties[name] = inferParameterSchema(input);
    required.push(name);

    if (looksDynamicSelector(input.selector)) {
      warnings.push(`Selector may be dynamic: ${input.selector}`);
    }

    return { type: "setValue", selector: input.selector, locator: input.locator, valueFrom: name };
  });

  if (submitButton) {
    if (looksDynamicSelector(submitButton.selector)) {
      warnings.push(`Selector may be dynamic: ${submitButton.selector}`);
    }
    replayPlan.push({ type: "click", selector: submitButton.selector, locator: submitButton.locator });
  } else {
    warnings.push("No clear submit/action button was detected. Use Record actions for this page.");
  }

  if (risk === "read" && page.tables[0]) {
    replayPlan.push({ type: "extractTable", selector: page.tables[0].selector, locator: page.tables[0].locator });
  }

  if (usableInputs.length === 0) {
    warnings.push("No form inputs were detected. Use Record actions if the workflow is menu-driven.");
  }

  return {
    schema: {
      name: toolName,
      description: `${toolName} suggested from "${intent}" on ${page.origin}`,
      risk,
      inputSchema: {
        type: "object",
        properties,
        required,
      },
      replayPlan,
    },
    warnings: Array.from(new Set(warnings)),
  };
}

function chooseButton(intent: string, buttons: PageButtonSummary[]): PageButtonSummary | undefined {
  const loweredIntent = intent.toLowerCase();
  const actionWords = [
    "submit",
    "save",
    "search",
    "find",
    "add",
    "invite",
    "create",
    "export",
    "download",
  ];

  const intentAction = actionWords.find((word) => loweredIntent.includes(word));
  if (intentAction) {
    const direct = buttons.find((button) => button.text.toLowerCase().includes(intentAction));
    if (direct) {
      return direct;
    }
  }

  return (
    buttons.find((button) => /submit|save|search|find|add|invite|create|export|download/i.test(button.text)) ??
    buttons[0]
  );
}

function inferToolName(intent: string, button?: PageButtonSummary): string {
  const cleaned = intent
    .replace(/^(create|make|build)\s+(a\s+)?tool\s+to\s+/i, "")
    .replace(/^(please\s+)?/i, "")
    .trim();

  if (cleaned.length > 0) {
    return toCamelCase(cleaned.split(/\s+/).slice(0, 5).join(" "));
  }

  return toCamelCase(button?.text || "learned workflow");
}

function inferParameterName(input: PageInputSummary): string {
  const source = input.label || input.name || input.placeholder || input.selector;
  const lowered = source.toLowerCase();

  if (/\b(email|e-mail)\b/.test(lowered)) {
    return "email";
  }

  if (/\b(password|secret|token)\b/.test(lowered)) {
    return "credential";
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

function inferParameterSchema(input: PageInputSummary): Record<string, unknown> {
  if (input.type === "checkbox" || input.type === "radio") {
    return { type: "boolean" };
  }

  if (input.type === "number" || input.type === "range") {
    return { type: "number" };
  }

  if (input.type === "date") {
    return { type: "string", format: "date" };
  }

  return { type: "string" };
}

function inferRisk(intent: string, button?: PageButtonSummary): RiskLevel {
  const text = `${intent} ${button?.text ?? ""}`.toLowerCase();

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
    return "learnedWorkflow";
  }

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}
