import { useEffect, useState } from "react";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";
import { AgentMessage } from "./AgentMessage";

type Props = {
  messages: AgentMessageModel[];
};

export function AgentMessageStream({ messages }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const latestMessage = messages[0];
  const earlierMessages = messages.slice(1);

  useEffect(() => {
    setHistoryOpen(false);
  }, [latestMessage?.id]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <section className={`agent-stream ${historyOpen ? "agent-stream-expanded" : "agent-stream-collapsed"}`} aria-label="Agent activity">
      <div className="agent-stream-heading">
        <span>{latestMessage.phase === "compile" ? "Agent thinking" : latestMessage.phase === "replay" ? "Agent replaying" : "Agent"}</span>
        {earlierMessages.length > 0 && (
          <button type="button" className="agent-earlier-button" onClick={() => setHistoryOpen((current) => !current)}>
            {historyOpen ? "Collapse" : `History ${earlierMessages.length}`}
          </button>
        )}
      </div>
      <div className="agent-stream-list">
        <AgentMessage key={latestMessage.id} message={latestMessage} />
        {historyOpen && (
          <div className="agent-history-list">
            {earlierMessages.map((message) => (
              <AgentMessage key={message.id} message={message} compact />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
