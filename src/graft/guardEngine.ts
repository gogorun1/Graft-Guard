import type { RiskLevel, ToolSchema } from "./schemaTypes";

export type ApprovalDecision = "allowed" | "denied";

export function requiresApproval(risk: RiskLevel): boolean {
  return ["read", "write", "export", "destructive"].includes(risk);
}

export function riskLabel(risk: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    read: "read business data",
    write: "modify business data",
    export: "export business data",
    destructive: "perform a destructive action",
  };

  return labels[risk];
}

export function approvalDescription(schema: ToolSchema): string {
  if (schema.risk === "export") {
    return "This may download customer/order data from Acme ERP.";
  }

  if (schema.risk === "destructive") {
    return "This action is blocked in the demo unless explicitly approved.";
  }

  return "This will search Acme ERP and extract matching order rows.";
}
