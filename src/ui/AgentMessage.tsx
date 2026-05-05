import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";

type Props = {
  compact?: boolean;
  message: AgentMessageModel;
};

export function AgentMessage({ compact = false, message }: Props) {
  return (
    <article className={`agent-message agent-message-${message.phase} ${compact ? "agent-message-compact" : ""}`}>
      <div className="agent-message-body">
        <p>{message.text}</p>
        {!compact && message.detail && <small>{message.detail}</small>}
      </div>
    </article>
  );
}
