export type RiskLevel = "read" | "write" | "export" | "destructive";

export type LocatorSpec = {
  css?: string;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  testId?: string;
  tagName?: string;
  type?: string;
  within?: LocatorSpec;
  alternatives?: LocatorSpec[];
  confidence?: number;
};

export type ReplayStep =
  | { type: "setValue"; selector: string; valueFrom: string; locator?: LocatorSpec }
  | { type: "click"; selector: string; locator?: LocatorSpec }
  | { type: "extractTable"; selector: string; locator?: LocatorSpec };

export type ToolSchema = {
  name: string;
  description: string;
  risk: RiskLevel;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  replayPlan: ReplayStep[];
};

export type DomSummary = {
  appName: string;
  stableIds: string[];
};

export type ReplayTrace = {
  step: ReplayStep;
  message: string;
};

export type ReplayResult = {
  rows: Record<string, string | number>[];
  trace: ReplayTrace[];
  llmCalls: 0;
};
