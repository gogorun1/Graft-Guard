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
  if (schema.name === "exportBankDetails") {
    return "This will expose vendor bank/account data for the selected invoices.";
  }

  if (schema.risk === "export") {
    return "This may download or expose data from the current page.";
  }

  if (schema.risk === "destructive") {
    return "This action may remove or revoke data. Review the target page before allowing it.";
  }

  if (schema.risk === "write") {
    return "This may submit or modify data on the current page.";
  }

  return "This will read the current page and extract matching results or page data.";
}
