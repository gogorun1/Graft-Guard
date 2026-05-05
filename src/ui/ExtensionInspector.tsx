import type { CapturedStep, PageDomSummary } from "../extension/pageSummary";
import { schemaSignature } from "../graft/schemaCompiler";
import type { ToolSchema } from "../graft/schemaTypes";

type Props = {
  advancedOpen: boolean;
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
  return (
    <section className="extension-inspector" aria-label="Learn website">
      <div className="section-heading">
        <h3>Learn website</h3>
        <span>{isExtension ? "AI-assisted compile" : "standalone demo"}</span>
      </div>

      <label className="intent-field">
        Describe what you want to automate
        <textarea value={intent} onChange={(event) => onIntentChange(event.target.value)} />
      </label>

      <button
        type="button"
        className="primary-button full-width"
        onClick={onLearnWebsite}
        disabled={!isExtension || isLearningWebsite}
      >
        {isLearningWebsite ? "Learning..." : "Learn website"}
      </button>

      <div className="fallback-row">
        {!isCapturing ? (
          <button type="button" className="secondary-button" onClick={onStartCapture} disabled={!isExtension}>
            Show me once
          </button>
        ) : (
          <button type="button" className="secondary-button active-capture" onClick={onStopCapture}>
            Stop and suggest tool
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onToggleAdvanced}>
          {advancedOpen ? "Hide advanced" : "Advanced"}
        </button>
      </div>

      {!isExtension && (
        <div className="empty-state">
          Load the built `dist/` folder as an unpacked extension to inspect real pages.
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {summary && (
        <div className="learned-page-chip">
          <strong>{summary.title}</strong>
          <span>{summary.origin}</span>
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
          <button type="button" className="primary-button full-width" onClick={onSaveSchema}>
            Save tool
          </button>
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
            <span>{summary?.origin ?? "Click Learn website or Refresh inspect"}</span>
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
