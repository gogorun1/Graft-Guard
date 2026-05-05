import { AuditTimeline } from "./AuditTimeline";
import { ApprovalCard } from "./ApprovalCard";
import { SchemaViewer } from "./SchemaViewer";
import { schemaSignature } from "../graft/schemaCompiler";
import type { AuditEvent } from "../graft/auditLog";
import type { ReplayResult, ReplayTrace, ToolSchema } from "../graft/schemaTypes";

type PendingApproval = {
  schema: ToolSchema;
  params: Record<string, unknown>;
};

type Props = {
  auditEvents: AuditEvent[];
  command: string;
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
  auditEvents,
  command,
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

      <section className="panel-section">
        <div className="section-heading">
          <h3>Learn</h3>
          <span>{schemas.length > 0 ? "cached locally" : "not learned"}</span>
        </div>
        <button type="button" className="primary-button full-width" onClick={onLearn} disabled={isLearning}>
          {isLearning ? "Learning..." : "Learn this app"}
        </button>
      </section>

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
              <small>{schema.risk}</small>
            </button>
          ))}
          {schemas.length === 0 && <div className="empty-state">Click learn to compile tools.</div>}
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
                {name}
                <input
                  type={inputTypeForProperty(selectedSchema.inputSchema.properties[name])}
                  value={toolParams[name] ?? ""}
                  onChange={(event) => onToolParamChange(name, event.target.value)}
                />
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
  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    property.type === "number"
  ) {
    return "number";
  }

  return "text";
}
