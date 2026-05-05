import type { CapturedStep, PageDomSummary } from "../extension/pageSummary";
import type { CompiledToolGroup } from "./agentCompiler";
import type { CandidateTool } from "./capturedWorkflowCompiler";
import type { ReplayResult, RiskLevel, ToolSchema } from "./schemaTypes";

export type AgentMessageIcon = "search" | "brain" | "check" | "warning" | "eye" | "bolt" | "error";
export type AgentMessagePhase = "compile" | "replay" | "idle";

export type AgentMessage = {
  id: string;
  timestamp: number;
  icon: AgentMessageIcon;
  text: string;
  detail?: string;
  phase: AgentMessagePhase;
};

export type AgentNarratorEvent =
  | { id: string; timestamp: number; type: "page_observed"; summary: PageDomSummary }
  | { id: string; timestamp: number; type: "compile_started"; summary?: PageDomSummary }
  | {
      id: string;
      timestamp: number;
      type: "compile_stage";
      stage: "send_to_compiler" | "normalize_draft" | "attach_guard";
      summary?: PageDomSummary;
    }
  | { id: string; timestamp: number; type: "compile_group_succeeded"; group: CompiledToolGroup; summary: PageDomSummary }
  | {
      id: string;
      timestamp: number;
      type: "compile_succeeded";
      schema: ToolSchema;
      warnings?: string[];
      summary?: PageDomSummary;
      source: "demo" | "website" | "capture";
    }
  | { id: string; timestamp: number; type: "capture_started" }
  | { id: string; timestamp: number; type: "capture_completed"; steps: CapturedStep[]; candidate: CandidateTool }
  | { id: string; timestamp: number; type: "command_parsed"; toolName: string; params: Record<string, unknown>; usedAi: boolean }
  | { id: string; timestamp: number; type: "tool_run_queued"; schema: ToolSchema; params: Record<string, unknown> }
  | { id: string; timestamp: number; type: "approval_granted"; schema: ToolSchema }
  | { id: string; timestamp: number; type: "replay_completed"; schema: ToolSchema; result: ReplayResult }
  | { id: string; timestamp: number; type: "replay_failed"; schema?: ToolSchema; message: string };

export type AgentNarratorInput = AgentNarratorEvent extends infer Event
  ? Event extends AgentNarratorEvent
    ? Omit<Event, "id" | "timestamp">
    : never
  : never;

export function narrateAgentEvent(event: AgentNarratorEvent): AgentMessage | null {
  if (event.type === "page_observed") {
    return message(event, {
      icon: "search",
      phase: "idle",
      text: `I can see ${event.summary.inputs.length} form fields and ${event.summary.buttons.length} buttons on this page.`,
      detail: "Ready to compile when you are.",
    });
  }

  if (event.type === "compile_started") {
    return message(event, {
      icon: "brain",
      phase: "compile",
      text: "Reading the page structure and workflow goal.",
      detail: event.summary
        ? `Observed ${event.summary.inputs.length} inputs, ${event.summary.buttons.length} actions, and ${event.summary.tables.length} tables: ${summarizeInputs(event.summary)}.`
        : "Using the known Acme ERP workflow.",
    });
  }

  if (event.type === "compile_stage") {
    if (event.stage === "send_to_compiler") {
      return message(event, {
        icon: "brain",
        phase: "compile",
        text: "Sending the goal and page summary to the compiler.",
        detail: "MiniMax can produce an AgentDraft; Graft Guard will keep selector and replay execution local.",
      });
    }

    if (event.stage === "normalize_draft") {
      return message(event, {
        icon: "search",
        phase: "compile",
        text: "Normalizing the agent draft into reusable typed tools.",
        detail: "Mapping semantic capabilities to stable tool names, parameters, risks, and replay plans.",
      });
    }

    return message(event, {
      icon: "warning",
      phase: "compile",
      text: "Checking the workflow for guarded actions.",
      detail: "Exports, destructive actions, and sensitive business data are marked for approval before replay.",
    });
  }

  if (event.type === "compile_group_succeeded") {
    const riskyTools = event.group.tools.filter((tool) => tool.risk !== "read");
    const provider = event.group.provider === "agent-api" ? "MiniMax" : "local fallback";
    const workflow = event.group.workflowPlan.map((step) => step.tool).join(" -> ");
    const riskText =
      riskyTools.length > 0
        ? `Flagged ${riskyTools.map((tool) => `${tool.name} as ${tool.risk}`).join(", ")}.`
        : "No risky actions found.";

    return message(event, {
      icon: riskyTools.length > 0 ? "warning" : "check",
      phase: "compile",
      text: `${provider} compiled ${event.group.tools.length} typed tools from this page.`,
      detail: `Workflow: ${workflow}. ${riskText}`,
    });
  }

  if (event.type === "compile_succeeded") {
    const warnings = event.warnings ?? [];
    const parameterCount = event.schema.inputSchema.required?.length ?? 0;
    const warningText =
      warnings.length > 0
        ? `${warnings.length} selector warning${warnings.length === 1 ? "" : "s"}`
        : "No selector warnings";

    return message(event, {
      icon: warnings.length > 0 ? "warning" : "check",
      phase: "compile",
      text:
        warnings.length > 0
          ? `I compiled ${event.schema.name}, but some selectors may be unstable.`
          : `I compiled ${event.schema.name} from ${event.source === "demo" ? "Acme ERP" : "this page"}.`,
      detail: `${parameterCount} parameters detected. Risk: ${event.schema.risk} because ${riskReason(event.schema.risk)}. ${warningText}.${warnings.length > 0 ? ` ${warnings.join(" ")}` : ""}`,
    });
  }

  if (event.type === "capture_started") {
    return message(event, {
      icon: "eye",
      phase: "compile",
      text: "Recording your actions now. Do the workflow normally.",
      detail: "I will build a tool schema from what you show me.",
    });
  }

  if (event.type === "capture_completed") {
    return message(event, {
      icon: "check",
      phase: "compile",
      text: `Got it. I saw ${event.steps.length} steps and built ${event.candidate.schema.name}.`,
      detail: summarizeSteps(event.steps),
    });
  }

  if (event.type === "command_parsed") {
    if (!event.usedAi) {
      return null;
    }

    return message(event, {
      icon: "brain",
      phase: "compile",
      text: `I used AI to parse your command into ${event.toolName}.`,
      detail: `Params: ${formatParams(event.params)}. From here, replay is fully local.`,
    });
  }

  if (event.type === "tool_run_queued") {
    return message(event, {
      icon: "bolt",
      phase: "replay",
      text: `Running ${event.schema.name} from local cache. No AI needed.`,
      detail: `Waiting for approval. Params: ${formatParams(event.params)}.`,
    });
  }

  if (event.type === "approval_granted") {
    return message(event, {
      icon: "bolt",
      phase: "replay",
      text: "Approved. Replaying now with deterministic local steps.",
      detail: `${event.schema.replayPlan.length} replay steps. No AI calls during replay.`,
    });
  }

  if (event.type === "replay_completed") {
    return message(event, {
      icon: "check",
      phase: "replay",
      text: `Done. Extracted ${event.result.rows.length} result${event.result.rows.length === 1 ? "" : "s"}.`,
      detail: `Total AI calls this run: ${event.result.llmCalls}.`,
    });
  }

  if (event.type === "replay_failed") {
    return message(event, {
      icon: "error",
      phase: "replay",
      text: "Replay failed. The page may have changed.",
      detail: `${event.message} Try Record actions to recompile this workflow.`,
    });
  }

  return null;
}

function message(
  event: Pick<AgentNarratorEvent, "id" | "timestamp">,
  content: Omit<AgentMessage, "id" | "timestamp">,
): AgentMessage {
  return {
    id: event.id,
    timestamp: event.timestamp,
    ...content,
  };
}

function summarizeInputs(summary: PageDomSummary): string {
  const labels = summary.inputs
    .map((input) => input.label || input.name || input.placeholder || input.selector)
    .filter(Boolean)
    .slice(0, 4);

  if (labels.length === 0) {
    return "no obvious form fields";
  }

  return labels.join(", ");
}

function summarizeSteps(steps: CapturedStep[]): string {
  return steps
    .slice(0, 5)
    .map((step) => (step.type === "setValue" ? `set ${step.label || step.selector}` : `click ${step.label || step.selector}`))
    .join("; ");
}

function riskReason(risk: RiskLevel): string {
  const reasons: Record<RiskLevel, string> = {
    read: "it reads or extracts page data without submitting changes",
    write: "the workflow includes submit, save, create, update, invite, or permission-changing actions",
    export: "the workflow may download or export business data",
    destructive: "the workflow appears to remove, revoke, delete, or terminate data",
  };

  return reasons[risk];
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}
