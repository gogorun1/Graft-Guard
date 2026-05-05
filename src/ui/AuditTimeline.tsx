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
          <small>LLM calls: {event.llmCalls}</small>
        </li>
      ))}
    </ol>
  );
}
