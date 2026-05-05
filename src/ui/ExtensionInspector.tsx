import type { CapturedStep, PageDomSummary } from "../extension/pageSummary";
import { schemaSignature } from "../graft/schemaCompiler";
import type { ToolSchema } from "../graft/schemaTypes";

type Props = {
  capturedSteps: CapturedStep[];
  candidateSchema?: ToolSchema;
  candidateWarnings: string[];
  error?: string;
  isCapturing: boolean;
  isExtension: boolean;
  isInspecting: boolean;
  summary?: PageDomSummary;
  onGenerateSchema: () => void;
  onInspect: () => void;
  onSaveSchema: () => void;
  onStartCapture: () => void;
  onStopCapture: () => void;
};

export function ExtensionInspector({
  capturedSteps,
  candidateSchema,
  candidateWarnings,
  error,
  isCapturing,
  isExtension,
  isInspecting,
  summary,
  onGenerateSchema,
  onInspect,
  onSaveSchema,
  onStartCapture,
  onStopCapture,
}: Props) {
  return (
    <section className="extension-inspector" aria-label="Active page inspector">
      <div className="section-heading">
        <h3>Active page</h3>
        <span>{isExtension ? "extension bridge" : "standalone demo"}</span>
      </div>

      <div className="extension-actions">
        <button type="button" className="primary-button" onClick={onInspect} disabled={!isExtension || isInspecting}>
          {isInspecting ? "Inspecting..." : "Inspect active page"}
        </button>
        {!isCapturing ? (
          <button type="button" className="secondary-button" onClick={onStartCapture} disabled={!isExtension}>
            Start capture
          </button>
        ) : (
          <button type="button" className="secondary-button active-capture" onClick={onStopCapture}>
            Stop capture
          </button>
        )}
      </div>

      {!isExtension && (
        <div className="empty-state">
          Load the built `dist/` folder as an unpacked extension to inspect real pages.
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {summary && (
        <div className="page-summary">
          <div className="page-summary-title">
            <strong>{summary.title}</strong>
            <span>{summary.origin}</span>
          </div>

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
        </div>
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
          <button type="button" className="primary-button full-width" onClick={onGenerateSchema}>
            Generate schema
          </button>
        </div>
      )}

      {candidateSchema && (
        <div className="candidate-schema">
          <div className="section-heading">
            <h3>Candidate schema</h3>
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
