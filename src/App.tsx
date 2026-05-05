import { useMemo, useState } from "react";
import { DemoErp } from "./demo-erp/DemoErp";
import { collectActivePageSummary, isExtensionRuntime } from "./extension/targetPageClient";
import type { PageDomSummary } from "./extension/pageSummary";
import { createAuditEvent, type AuditEvent } from "./graft/auditLog";
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
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval>();
  const [replayTrace, setReplayTrace] = useState<ReplayTrace[]>([]);
  const [replayResult, setReplayResult] = useState<ReplayResult>();
  const [isLearning, setIsLearning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [pageSummary, setPageSummary] = useState<PageDomSummary>();
  const [inspectionError, setInspectionError] = useState<string>();
  const isExtension = isExtensionRuntime();

  const selectedSchema = useMemo(
    () => schemas.find((schema) => schema.name === selectedToolName) ?? schemas[0],
    [schemas, selectedToolName],
  );

  function addAudit(event: Omit<AuditEvent, "id" | "timestamp">) {
    setAuditEvents((current) => [createAuditEvent(event), ...current]);
  }

  async function handleLearn() {
    setIsLearning(true);
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

  async function handleRun() {
    setIsRunning(true);
    const invocation = await parseNaturalLanguageCommand(command);
    const schema = schemas.find((tool) => tool.name === invocation.toolName);
    if (!schema) {
      setIsRunning(false);
      return;
    }

    const params = invocation.params;
    setReplayTrace([]);
    setReplayResult(undefined);
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
        message: "Approval requested for queryOrders",
        llmCalls: 0,
      });
      return;
    }

    void executeReplay(schema, params);
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
      const result = await replayTool(schema, params, (trace) => {
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

      setReplayResult(result);
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
            error={inspectionError}
            isExtension={isExtension}
            isInspecting={isInspecting}
            summary={pageSummary}
            onInspect={handleInspectActivePage}
          />
        )}
        <GraftPanel
          auditEvents={auditEvents}
          command={command}
          isLearning={isLearning}
          isRunning={isRunning}
          pendingApproval={pendingApproval}
          replayResult={replayResult}
          replayTrace={replayTrace}
          schemas={schemas}
          selectedSchema={selectedSchema}
          onAllow={handleAllow}
          onCommandChange={setCommand}
          onDeny={handleDeny}
          onLearn={handleLearn}
          onRun={handleRun}
          onSelectSchema={(schema) => setSelectedToolName(schema.name)}
          onUsePreset={() => setCommand(presetCommand)}
        />
      </div>
    </main>
  );
}
