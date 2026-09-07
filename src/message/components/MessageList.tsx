import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { ConversationMessage } from "../model";
import { useMessagesServices } from "../context";
import { MessageImage } from "./MessageImage";

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return "Today";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function MessageBubble({ item }: { item: ConversationMessage }) {
  const { gateway } = useMessagesServices();
  const { message, direction } = item;
  let status = "Received";
  if (direction === "sent") status = gateway.confirmed.has(message.id) ? "Sent" : "Outgoing copy";
  return (
    <article className={`message-item ${direction}`} aria-label={`${status} message`}>
      <div className="message-bubble">
        {message.attachments?.map((attachment) => (
          <MessageImage key={attachment.id} attachment={attachment} />
        ))}
        {message.body && <p>{message.body}</p>}
      </div>
      <div className="message-meta">
        <span title="Outgoing copies from previous sessions do not prove delivery.">{status}</span>
        <span>·</span>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
          })}
        </time>
      </div>
    </article>
  );
}
export function MessageList({ messages }: { messages: ConversationMessage[] }) {
  const [limit, setLimit] = useState(100);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const last = messages[messages.length - 1]?.message.id;
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (previousHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else if (nearBottom.current) element.scrollTop = element.scrollHeight;
  }, [last, limit]);
  const visible = messages.slice(-limit);
  return (
    <div
      className="message-history"
      ref={scroll}
      tabIndex={0}
      aria-label="Message history"
      onScroll={(event) => {
        const el = event.currentTarget;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      }}
    >
      {messages.length > limit && (
        <button
          className="earlier-button"
          onClick={() => {
            previousHeight.current = scroll.current?.scrollHeight ?? null;
            setLimit((value) => value + 100);
          }}
        >
          Show earlier messages
        </button>
      )}
      {visible.map((item, index) => (
        <Fragment key={item.message.id}>
          {(index === 0 ||
            dayLabel(visible[index - 1].message.createdAt) !==
              dayLabel(item.message.createdAt)) && (
            <div className="message-day">{dayLabel(item.message.createdAt)}</div>
          )}
          <MessageBubble item={item} />
        </Fragment>
      ))}
      {messages.length === 0 && (
        <div className="conversation-beginning">
          <h2>Say a little hello.</h2>
          <p>This is the beginning of your conversation.</p>
        </div>
      )}
    </div>
  );
}
