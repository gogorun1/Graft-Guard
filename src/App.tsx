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
import { compileWebsiteIntent } from "./graft/websiteIntentCompiler";
import { activeParserLabel, parseNaturalLanguageCommand } from "./graft/commandParser";
import { compileApp, loadCachedSchemas } from "./graft/schemaCompiler";
import { replayTool } from "./graft/replayEngine";
import type { ReplayResult, ReplayTrace, ToolSchema } from "./graft/schemaTypes";
import { requiresApproval } from "./graft/guardEngine";
import { GraftPanel } from "./ui/GraftPanel";
import { ExtensionInspector } from "./ui/ExtensionInspector";

const presetCommand = "Find all orders from last month over 1000 euros";

type PendingApproval = {
  schema: ToolSchema;
  params: Record<string, unknown>;
};

export default function App() {
  const [schemas, setSchemas] = useState<ToolSchema[]>(() => loadCachedSchemas());
  const [selectedToolName, setSelectedToolName] = useState("queryOrders");
  const [command, setCommand] = useState(presetCommand);
  const [websiteIntent, setWebsiteIntent] = useState("Create a tool to submit this form");
  const [toolParams, setToolParams] = useState<Record<string, string>>({});
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval>();
  const [replayTrace, setReplayTrace] = useState<ReplayTrace[]>([]);
  const [replayResult, setReplayResult] = useState<ReplayResult>();
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
    () => schemas.find((schema) => schema.name === selectedToolName) ?? schemas[0],
    [schemas, selectedToolName],
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
        ],
      });

      setSchemas(compiled);
      setSelectedToolName("queryOrders");
      addAgentMessage({
        type: "compile_succeeded",
        schema: compiled[0],
        warnings: [],
        source: "demo",
      });
      addAudit({
        type: "learned_tool",
        toolName: "queryOrders",
        risk: "read",
        message: "Learned queryOrders from Acme ERP",
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
        message: error instanceof Error ? error.message : "Learning failed",
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

    try {
      const summary = await collectActivePageSummary();
      setPageSummary(summary);
      addAgentMessage({ type: "compile_started", summary });
      const pageSchemas = loadPageSchemas(summary);
      setSchemas(pageSchemas);

      const candidate = compileWebsiteIntent(websiteIntent, summary);
      setCandidateTool(candidate);
      setSelectedToolName(candidate.schema.name);
      addAgentMessage({
        type: "compile_succeeded",
        schema: candidate.schema,
        warnings: candidate.warnings,
        summary,
        source: "website",
      });
      addAudit({
        type: "learned_tool",
        toolName: candidate.schema.name,
        risk: candidate.schema.risk,
        message: `Suggested ${candidate.schema.name} from website intent`,
        llmCalls: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Website learning failed";
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
    if (!candidateTool || !pageSummary) {
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

  return (
    <main className={isExtension ? "extension-app-shell" : "app-shell"}>
      {!isExtension && <DemoErp />}
      <div className={isExtension ? "extension-panel-stack" : undefined}>
        {isExtension && (
          <ExtensionInspector
            advancedOpen={advancedOpen}
            agentMessages={agentMessages}
            capturedSteps={capturedSteps}
            candidateSchema={candidateTool?.schema}
            candidateWarnings={candidateTool?.warnings ?? []}
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
            onStartCapture={handleStartCapture}
            onStopCapture={handleStopCapture}
            onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
          />
        )}
        <GraftPanel
          agentMessages={agentMessages}
          auditEvents={auditEvents}
          command={command}
          isExtension={isExtension}
          isLearning={isLearning}
          isRunning={isRunning}
          pendingApproval={pendingApproval}
          replayResult={replayResult}
          replayTrace={replayTrace}
          schemas={schemas}
          selectedSchema={selectedSchema}
          toolParams={toolParams}
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
