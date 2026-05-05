import { useState } from "react";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";

type Props = {
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

export function AgentMessage({ message }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(message.detail);

  return (
    <article className={`agent-message agent-message-${message.phase}`}>
      <div className="agent-message-icon" aria-hidden="true">
        {iconLabels[message.icon]}
      </div>
      <div className="agent-message-body">
        <div className="agent-message-meta">
          <span>{message.phase === "replay" ? "Local replay" : message.phase === "compile" ? "AI-assisted" : "Agent"}</span>
          <time>{new Date(message.timestamp).toLocaleTimeString()}</time>
        </div>
        <p>{message.text}</p>
        {hasDetail && (
          <button type="button" className="agent-detail-toggle" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "Hide detail" : "Show detail"}
          </button>
        )}
        {expanded && message.detail && <div className="agent-message-detail">{message.detail}</div>}
      </div>
    </article>
  );
}
