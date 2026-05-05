import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";

type Props = {
  compact?: boolean;
  message: AgentMessageModel;
};

export function AgentMessage({ compact = false, message }: Props) {
  return (
    <article className={`agent-message agent-message-${message.phase} ${compact ? "agent-message-compact" : ""}`}>
      <span className={`agent-message-icon agent-message-icon-${message.icon}`} aria-hidden="true">
        {iconLabel(message.icon)}
      </span>
      <div className="agent-message-body">
        {!compact && <b className={`agent-phase-badge agent-phase-badge-${message.phase}`}>{phaseLabel(message.phase)}</b>}
        <p>{message.text}</p>
        {!compact && message.detail && <small>{message.detail}</small>}
      </div>
    </article>
  );
}

function iconLabel(icon: AgentMessageModel["icon"]): string {
  const labels: Record<AgentMessageModel["icon"], string> = {
    search: "S",
    brain: "AI",
    check: "OK",
    warning: "!",
    eye: "REC",
    bolt: "0",
    error: "ERR",
  };

  return labels[icon];
}

function phaseLabel(phase: AgentMessageModel["phase"]): string {
  const labels: Record<AgentMessageModel["phase"], string> = {
    compile: "AI-assisted",
    replay: "Local replay",
    idle: "Ready",
  };

  return labels[phase];
}
