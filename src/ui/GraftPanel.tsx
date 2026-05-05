import { AuditTimeline } from "./AuditTimeline";
import { ApprovalCard } from "./ApprovalCard";
import { SchemaViewer } from "./SchemaViewer";
import { schemaSignature } from "../graft/schemaCompiler";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";
import type { AuditEvent } from "../graft/auditLog";
import type { ReplayResult, ReplayTrace, ToolSchema } from "../graft/schemaTypes";
import { AgentMessageStream } from "./AgentMessageStream";

type PendingApproval = {
  schema: ToolSchema;
  params: Record<string, unknown>;
};

type Props = {
  agentMessages: AgentMessageModel[];
  auditEvents: AuditEvent[];
  command: string;
  isExtension: boolean;
  isLearning: boolean;
  isRunning: boolean;
  pendingApproval?: PendingApproval;
  replayResult?: ReplayResult;
  replayTrace: ReplayTrace[];
  schemas: ToolSchema[];
  selectedSchema?: ToolSchema;
  toolParams: Record<string, string>;
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
  isExtension,
  isLearning,
  isRunning,
  pendingApproval,
  replayResult,
  replayTrace,
  schemas,
  selectedSchema,
  toolParams,
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
  return (
    <aside className="graft-panel" aria-label="Graft Guard panel">
      <header className="panel-header">
        <div>
          <p>Graft Guard</p>
          <h2>Typed tools from legacy UI</h2>
        </div>
        <span className="mode-badge">local replay</span>
      </header>

      {!isExtension && (
        <section className="panel-section">
          <div className="section-heading">
            <h3>Learn</h3>
            <span>{schemas.length > 0 ? "cached locally" : "not learned"}</span>
          </div>
          <button type="button" className="primary-button full-width" onClick={onLearn} disabled={isLearning}>
            {isLearning ? "Learning..." : "Learn this app"}
          </button>
        </section>
      )}

      {!isExtension && <AgentMessageStream messages={agentMessages} />}

      <section className="panel-section">
        <div className="section-heading">
          <h3>Learned tools</h3>
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
                <b className="tool-cache-badge">{isExtension ? "Cached tool" : "AI-compiled tool"}</b>
                {schema.risk}
              </small>
            </button>
          ))}
          {schemas.length === 0 && (
            <div className="empty-state">
              {isExtension ? "Learn this website to create a saved tool." : "Click learn to compile tools."}
            </div>
          )}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h3>Schema</h3>
          <span>MCP-compatible</span>
        </div>
        <SchemaViewer schema={selectedSchema} />
      </section>

      {selectedSchema && (
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

      {pendingApproval && (
        <ApprovalCard schema={pendingApproval.schema} onAllow={onAllow} onDeny={onDeny} />
      )}

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
            <span>{replayResult.rows.length} rows extracted from Acme ERP.</span>
          </div>
        )}
      </section>

      <section className="panel-section audit-section">
        <div className="section-heading">
          <h3>Audit timeline</h3>
          <span>{auditEvents.length} events</span>
        </div>
        <AuditTimeline events={auditEvents} />
      </section>
    </aside>
  );
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
