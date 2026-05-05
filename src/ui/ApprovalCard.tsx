import { approvalDescription, riskLabel } from "../graft/guardEngine";
import { schemaSignature } from "../graft/schemaCompiler";
import type { ToolSchema } from "../graft/schemaTypes";

type Props = {
  schema: ToolSchema;
  onAllow: () => void;
  onDeny: () => void;
};

export function ApprovalCard({ schema, onAllow, onDeny }: Props) {
  return (
    <div className={`approval-card approval-${schema.risk}`}>
      <div className="approval-eyebrow">Approval required</div>
      <h3>Graft Guard wants to run:</h3>
      <code>{schemaSignature(schema)}</code>
      <p>
        <strong>Risk:</strong> {riskLabel(schema.risk)}
      </p>
      <p>{approvalDescription(schema)}</p>
      <div className="approval-actions">
        <button type="button" className="primary-button" onClick={onAllow}>
          Allow once
        </button>
        <button type="button" className="secondary-button" onClick={onDeny}>
          Deny
        </button>
      </div>
    </div>
  );
}
