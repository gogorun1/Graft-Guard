import { useEffect, useMemo, useState } from "react";
import { DemoErp } from "./demo-erp/DemoErp";
import {
  collectActivePageSummary,
  isExtensionRuntime,
  replayActivePageTool,
  startActivePageCapture,
  stopActivePageCapture,
} from "./extension/targetPageClient";
import type { CapturedStep, PageDomSummary } from "./extension/pageSummary";
import {
  narrateAgentEvent,
  type AgentMessage,
  type AgentNarratorEvent,
  type AgentNarratorInput,
} from "./graft/agentNarrator";
import { createAuditEvent, type AuditEvent } from "./graft/auditLog";
import {
  compileCapturedWorkflow,
  loadPageSchemas,
  savePageSchema,
  type CandidateTool,
} from "./graft/capturedWorkflowCompiler";
import { activeParserLabel, parseNaturalLanguageCommand } from "./graft/commandParser";
import { compileApp, loadCachedSchemas } from "./graft/schemaCompiler";
import { replayTool } from "./graft/replayEngine";
import type { ReplayResult, ReplayTrace, ToolSchema } from "./graft/schemaTypes";
import { requiresApproval } from "./graft/guardEngine";
import {
  compileToolGroupWithAgent,
  type CompiledToolGroup,
} from "./graft/agentCompiler";
import {
  finishVendorPaymentWorkflow,
  startCompiledVendorPaymentWorkflow,
  startVendorPaymentWorkflow,
  type PaymentPacket,
  type VendorAgentEvent,
} from "./graft/vendorPaymentAgent";
import { GraftPanel } from "./ui/GraftPanel";
import { ExtensionInspector } from "./ui/ExtensionInspector";

const presetCommand = "Prepare a vendor payment packet for all overdue invoices above EUR 5,000, but do not export bank details without approval.";
const defaultWebsiteIntent = "Create a tool to submit this form";
const simulatedRunDelayMs = 1200;

type PendingApproval = {
  schema: ToolSchema;
  params: Record<string, unknown>;
};

export default function App() {
  const [schemas, setSchemas] = useState<ToolSchema[]>(() => loadCachedSchemas());
  const [selectedToolName, setSelectedToolName] = useState("queryOrders");
  const [command, setCommand] = useState(presetCommand);
  const [websiteIntent, setWebsiteIntent] = useState(defaultWebsiteIntent);
  const [toolParams, setToolParams] = useState<Record<string, string>>({});
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval>();
  const [replayTrace, setReplayTrace] = useState<ReplayTrace[]>([]);
  const [replayResult, setReplayResult] = useState<ReplayResult>();
  const [paymentPacket, setPaymentPacket] = useState<PaymentPacket>();
  const [vendorAgentEvents, setVendorAgentEvents] = useState<VendorAgentEvent[]>([]);
  const [pendingBankInvoiceIds, setPendingBankInvoiceIds] = useState<string[]>();
  const [compiledToolGroup, setCompiledToolGroup] = useState<CompiledToolGroup>();
  const [isLearning, setIsLearning] = useState(false);
  const [isLearningWebsite, setIsLearningWebsite] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pageSummary, setPageSummary] = useState<PageDomSummary>();
  const [capturedSteps, setCapturedSteps] = useState<CapturedStep[]>([]);
  const [candidateTool, setCandidateTool] = useState<CandidateTool>();
  const [isCapturing, setIsCapturing] = useState(false);
  const [inspectionError, setInspectionError] = useState<string>();
  const isExtension = isExtensionRuntime();

  const selectedSchema = useMemo(
    () =>
      schemas.find((schema) => schema.name === selectedToolName) ??
      compiledToolGroup?.tools.find((schema) => schema.name === selectedToolName) ??
      schemas[0] ??
      compiledToolGroup?.tools[0],
    [compiledToolGroup, schemas, selectedToolName],
  );

  useEffect(() => {
    if (!selectedSchema) {
      setToolParams({});
      return;
    }

    setToolParams((current) => {
      const next = { ...current };
      for (const key of selectedSchema.inputSchema.required ?? []) {
        next[key] = next[key] ?? defaultParamValue(selectedSchema.inputSchema.properties[key]);
      }
      return next;
    });
  }, [selectedSchema]);

  useEffect(() => {
    if (!isExtension) {
      return;
    }

    let cancelled = false;

    async function inspectOnOpen() {
      try {
        const summary = await collectActivePageSummary();
        if (cancelled) {
          return;
        }

        setPageSummary(summary);
        const pageSchemas = loadPageSchemas(summary);
        setSchemas(pageSchemas);
        setSelectedToolName(pageSchemas[0]?.name ?? "queryOrders");
        addAgentMessage({ type: "page_observed", summary });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Active page inspection failed";
        setInspectionError(message);
        addAgentMessage({ type: "replay_failed", message });
      }
    }

    void inspectOnOpen();

    return () => {
      cancelled = true;
    };
  }, [isExtension]);

  function addAudit(event: Omit<AuditEvent, "id" | "timestamp">) {
    setAuditEvents((current) => [createAuditEvent(event), ...current]);
  }

  function addAgentMessage(event: AgentNarratorInput) {
    const message = narrateAgentEvent({
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    } as AgentNarratorEvent);

    if (!message) {
      return;
    }

    setAgentMessages((current) => [message, ...current].slice(0, 10));
  }

  async function handleLearn() {
    setIsLearning(true);
    addAgentMessage({ type: "compile_started" });
    try {
      const compiled = await compileApp({
        appName: "Acme ERP Order Management v3.2",
        stableIds: [
          "#start-date",
          "#end-date",
          "#min-amount",
          "#customer-name",
          "#search-orders",
          "#export-csv",
          "#orders-table",
          "#nav-invoices",
          "#invoice-status",
          "#invoice-min-amount",
          "#search-invoices",
          "#export-bank-details",
          "#invoices-table",
          "#invoice-detail",
        ],
      });

      setSchemas(compiled);
      setSelectedToolName("searchInvoices");
      addAgentMessage({
        type: "compile_succeeded",
        schema: compiled[0],
        warnings: [],
        source: "demo",
      });
      addAudit({
        type: "learned_tool",
        toolName: "searchInvoices",
        risk: "read",
        message: "Compiled vendor payment tool group from Acme ERP",
        llmCalls: 1,
      });
      addAudit({
        type: "learned_tool",
        toolName: "queryOrders",
        risk: "read",
        message: "Cached schema locally",
        llmCalls: 0,
      });
    } catch (error) {
      addAudit({
        type: "replay_failed",
        message: error instanceof Error ? error.message : "Compile failed",
        llmCalls: 0,
      });
    } finally {
      setIsLearning(false);
    }
  }

  async function handleInspectActivePage() {
    setIsInspecting(true);
    setInspectionError(undefined);

    try {
      const summary = await collectActivePageSummary();
      setPageSummary(summary);
      const pageSchemas = loadPageSchemas(summary);
      setSchemas(pageSchemas);
      setSelectedToolName(pageSchemas[0]?.name ?? "queryOrders");
      addAgentMessage({ type: "page_observed", summary });
      addAudit({
        type: "learned_tool",
        message: `Inspected ${summary.inputs.length} inputs, ${summary.buttons.length} buttons, ${summary.tables.length} tables on ${summary.origin}`,
        llmCalls: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Active page inspection failed";
      setInspectionError(message);
      addAudit({
        type: "replay_failed",
        message,
        llmCalls: 0,
      });
    } finally {
      setIsInspecting(false);
    }
  }

  async function handleLearnWebsite() {
    setIsLearningWebsite(true);
    setInspectionError(undefined);
    setCandidateTool(undefined);
    setCompiledToolGroup(undefined);

    try {
      const summary = await collectActivePageSummary();
      setPageSummary(summary);
      addAgentMessage({ type: "compile_started", summary });
      const stopCompileStages = startCompileStageMessages(summary, addAgentMessage);

      const effectiveIntent = websiteIntent.trim() || defaultWebsiteIntent;
      setCommand(effectiveIntent);
      const group = await compileToolGroupWithAgent({ prompt: effectiveIntent, pageSummary: summary }).finally(stopCompileStages);
      setCompiledToolGroup(group);
      setSchemas([]);
      setSelectedToolName(group.tools[0]?.name ?? "generatedTool");
      addAgentMessage({ type: "compile_group_succeeded", group, summary });
      addAudit({
        type: "learned_tool",
        toolName: group.name,
        risk: "read",
        message: `Suggested ${group.name} by ${group.provider === "agent-api" ? "MiniMax" : "local fallback"}`,
        llmCalls: group.provider === "agent-api" ? 1 : 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Website compile failed";
      setInspectionError(message);
      addAudit({
        type: "replay_failed",
        message,
        llmCalls: 0,
      });
    } finally {
      setIsLearningWebsite(false);
    }
  }

  async function handleStartCapture() {
    setInspectionError(undefined);
    setCapturedSteps([]);
    setCandidateTool(undefined);

    try {
      await startActivePageCapture();
      setIsCapturing(true);
      addAgentMessage({ type: "capture_started" });
      addAudit({
        type: "replay_started",
        message: "Workflow capture started on active page",
        llmCalls: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow capture failed to start";
      setInspectionError(message);
      addAudit({
        type: "replay_failed",
        message,
        llmCalls: 0,
      });
    }
  }

  async function handleStopCapture() {
    setInspectionError(undefined);

    try {
      const steps = await stopActivePageCapture();
      setCapturedSteps(steps);
      const summary = pageSummary ?? (await collectActivePageSummary().catch(() => undefined));
      if (summary) {
        setPageSummary(summary);
      }
      const candidate = compileCapturedWorkflow(steps, summary);
      setCandidateTool(candidate);
      setSelectedToolName(candidate.schema.name);
      setIsCapturing(false);
      addAgentMessage({ type: "capture_completed", steps, candidate });
      addAudit({
        type: "replay_completed",
        toolName: candidate.schema.name,
        risk: candidate.schema.risk,
        message: `Suggested ${candidate.schema.name} from demonstrated workflow`,
        llmCalls: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow capture failed to stop";
      setInspectionError(message);
      setIsCapturing(false);
      addAudit({
        type: "replay_failed",
        message,
        llmCalls: 0,
      });
    }
  }

  function handleGenerateSchema() {
    try {
      const candidate = compileCapturedWorkflow(capturedSteps, pageSummary);
      setCandidateTool(candidate);
      setSelectedToolName(candidate.schema.name);
      addAgentMessage({
        type: "compile_succeeded",
        schema: candidate.schema,
        warnings: candidate.warnings,
        summary: pageSummary,
        source: "capture",
      });
      addAudit({
        type: "learned_tool",
        toolName: candidate.schema.name,
        risk: candidate.schema.risk,
        message: `Generated candidate schema ${candidate.schema.name}`,
        llmCalls: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate schema";
      setInspectionError(message);
      addAudit({
        type: "replay_failed",
        message,
        llmCalls: 0,
      });
    }
  }

  function handleSaveGeneratedSchema() {
    if (!pageSummary) {
      return;
    }

    if (compiledToolGroup) {
      let saved = loadPageSchemas(pageSummary);
      for (const tool of compiledToolGroup.tools) {
        saved = savePageSchema(pageSummary, tool);
      }
      setSchemas(saved);
      setSelectedToolName(compiledToolGroup.tools[0]?.name ?? "generatedTool");
      addAudit({
        type: "learned_tool",
        toolName: compiledToolGroup.name,
        risk: "read",
        message: `Saved ${compiledToolGroup.tools.length} compiled tools for ${pageSummary.origin}`,
        llmCalls: 0,
      });
      return;
    }

    if (!candidateTool) {
      return;
    }

    const saved = savePageSchema(pageSummary, candidateTool.schema);
    setSchemas(saved);
    setSelectedToolName(candidateTool.schema.name);
    addAudit({
      type: "learned_tool",
      toolName: candidateTool.schema.name,
      risk: candidateTool.schema.risk,
      message: `Saved ${candidateTool.schema.name} for ${pageSummary.origin}`,
      llmCalls: 0,
    });
  }

  async function handleRun() {
    if (compiledToolGroup && isVendorPaymentGroup(compiledToolGroup)) {
      await runVendorPaymentWorkflow();
      return;
    }

    if (isVendorPaymentRequest(command) && !isExtension) {
      await runVendorPaymentWorkflow();
      return;
    }

    if (compiledToolGroup && selectedSchema) {
      handleRunSelectedTool();
      return;
    }

    setIsRunning(true);
    try {
      const invocation = await parseNaturalLanguageCommand(command);
      const schema = schemas.find((tool) => tool.name === invocation.toolName);
      if (!schema) {
        addAudit({
          type: "replay_failed",
          message: `No learned tool matched ${invocation.toolName}`,
          llmCalls: 0,
        });
        setIsRunning(false);
        return;
      }

      const params = invocation.params;
      setReplayTrace([]);
      setReplayResult(undefined);
      addAgentMessage({
        type: "command_parsed",
        toolName: schema.name,
        params,
        usedAi: activeParserLabel().includes("MiniMax"),
      });
      addAgentMessage({ type: "tool_run_queued", schema, params });
      addAudit({
        type: "replay_started",
        toolName: schema.name,
        params,
        risk: schema.risk,
        message: `Mapped command with ${activeParserLabel()}`,
        llmCalls: activeParserLabel().includes("MiniMax") ? 1 : 0,
      });

      if (requiresApproval(schema.risk)) {
        setPendingApproval({ schema, params });
        setIsRunning(false);
        addAudit({
          type: "approval_requested",
          toolName: schema.name,
          params,
          risk: schema.risk,
          message: `Approval requested for ${schema.name}`,
          llmCalls: 0,
        });
        return;
      }

      void executeReplay(schema, params);
    } catch (error) {
      addAudit({
        type: "replay_failed",
        message: error instanceof Error ? error.message : "Command parsing failed",
        llmCalls: 0,
      });
      setIsRunning(false);
    }
  }

  function handleRunSelectedTool() {
    if (!selectedSchema) {
      return;
    }

    const params = collectSchemaParams(selectedSchema, toolParams);
    setReplayTrace([]);
    setReplayResult(undefined);
    addAgentMessage({ type: "tool_run_queued", schema: selectedSchema, params });

    if (requiresApproval(selectedSchema.risk)) {
      setPendingApproval({ schema: selectedSchema, params });
      addAudit({
        type: "approval_requested",
        toolName: selectedSchema.name,
        params,
        risk: selectedSchema.risk,
        message: `Approval requested for ${selectedSchema.name}`,
        llmCalls: 0,
      });
      return;
    }

    void executeReplay(selectedSchema, params);
  }

  async function handleAllow() {
    if (!pendingApproval) {
      return;
    }

    const { schema, params } = pendingApproval;
    setPendingApproval(undefined);

    if (schema.name === "exportBankDetails" && pendingBankInvoiceIds) {
      const run = finishVendorPaymentWorkflow(pendingBankInvoiceIds, true);
      setVendorAgentEvents((current) => [...current, ...run.events]);
      if (run.packet) {
        setPaymentPacket(run.packet);
      }
      setPendingBankInvoiceIds(undefined);
      for (const event of run.events) {
        addAudit({
          type: "replay_completed",
          toolName: schema.name,
          params,
          risk: schema.risk,
          message: event.message,
          llmCalls: 0,
        });
      }
      return;
    }

    addAudit({
      type: "approval_allowed",
      toolName: schema.name,
      params,
      risk: schema.risk,
      message: "Approval allowed once",
      llmCalls: 0,
    });
    addAgentMessage({ type: "approval_granted", schema });
    await executeReplay(schema, params);
  }

  function handleDeny() {
    if (!pendingApproval) {
      return;
    }

    if (pendingApproval.schema.name === "exportBankDetails" && pendingBankInvoiceIds) {
      const run = finishVendorPaymentWorkflow(pendingBankInvoiceIds, false);
      setVendorAgentEvents((current) => [...current, ...run.events]);
      if (run.packet) {
        setPaymentPacket(run.packet);
      }
      for (const event of run.events) {
        addAudit({
          type: event.type === "packet_generated" ? "replay_completed" : "approval_denied",
          toolName: "exportBankDetails",
          risk: "export",
          message: event.message,
          llmCalls: 0,
        });
      }
      setPendingBankInvoiceIds(undefined);
      setPendingApproval(undefined);
      return;
    }

    addAudit({
      type: "approval_denied",
      toolName: pendingApproval.schema.name,
      params: pendingApproval.params,
      risk: pendingApproval.schema.risk,
      message: "Approval denied",
      llmCalls: 0,
    });
    setPendingApproval(undefined);
  }

  async function runVendorPaymentWorkflow() {
    setIsRunning(true);
    setReplayTrace([]);
    setReplayResult(undefined);
    setPaymentPacket(undefined);
    setVendorAgentEvents([]);
    setPendingBankInvoiceIds(undefined);

    try {
      await sleep(simulatedRunDelayMs);
      const run = compiledToolGroup
        ? startCompiledVendorPaymentWorkflow(compiledToolGroup, command)
        : startVendorPaymentWorkflow(command);
      setVendorAgentEvents(run.events);

      for (const event of run.events) {
        addAudit({
          type: event.type === "guard_required" ? "approval_requested" : "replay_step",
          toolName: toolNameForVendorEvent(event),
          risk: event.type === "guard_required" ? "export" : "read",
          message: event.message,
          llmCalls: 0,
        });
      }

      if (run.guardInvoiceIds) {
        const schema = schemas.find((tool) => tool.name === "exportBankDetails") ?? {
          name: "exportBankDetails",
          description: "Export vendor bank/account data for selected invoices",
          risk: "export" as const,
          inputSchema: {
            type: "object" as const,
            properties: {
              invoiceIds: { type: "string", title: "Invoice IDs" },
            },
            required: ["invoiceIds"],
          },
          replayPlan: [{ type: "click" as const, selector: "#export-bank-details" }],
        };
        const params = { invoiceIds: run.guardInvoiceIds.join(",") };
        setPendingBankInvoiceIds(run.guardInvoiceIds);
        setPendingApproval({ schema, params });
      }
    } catch (error) {
      addAudit({
        type: "replay_failed",
        message: error instanceof Error ? error.message : "Vendor payment workflow failed",
        llmCalls: 0,
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function executeReplay(schema: ToolSchema, params: Record<string, unknown>) {
    setIsRunning(true);
    addAudit({
      type: "replay_started",
      toolName: schema.name,
      params,
      risk: schema.risk,
      message: "Replay started from cached schema",
      llmCalls: 0,
    });

    try {
      const result = isExtension
        ? await replayActivePageTool(schema, params)
        : await replayTool(schema, params, (trace) => {
            setReplayTrace((current) => [...current, trace]);
            addAudit({
              type: "replay_step",
              toolName: schema.name,
              params,
              risk: schema.risk,
              message: trace.message,
              llmCalls: 0,
            });
          });

      if (isExtension) {
        setReplayTrace(result.trace);
        for (const trace of result.trace) {
          addAudit({
            type: "replay_step",
            toolName: schema.name,
            params,
            risk: schema.risk,
            message: trace.message,
            llmCalls: 0,
          });
        }
      }

      setReplayResult(result);
      addAgentMessage({ type: "replay_completed", schema, result });
      addAudit({
        type: "replay_completed",
        toolName: schema.name,
        params,
        risk: schema.risk,
        message: "Replay completed",
        llmCalls: 0,
      });
      addAudit({
        type: "replay_completed",
        toolName: schema.name,
        params,
        risk: schema.risk,
        message: "LLM calls during replay: 0",
        llmCalls: 0,
      });
    } catch (error) {
      addAgentMessage({
        type: "replay_failed",
        schema,
        message: error instanceof Error ? error.message : "Replay failed",
      });
      addAudit({
        type: "replay_failed",
        toolName: schema.name,
        params,
        risk: schema.risk,
        message: error instanceof Error ? error.message : "Replay failed",
        llmCalls: 0,
      });
    } finally {
      setIsRunning(false);
    }
  }

  if (!isExtension) {
    return (
      <main className="erp-only-shell">
        <DemoErp />
      </main>
    );
  }

  return (
    <main className="extension-app-shell">
      <div className="extension-panel-stack">
        <ExtensionInspector
          advancedOpen={advancedOpen}
          agentMessages={agentMessages}
          capturedSteps={capturedSteps}
          candidateSchema={candidateTool?.schema}
          candidateWarnings={candidateTool?.warnings ?? []}
          compiledToolGroup={compiledToolGroup}
          error={inspectionError}
          intent={websiteIntent}
          isCapturing={isCapturing}
          isExtension={isExtension}
          isInspecting={isInspecting}
          isLearningWebsite={isLearningWebsite}
          summary={pageSummary}
          onIntentChange={setWebsiteIntent}
          onInspect={handleInspectActivePage}
          onLearnWebsite={handleLearnWebsite}
          onSaveSchema={handleSaveGeneratedSchema}
          isSuggestedToolSaved={Boolean(compiledToolGroup && schemas.length > 0)}
          onStartCapture={handleStartCapture}
          onStopCapture={handleStopCapture}
          onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
        />
        <GraftPanel
          agentMessages={agentMessages}
          auditEvents={auditEvents}
          command={command}
          isExtension={isExtension}
          isLearning={isLearning}
          isRunning={isRunning}
          pendingApproval={pendingApproval}
          paymentPacket={paymentPacket}
          replayResult={replayResult}
          replayTrace={replayTrace}
          schemas={schemas}
          selectedSchema={selectedSchema}
          toolParams={toolParams}
          compiledToolGroup={compiledToolGroup}
          vendorAgentEvents={vendorAgentEvents}
          onAllow={handleAllow}
          onCommandChange={setCommand}
          onDeny={handleDeny}
          onLearn={handleLearn}
          onRun={handleRun}
          onRunSelectedTool={handleRunSelectedTool}
          onSelectSchema={(schema) => setSelectedToolName(schema.name)}
          onToolParamChange={(name, value) => setToolParams((current) => ({ ...current, [name]: value }))}
          onUsePreset={() => setCommand(presetCommand)}
        />
      </div>
    </main>
  );
}

function collectSchemaParams(schema: ToolSchema, values: Record<string, string>): Record<string, unknown> {
  return (schema.inputSchema.required ?? []).reduce<Record<string, unknown>>((params, key) => {
    const property = schema.inputSchema.properties[key];
    params[key] = coerceParamValue(property, values[key] || defaultParamValue(property));
    return params;
  }, {});
}

function coerceParamValue(property: unknown, value: string): unknown {
  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "number"
  ) {
    return Number(value);
  }

  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "boolean"
  ) {
    return value === "true" || value === "checked" || value === "on";
  }

  return value;
}

function defaultParamValue(property: unknown): string {
  if (property && typeof property === "object" && "default" in property) {
    return String(property.default ?? "");
  }

  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "number"
  ) {
    return "0";
  }

  return "";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function startCompileStageMessages(
  summary: PageDomSummary,
  addAgentMessage: (event: AgentNarratorInput) => void,
): () => void {
  addAgentMessage({ type: "compile_stage", stage: "send_to_compiler", summary });

  const timers = [
    window.setTimeout(() => {
      addAgentMessage({ type: "compile_stage", stage: "normalize_draft", summary });
    }, 700),
    window.setTimeout(() => {
      addAgentMessage({ type: "compile_stage", stage: "attach_guard", summary });
    }, 1400),
  ];

  return () => {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
  };
}

function isVendorPaymentRequest(command: string): boolean {
  const normalized = command.toLowerCase();
  return normalized.includes("payment packet") || normalized.includes("overdue invoice");
}

function isVendorPaymentGroup(group: CompiledToolGroup): boolean {
  const tools = new Set(group.tools.map((tool) => tool.name));
  return tools.has("searchInvoices") && tools.has("exportBankDetails");
}

function toolNameForVendorEvent(event: VendorAgentEvent): string {
  return "tool" in event ? event.tool : "extractPaymentPacket";
}
