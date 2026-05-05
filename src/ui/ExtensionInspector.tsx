import { useState } from "react";
import type { CapturedStep, PageDomSummary } from "../extension/pageSummary";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";
import { schemaSignature } from "../graft/schemaCompiler";
import type { ToolSchema } from "../graft/schemaTypes";

type Props = {
  advancedOpen: boolean;
  agentMessages: AgentMessageModel[];
  capturedSteps: CapturedStep[];
  candidateSchema?: ToolSchema;
  candidateWarnings: string[];
  error?: string;
  intent: string;
  isCapturing: boolean;
  isExtension: boolean;
  isInspecting: boolean;
  isLearningWebsite: boolean;
  summary?: PageDomSummary;
  onIntentChange: (value: string) => void;
  onInspect: () => void;
  onLearnWebsite: () => void;
  onSaveSchema: () => void;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onToggleAdvanced: () => void;
};

export function ExtensionInspector({
  advancedOpen,
  agentMessages,
  capturedSteps,
  candidateSchema,
  candidateWarnings,
  error,
  intent,
  isCapturing,
  isExtension,
  isInspecting,
  isLearningWebsite,
  summary,
  onIntentChange,
  onInspect,
  onLearnWebsite,
  onSaveSchema,
  onStartCapture,
  onStopCapture,
  onToggleAdvanced,
}: Props) {
  const [compileMode, setCompileMode] = useState<"default" | "custom">("default");
  const [customToolOpen, setCustomToolOpen] = useState(false);
  const hasWarnings = candidateWarnings.length > 0;
  const showCustomTool = isCapturing || customToolOpen || hasWarnings || Boolean(error);
  const showAdvancedButton = advancedOpen || hasWarnings || Boolean(error) || Boolean(candidateSchema);
  const compileStatus = isLearningWebsite ? "compiling" : candidateSchema ? "compiled" : "idle";
  const latestMessage = agentMessages[0]?.text;
  const compileStatusText =
    compileStatus === "compiling"
      ? latestMessage ?? "Reading the page and drafting a tool schema."
      : compileStatus === "compiled"
        ? latestMessage ?? "Tool schema is ready to save."
        : "Use the default goal or confirm a custom intent.";

  return (
    <section className="extension-inspector" aria-label="Compile website">
      <header className="plugin-topbar">
        <div>
          <p>Graft Guard</p>
          <h2>Compile website tool</h2>
        </div>
        <button type="button" className="api-plan-button">API plan</button>
      </header>

      <div className="section-heading">
        <h3>Compile website</h3>
        <span>{isExtension ? "workflow compiler" : "standalone demo"}</span>
      </div>

      <div className={`compile-status compile-status-${compileStatus}`}>
        {isLearningWebsite && <span className="loading-dot" aria-hidden="true" />}
        <strong>{compileStatus === "compiling" ? "Compiling" : compileStatus === "compiled" ? "Compiled" : "Ready to compile"}</strong>
        <span>{compileStatusText}</span>
      </div>

      <div className="compile-tabs" role="tablist" aria-label="Compile mode">
        <button
          type="button"
          role="tab"
          aria-selected={compileMode === "default"}
          className={compileMode === "default" ? "selected" : ""}
          onClick={() => setCompileMode("default")}
        >
          Quick compile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={compileMode === "custom"}
          className={compileMode === "custom" ? "selected" : ""}
          onClick={() => setCompileMode("custom")}
        >
          Custom intent
        </button>
      </div>

      {compileMode === "default" ? (
        <button
          type="button"
          className="primary-button full-width"
          onClick={onLearnWebsite}
          disabled={!isExtension || isLearningWebsite}
        >
          {isLearningWebsite ? "Compiling..." : candidateSchema ? "Recompile website" : "Compile website"}
        </button>
      ) : (
        <div className="intent-panel">
          <label className="intent-field">
            Describe what you want to automate
            <textarea value={intent} onChange={(event) => onIntentChange(event.target.value)} />
          </label>
          <button
            type="button"
            className="primary-button full-width"
            onClick={onLearnWebsite}
            disabled={!isExtension || isLearningWebsite || intent.trim().length === 0}
          >
            {isLearningWebsite ? "Compiling..." : "Confirm intent and compile"}
          </button>
        </div>
      )}

      {candidateSchema && (
        <div className="candidate-schema">
          <div className="section-heading">
            <h3>Suggested tool</h3>
            <span>{candidateSchema.risk}</span>
          </div>
          <code>{schemaSignature(candidateSchema)}</code>
          {candidateWarnings.length > 0 && (
            <ul className="warning-list">
              {candidateWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {hasWarnings && (
            <p className="fallback-hint">This suggestion may need a recorded action path.</p>
          )}
          <button type="button" className="primary-button full-width" onClick={onSaveSchema}>
            Save tool
          </button>
        </div>
      )}

      {showAdvancedButton && (
        <div className="fallback-row fallback-row-single">
          <button type="button" className="secondary-button" onClick={onToggleAdvanced}>
            {advancedOpen ? "Hide advanced" : "Advanced"}
          </button>
        </div>
      )}

      {!isExtension && (
        <div className="empty-state">
          Load the built `dist/` folder as an unpacked extension to inspect real pages.
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {!showCustomTool && (
        <button type="button" className="custom-tool-toggle" onClick={() => setCustomToolOpen(true)}>
          Customized tool
        </button>
      )}

      {showCustomTool && (
        <div className="custom-tool-card">
          <div>
            <strong>{isCapturing ? "Recording actions" : "Customized tool"}</strong>
            <span>
              {isCapturing
                ? "Use the website normally: fill the fields, select options, and click the final action. Come back here and click Done when the workflow is complete."
                : "Record the exact actions for pages where automatic compile misses a menu, dynamic field, or custom control."}
            </span>
          </div>
          {!isCapturing ? (
            <button type="button" className="secondary-button" onClick={onStartCapture} disabled={!isExtension}>
              Record actions
            </button>
          ) : (
            <button type="button" className="secondary-button active-capture" onClick={onStopCapture}>
              Done
            </button>
          )}
        </div>
      )}

      {advancedOpen && (
        <div className="page-summary">
          <div className="section-heading">
            <h3>Advanced context</h3>
            <button type="button" className="text-button" onClick={onInspect} disabled={!isExtension || isInspecting}>
              {isInspecting ? "Inspecting..." : "Refresh inspect"}
            </button>
          </div>
          <div className="page-summary-title">
            <strong>{summary?.title ?? "No page inspected yet"}</strong>
            <span>{summary?.origin ?? "Click Compile website or Refresh inspect"}</span>
          </div>

          {summary && (
            <>
              <dl>
                <div>
                  <dt>Fingerprint</dt>
                  <dd>{summary.fingerprint}</dd>
                </div>
                <div>
                  <dt>Forms</dt>
                  <dd>{summary.forms.length}</dd>
                </div>
                <div>
                  <dt>Inputs</dt>
                  <dd>{summary.inputs.length}</dd>
                </div>
                <div>
                  <dt>Buttons</dt>
                  <dd>{summary.buttons.length}</dd>
                </div>
                <div>
                  <dt>Tables</dt>
                  <dd>{summary.tables.length}</dd>
                </div>
              </dl>

              <SummaryList title="Inputs" items={summary.inputs.map((input) => input.label || input.name || input.selector)} />
              <SummaryList title="Buttons" items={summary.buttons.map((button) => button.text || button.selector)} />
              <SummaryList title="Tables" items={summary.tables.map((table) => table.headers.join(", ") || table.selector)} />
            </>
          )}

          {capturedSteps.length > 0 && (
            <div className="capture-summary">
              <div className="section-heading">
                <h3>Captured workflow</h3>
                <span>{capturedSteps.length} steps</span>
              </div>
              <ol>
                {capturedSteps.map((step, index) => (
                  <li key={`${step.type}-${step.selector}-${index}`}>
                    {step.type === "setValue" ? (
                      <>
                        <strong>Set</strong> {step.label || step.selector}
                        <small>{step.valuePreview || "(empty)"}</small>
                      </>
                    ) : (
                      <>
                        <strong>Click</strong> {step.label || step.selector}
                        <small>{step.selector}</small>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="summary-list">
      <h4>{title}</h4>
      <ul>
        {items.slice(0, 8).map((item, index) => (
          <li key={`${title}-${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
