import { useState } from "react";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";

type Props = {
  compact?: boolean;
  message: AgentMessageModel;
};

const iconLabels: Record<AgentMessageModel["icon"], string> = {
  search: "🔍",
  brain: "🧠",
  check: "✅",
  warning: "⚠️",
  eye: "👀",
  bolt: "⚡",
  error: "❌",
};

export function AgentMessage({ compact = false, message }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(message.detail) && !compact;

  return (
    <article className={`agent-message agent-message-${message.phase} ${compact ? "agent-message-compact" : ""}`}>
      <div className="agent-message-icon" aria-hidden="true">
        {iconLabels[message.icon]}
      </div>
      <div className="agent-message-body">
        <div className="agent-message-meta">
          <span>{message.phase === "replay" ? "Local replay" : message.phase === "compile" ? "AI-assisted" : "Agent"}</span>
          {message.phase === "compile" && !compact && (
            <span className="agent-thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
          <time>{new Date(message.timestamp).toLocaleTimeString()}</time>
        </div>
        <p>{message.text}</p>
        {hasDetail && (
          <button type="button" className="agent-detail-toggle" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "Hide detail" : "Show detail"}
          </button>
        )}
        {!compact && expanded && message.detail && <div className="agent-message-detail">{message.detail}</div>}
      </div>
    </article>
  );
}
