import { schemaSignature } from "../graft/schemaCompiler";
import type { ToolSchema } from "../graft/schemaTypes";

type Props = {
  schema?: ToolSchema;
};

export function SchemaViewer({ schema }: Props) {
  if (!schema) {
    return <div className="empty-state">No compiled schema yet.</div>;
  }

  return (
    <div className="schema-viewer">
      <code>{schemaSignature(schema)}</code>
      <pre>{JSON.stringify(schema, null, 2)}</pre>
    </div>
  );
}
