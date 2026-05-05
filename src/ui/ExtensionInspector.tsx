import type { PageDomSummary } from "../extension/pageSummary";

type Props = {
  error?: string;
  isExtension: boolean;
  isInspecting: boolean;
  summary?: PageDomSummary;
  onInspect: () => void;
};

export function ExtensionInspector({ error, isExtension, isInspecting, summary, onInspect }: Props) {
  return (
    <section className="extension-inspector" aria-label="Active page inspector">
      <div className="section-heading">
        <h3>Active page</h3>
        <span>{isExtension ? "extension bridge" : "standalone demo"}</span>
      </div>

      <button type="button" className="primary-button full-width" onClick={onInspect} disabled={!isExtension || isInspecting}>
        {isInspecting ? "Inspecting..." : "Inspect active page"}
      </button>

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
