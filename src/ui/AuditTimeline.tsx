import type { AuditEvent } from "../graft/auditLog";

type Props = {
  events: AuditEvent[];
};

export function AuditTimeline({ events }: Props) {
  if (events.length === 0) {
    return <div className="empty-state">Audit events will appear here.</div>;
  }

  return (
    <ol className="audit-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
          <span>{event.message}</span>
          <small>
            <AuditBadge event={event} />
            LLM calls: {event.llmCalls}
          </small>
        </li>
      ))}
    </ol>
  );
}

function AuditBadge({ event }: { event: AuditEvent }) {
  const badge = auditBadge(event);
  return <b className={`audit-badge audit-badge-${badge.kind}`}>{badge.label}</b>;
}

function auditBadge(event: AuditEvent): { kind: "ai" | "local"; label: string } {
  if (event.llmCalls > 0) {
    return { kind: "ai", label: "AI" };
  }

  if (event.type === "learned_tool" && !/cached|saved/i.test(event.message)) {
    return { kind: "ai", label: "AI" };
  }

  return { kind: "local", label: "Local" };
}
