import { useEffect, useState } from "react";
import { AuditTimeline } from "./AuditTimeline";
import { ApprovalCard } from "./ApprovalCard";
import { SchemaViewer } from "./SchemaViewer";
import { schemaSignature } from "../graft/schemaCompiler";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";
import type { AuditEvent } from "../graft/auditLog";
import type { CompiledToolGroup } from "../graft/agentCompiler";
import type { ReplayResult, ReplayTrace, ToolSchema } from "../graft/schemaTypes";
import type { PaymentPacket, VendorAgentEvent } from "../graft/vendorPaymentAgent";
import { AgentMessageStream } from "./AgentMessageStream";

type PendingApproval = {
  schema: ToolSchema;
  params: Record<string, unknown>;
};

type Props = {
  agentMessages: AgentMessageModel[];
  auditEvents: AuditEvent[];
  command: string;
  compileActivity: string[];
  compiledToolGroup?: CompiledToolGroup;
  isExtension: boolean;
  isCompilingWebsite: boolean;
  isLearning: boolean;
  isRunning: boolean;
  pendingApproval?: PendingApproval;
  paymentPacket?: PaymentPacket;
  replayResult?: ReplayResult;
  replayTrace: ReplayTrace[];
  schemas: ToolSchema[];
  selectedSchema?: ToolSchema;
  toolParams: Record<string, string>;
  vendorAgentEvents: VendorAgentEvent[];
  onAllow: () => void;
  onCommandChange: (value: string) => void;
  onDeny: () => void;
  onLearn: () => void;
  onRun: () => void;
  onRunSelectedTool: () => void;
  onSelectSchema: (schema: ToolSchema) => void;
  onToolParamChange: (name: string, value: string) => void;
  onUsePreset: () => void;
};

export function GraftPanel({
  agentMessages,
  auditEvents,
  command,
  compileActivity,
  compiledToolGroup,
  isExtension,
  isCompilingWebsite,
  isLearning,
  isRunning,
  pendingApproval,
  paymentPacket,
  replayResult,
  replayTrace,
  schemas,
  selectedSchema,
  toolParams,
  vendorAgentEvents,
  onAllow,
  onCommandChange,
  onDeny,
  onLearn,
  onRun,
  onRunSelectedTool,
  onSelectSchema,
  onToolParamChange,
  onUsePreset,
}: Props) {
  const [compiledTab, setCompiledTab] = useState<"workflow" | "tools">("workflow");
  const [compileActivityOpen, setCompileActivityOpen] = useState(false);
  const [compileElapsedSeconds, setCompileElapsedSeconds] = useState(0);
  const showCompiledArea = isCompilingWebsite || compileActivity.length > 0 || Boolean(compiledToolGroup);

  useEffect(() => {
    if (isCompilingWebsite) {
      setCompileActivityOpen(true);
      return;
    }

    if (compiledToolGroup) {
      setCompileActivityOpen(false);
    }
  }, [isCompilingWebsite, compiledToolGroup]);

  useEffect(() => {
    if (!isCompilingWebsite) {
      setCompileElapsedSeconds(0);
      return;
    }

    setCompileElapsedSeconds(0);
    const interval = window.setInterval(() => {
      setCompileElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isCompilingWebsite]);

  return (
    <aside className="graft-panel" aria-label="Graft Guard panel">
      {!isExtension && (
        <header className="panel-header">
          <div>
            <p>Graft Guard</p>
            <h2>Typed tools from legacy UI</h2>
          </div>
          <span className="mode-badge">{isRunning ? "local replay" : schemas.length > 0 ? "cached tools" : "ready"}</span>
        </header>
      )}

      {!isExtension && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Compile</h3>
            <span>{schemas.length > 0 ? "cached locally" : "not compiled"}</span>
          </div>
          <button type="button" className="primary-button full-width" onClick={onLearn} disabled={isLearning}>
            {isLearning ? "Compiling..." : "Compile this app"}
          </button>
        </section>
      )}

      {!isExtension && <AgentMessageStream messages={agentMessages} />}

      {showCompiledArea && (
        <section className="panel-section">
          <div className="section-heading compiled-section-heading">
            <div className="compiled-tabs" role="tablist" aria-label="Compiled output">
              <button
                type="button"
                className={compiledTab === "workflow" ? "active" : ""}
                onClick={() => setCompiledTab("workflow")}
              >
                Compiled workflow
              </button>
              <button
                type="button"
                className={compiledTab === "tools" ? "active" : ""}
                onClick={() => setCompiledTab("tools")}
              >
                Generated tools
              </button>
            </div>
          </div>

          {compiledTab === "workflow" ? (
            <div className="compiled-workflow-card">
              {compileActivity.length > 0 && (
                <details
                  className="compile-activity"
                  open={compileActivityOpen}
                  onToggle={(event) => setCompileActivityOpen(event.currentTarget.open)}
                >
                  <summary>
                    <span>{isCompilingWebsite ? "Agent is compiling" : "Agent compile log"}</span>
                    <small>{compileActivity.length} steps</small>
                  </summary>
                  <ol>
                    {compileActivity.map((event, index) => (
                      <li key={`${event}-${index}`}>{event}</li>
                    ))}
                  </ol>
                </details>
              )}

              {isCompilingWebsite && !compiledToolGroup && (
                <div className="workflow-run-loading compile-loading">
                  <span className="loading-dot" aria-hidden="true" />
                  <span>
                    {compileActivity[compileActivity.length - 1] ?? "Compiling this page into reusable tools."}
                    {compileElapsedSeconds > 0 ? ` (${compileElapsedSeconds}s)` : ""}
                  </span>
                </div>
              )}

              {compiledToolGroup && (
                <>
                  <strong>{compiledToolGroup.name}</strong>
                  <span>{compiledToolGroup.description}</span>
                  <div className="compiled-workflow-group">
                    <h4>{compiledToolGroup.workflowPlan.length} planned steps</h4>
                    <ol className="compiled-step-list">
                      {compiledToolGroup.workflowPlan.map((step, index) => (
                        <li key={`${step.tool}-${index}`}>
                          <span>{step.tool}</span>
                          {step.guard && <b>Guard</b>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}
            </div>
          ) : compiledToolGroup ? (
            <div className="compiled-workflow-card">
              <div className="compiled-workflow-group">
                <h4>{compiledToolGroup.tools.length} typed tools</h4>
                <div className="generated-tool-list">
                  {compiledToolGroup.tools.map((tool) => (
                    <button
                      type="button"
                      key={tool.name}
                      className={selectedSchema?.name === tool.name ? "selected" : ""}
                      onClick={() => onSelectSchema(tool)}
                    >
                      <span>
                        <strong>{tool.name}</strong>
                        <small>{tool.description}</small>
                      </span>
                      <b>{tool.risk}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div className="compiled-tool-pills" aria-label="Reusable tool names">
                {compiledToolGroup.tools.map((tool) => (
                  <span key={tool.name}>{tool.name}</span>
                ))}
              </div>
              {selectedSchema && (
                <div className="generated-tool-schema">
                  <div className="section-heading">
                    <h4>Schema</h4>
                    <span>MCP-compatible</span>
                  </div>
                  <SchemaViewer schema={selectedSchema} />
                </div>
              )}
            </div>
          ) : (
            <div className="compiled-workflow-card">
              <div className="workflow-run-loading compile-loading">
                {isCompilingWebsite && <span className="loading-dot" aria-hidden="true" />}
                <span>Reusable tools will appear here after compile.</span>
              </div>
            </div>
          )}
        </section>
      )}

      {!showCompiledArea && (!isExtension || schemas.length > 0) && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Compiled tools</h3>
            <span>{schemas.length}</span>
          </div>
          <div className="tool-list">
            {schemas.map((schema) => (
              <button
                type="button"
                key={schema.name}
                className={selectedSchema?.name === schema.name ? "selected" : ""}
                onClick={() => onSelectSchema(schema)}
              >
                <span>{schema.name}</span>
                <small>
                  <b className="tool-cache-badge">{isExtension ? "Compiled · Cached" : "Compiled tool"}</b>
                  {schema.risk}
                </small>
              </button>
            ))}
            {schemas.length === 0 && (
              <div className="empty-state">
                {isExtension ? "Compile this website to create a saved tool." : "Click compile to create tools."}
              </div>
            )}
          </div>
        </section>
      )}

      {(isRunning || vendorAgentEvents.length > 0) && compiledToolGroup && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Workflow run</h3>
            <span>{runStatusLabel(isRunning, pendingApproval, vendorAgentEvents.length)}</span>
          </div>
          {isRunning && vendorAgentEvents.length === 0 && (
            <div className="workflow-run-loading">
              <span className="loading-dot" aria-hidden="true" />
              <span>Running the saved workflow against the current page.</span>
            </div>
          )}
          {vendorAgentEvents.length > 0 && (
            <ol className="agent-workflow-list">
              {vendorAgentEvents.map((event, index) => (
                <li key={`${event.type}-${index}`}>
                  <strong>{eventLabel(event.type)}</strong>
                  <span>{event.message}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {(!isExtension || (selectedSchema && !showCompiledArea)) && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Schema</h3>
            <span>MCP-compatible</span>
          </div>
          <SchemaViewer schema={selectedSchema} />
        </section>
      )}

      {selectedSchema && (!isExtension || !showCompiledArea) && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Tool inputs</h3>
            <span>{selectedSchema.risk}</span>
          </div>
          <div className="tool-inputs">
            {(selectedSchema.inputSchema.required ?? []).map((name) => (
              <label key={name}>
                {labelForProperty(name, selectedSchema.inputSchema.properties[name])}
                {isBooleanProperty(selectedSchema.inputSchema.properties[name]) ? (
                  <input
                    type="checkbox"
                    checked={toolParams[name] === "true"}
                    onChange={(event) => onToolParamChange(name, event.target.checked ? "true" : "false")}
                  />
                ) : (
                  <input
                    type={inputTypeForProperty(selectedSchema.inputSchema.properties[name])}
                    min={numberAttribute(selectedSchema.inputSchema.properties[name], "minimum")}
                    max={numberAttribute(selectedSchema.inputSchema.properties[name], "maximum")}
                    step={numberAttribute(selectedSchema.inputSchema.properties[name], "step")}
                    placeholder={placeholderForProperty(selectedSchema.inputSchema.properties[name])}
                    value={toolParams[name] ?? ""}
                    onChange={(event) => onToolParamChange(name, event.target.value)}
                  />
                )}
              </label>
            ))}
            {(selectedSchema.inputSchema.required ?? []).length === 0 && (
              <div className="empty-state">This tool does not require parameters.</div>
            )}
          </div>
          <button
            type="button"
            className="primary-button full-width"
            onClick={onRunSelectedTool}
            disabled={isRunning || schemas.length === 0}
          >
            {isRunning ? "Running..." : "Run saved tool"}
          </button>
        </section>
      )}

      {!isExtension && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Command</h3>
            <span>deterministic parser</span>
          </div>
          <textarea value={command} onChange={(event) => onCommandChange(event.target.value)} />
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onUsePreset}>
              Preset
            </button>
            <button type="button" className="primary-button" onClick={onRun} disabled={isRunning || schemas.length === 0}>
              {isRunning ? "Running..." : "Run tool"}
            </button>
          </div>
        </section>
      )}

      {pendingApproval && !isExtension && (
        <ApprovalCard schema={pendingApproval.schema} onAllow={onAllow} onDeny={onDeny} />
      )}

      {paymentPacket && (
        <section className="panel-section">
          <div className="section-heading packet-heading">
            <div>
              <h3>Payment packet</h3>
              <span>{packetStatusLabel(paymentPacket)}</span>
            </div>
            {paymentPacket.bankDetailsStatus === "included" && (
              <button
                type="button"
                className="secondary-button packet-download-button"
                onClick={() => downloadPaymentPacketCsv(paymentPacket)}
              >
                Download CSV
              </button>
            )}
          </div>
          <div className="payment-packet">
            <div className={`packet-notice packet-notice-${paymentPacket.bankDetailsStatus}`}>
              {paymentPacket.bankDetailsStatus === "included"
                ? "Approval allowed bank details for this packet. The CSV includes bank/account data."
                : "Approval was denied. Bank details are redacted and no bank-data export is available."}
            </div>
            <div className="packet-summary-grid">
              <span>
                <strong>{paymentPacket.invoices.length}</strong>
                invoices
              </span>
              <span>
                <strong>EUR {paymentPacket.totalAmount.toLocaleString("en-US")}</strong>
                total
              </span>
              <span>
                <strong>{paymentPacket.flaggedVendors.length}</strong>
                flagged vendors
              </span>
              <span>
                <strong>{paymentPacket.needsApproval.length}</strong>
                review items
              </span>
            </div>
            <div className="packet-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Vendor</th>
                    <th>Amount</th>
                    <th>Bank details</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentPacket.invoices.map((invoice) => (
                    <tr key={invoice.invoiceId}>
                      <td>{invoice.invoiceId}</td>
                      <td>{invoice.vendorName}</td>
                      <td>EUR {invoice.amount.toLocaleString("en-US")}</td>
                      <td>{invoice.bankDetails}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {(!isExtension || replayTrace.length > 0 || replayResult) && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Replay trace</h3>
            <span>LLM calls: 0</span>
          </div>
          {replayTrace.length === 0 ? (
            <div className="empty-state">Trace appears after approval.</div>
          ) : (
            <ol className="trace-list">
              {replayTrace.map((trace, index) => (
                <li key={`${trace.message}-${index}`}>{trace.message}</li>
              ))}
            </ol>
          )}
          {replayResult && (
            <div className="result-box">
              <strong>{schemaSignature(selectedSchema ?? schemas[0])}</strong>
              <span>
                {replayResult.rows.length} {isExtension ? "records extracted from the current page." : "rows extracted from Acme ERP."}
              </span>
            </div>
          )}
        </section>
      )}

      {(!isExtension || auditEvents.length > 0) && (
        <section className="panel-section audit-section">
          <div className="section-heading">
            <h3>Audit timeline</h3>
            <span>{auditEvents.length} events</span>
          </div>
          <AuditTimeline events={auditEvents} />
        </section>
      )}
    </aside>
  );
}

function eventLabel(type: VendorAgentEvent["type"]): string {
  const labels: Record<VendorAgentEvent["type"], string> = {
    tool_call: "Tool call",
    tool_result: "Result",
    guard_required: "Guard",
    packet_generated: "Packet",
  };
  return labels[type];
}

function runStatusLabel(
  isRunning: boolean,
  pendingApproval: PendingApproval | undefined,
  eventCount: number,
): string {
  if (isRunning) {
    return "running";
  }

  if (pendingApproval?.schema.name === "exportBankDetails") {
    return "approval needed";
  }

  return `${eventCount} events`;
}

function packetStatusLabel(packet: PaymentPacket): string {
  return packet.bankDetailsStatus === "included" ? "bank details included" : "bank details redacted";
}

function downloadPaymentPacketCsv(packet: PaymentPacket): void {
  const rows = [
    ["invoice_id", "vendor_name", "amount_eur", "due_date", "risk_flag", "bank_details"],
    ...packet.invoices.map((invoice) => [
      invoice.invoiceId,
      invoice.vendorName,
      invoice.amount,
      invoice.dueDate,
      invoice.riskFlag,
      invoice.bankDetails,
    ]),
  ];
  const csv = rows.map((row) => row.map(formatCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vendor-payment-packet.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function formatCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function inputTypeForProperty(property: unknown): string {
  if (hasPropertyValue(property, "format", "date")) {
    return "date";
  }

  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "number"
  ) {
    return "number";
  }

  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "boolean"
  ) {
    return "checkbox";
  }

  return "text";
}

function labelForProperty(name: string, property: unknown): string {
  if (property && typeof property === "object" && "title" in property && typeof property.title === "string") {
    return property.title;
  }

  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
}

function placeholderForProperty(property: unknown): string | undefined {
  if (
    property &&
    typeof property === "object" &&
    "placeholder" in property &&
    typeof property.placeholder === "string"
  ) {
    return property.placeholder;
  }

  if (hasPropertyValue(property, "format", "date")) {
    return "YYYY-MM-DD";
  }

  return undefined;
}

function numberAttribute(property: unknown, key: "minimum" | "maximum" | "step"): string | undefined {
  if (property && typeof property === "object" && key in property) {
    const value = (property as Record<string, unknown>)[key];
    return typeof value === "number" ? String(value) : undefined;
  }

  return undefined;
}

function hasPropertyValue(property: unknown, key: string, expected: string): boolean {
  return Boolean(
    property &&
    typeof property === "object" &&
    key in property &&
    (property as Record<string, unknown>)[key] === expected,
  );
}

function isBooleanProperty(property: unknown): boolean {
  return Boolean(
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "boolean",
  );
}
