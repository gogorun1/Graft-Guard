export type RiskLevel = "read" | "write" | "export" | "destructive";

export type ReplayStep =
  | { type: "setValue"; selector: string; valueFrom: string }
  | { type: "click"; selector: string }
  | { type: "extractTable"; selector: string };

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
