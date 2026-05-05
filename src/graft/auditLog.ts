import type { RiskLevel } from "./schemaTypes";

export type AuditEventType =
  | "learned_tool"
  | "approval_requested"
  | "approval_allowed"
  | "approval_denied"
  | "replay_started"
  | "replay_step"
  | "replay_completed"
  | "replay_failed";

export type AuditEvent = {
  id: string;
  timestamp: string;
  type: AuditEventType;
  toolName?: string;
  params?: Record<string, unknown>;
  risk?: RiskLevel;
  message: string;
  llmCalls: number;
};

export function createAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  return {
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
}
