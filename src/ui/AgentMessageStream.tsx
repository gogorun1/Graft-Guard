import { useState } from "react";
import type { AgentMessage as AgentMessageModel } from "../graft/agentNarrator";
import { AgentMessage } from "./AgentMessage";

type Props = {
  messages: AgentMessageModel[];
};

const visibleCount = 3;

export function AgentMessageStream({ messages }: Props) {
  const [showEarlier, setShowEarlier] = useState(false);

  if (messages.length === 0) {
    return null;
  }

  const visibleMessages = showEarlier ? messages : messages.slice(0, visibleCount);
  const earlierCount = Math.max(0, messages.length - visibleCount);

  return (
    <section className="agent-stream" aria-label="Agent activity">
      <div className="agent-stream-heading">
        <span>Agent presence</span>
        {earlierCount > 0 && (
          <button type="button" className="agent-earlier-button" onClick={() => setShowEarlier((current) => !current)}>
            {showEarlier ? "Hide earlier" : `Show ${earlierCount} earlier`}
          </button>
        )}
      </div>
      <div className="agent-stream-list">
        {visibleMessages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}
      </div>
    </section>
  );
}
