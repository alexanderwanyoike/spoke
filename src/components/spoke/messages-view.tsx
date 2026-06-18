import type { ChangeEvent, KeyboardEvent } from "react";
import { ArrowLeft, ImagePlus, MessageCircle, RefreshCw, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Contact } from "@/feed";
import { messagePreview, type ConversationMessage } from "@/message";
import type { SpokeMessageAttachment } from "@/media";
import { AttachmentDraftRow } from "./attachment-draft-row";
import { EmptyState } from "./empty-state";
import { MediaFrame } from "./media-frame";
import type { AvatarRenderer, MessageThread, PendingImageAttachment } from "./types";

type MessagesViewProps = {
  messageThreads: MessageThread[];
  visibleMessageThreads: MessageThread[];
  activeThread: MessageThread | null;
  activeThreadMessages: ConversationMessage[];
  threadSearch: string;
  messageDrafts: Record<string, string>;
  messageAttachments: Record<string, PendingImageAttachment[]>;
  messageAttachmentUrls: Record<string, string>;
  messageAttachmentErrors: Record<string, string>;
  busy: string;
  renderAvatar: AvatarRenderer;
  displayNameForIdentity: (identity: string) => string;
  formatBytes: (bytes: number) => string;
  messageAttachmentKey: (messageId: string, attachment: SpokeMessageAttachment) => string;
  onThreadSearchChange: (value: string) => void;
  onSelectThread: (threadId: string) => void;
  onRefreshIncoming: () => void;
  onBackToFeed: () => void;
  onOpenProfile: (identity: string) => void;
  onMessageDraftChange: (identity: string, value: string) => void;
  onMessageKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>, contact: Contact) => void;
  onAddMessageAttachments: (identity: string, event: ChangeEvent<HTMLInputElement>) => void;
  onSendMessage: (contact: Contact) => void;
  onUpdateMessageAttachmentAlt: (identity: string, attachmentId: string, alt: string) => void;
  onRemoveMessageAttachment: (identity: string, attachmentId: string) => void;
  onMessageImageFailed: (key: string) => void;
};

export function MessagesView({
  messageThreads,
  visibleMessageThreads,
  activeThread,
  activeThreadMessages,
  threadSearch,
  messageDrafts,
  messageAttachments,
  messageAttachmentUrls,
  messageAttachmentErrors,
  busy,
  renderAvatar,
  displayNameForIdentity,
  formatBytes,
  messageAttachmentKey,
  onThreadSearchChange,
  onSelectThread,
  onRefreshIncoming,
  onBackToFeed,
  onOpenProfile,
  onMessageDraftChange,
  onMessageKeyDown,
  onAddMessageAttachments,
  onSendMessage,
  onUpdateMessageAttachmentAlt,
  onRemoveMessageAttachment,
  onMessageImageFailed
}: MessagesViewProps) {
  return (
    <section className="grid min-h-[calc(100vh-11rem)] overflow-hidden rounded-xl border spoke-border bg-card shadow-sm shadow-foreground/5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="border-b spoke-border bg-muted/20 lg:border-b-0 lg:border-r" aria-label="Conversations">
        <div className="space-y-3 border-b spoke-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Messages</h2>
              <p className="text-sm text-muted-foreground">{messageThreads.length} conversation threads</p>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={onRefreshIncoming} disabled={busy === "incoming"} title="Refresh incoming">
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={threadSearch}
              onChange={(event) => onThreadSearchChange(event.target.value)}
              placeholder="Search threads"
            />
          </div>
        </div>

        <ScrollArea className="h-[280px] lg:h-[calc(100vh-18rem)]">
          <div className="grid gap-1 p-2">
            {visibleMessageThreads.map((thread) => {
              const lastMessage = thread.conversation?.messages[
                thread.conversation.messages.length - 1
              ];
              return (
                <Button
                  type="button"
                  variant={activeThread?.id === thread.id ? "secondary" : "ghost"}
                  className={cn(
                    "h-auto justify-start gap-3 rounded-lg p-3 text-left",
                    activeThread?.id === thread.id ? "border spoke-border bg-background shadow-sm" : ""
                  )}
                  key={thread.id}
                  onClick={() => onSelectThread(thread.id)}
                >
                  {renderAvatar(thread.contact.identity)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{thread.contact.displayName}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {lastMessage
                        ? messagePreview(lastMessage.message)
                        : `Start a private thread with ${thread.contact.displayName}`}
                    </span>
                  </span>
                  {thread.lastMessageAt ? (
                    <time className="text-xs text-muted-foreground">
                      {new Date(thread.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  ) : null}
                </Button>
              );
            })}
            {visibleMessageThreads.length === 0 ? (
              <EmptyState className="p-4">
                {messageThreads.length === 0 ? "Accept a contact before starting messages." : "No threads match your search."}
              </EmptyState>
            ) : null}
          </div>
        </ScrollArea>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col bg-background/20">
        {activeThread ? (
          <>
            <header className="flex items-center gap-3 border-b spoke-border bg-card/80 p-4 shadow-sm shadow-foreground/5">
              <Button variant="ghost" size="icon" type="button" onClick={onBackToFeed} title="Back to feed">
                <ArrowLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="size-auto p-0 hover:bg-transparent"
                type="button"
                onClick={() => onOpenProfile(activeThread.contact.identity)}
                title={`View ${activeThread.contact.displayName}`}
              >
                {renderAvatar(activeThread.contact.identity, "large")}
              </Button>
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{activeThread.contact.displayName}</h2>
                <p className="truncate text-sm text-muted-foreground">{activeThread.contact.identity}</p>
              </div>
            </header>

            <ScrollArea className="flex-1">
              <div className="mx-auto grid w-full max-w-4xl gap-4 p-5" aria-live="polite">
                {activeThreadMessages.map((item) => (
                  <div className={cn("flex", item.direction === "sent" ? "justify-end" : "justify-start")} key={item.message.id}>
                    <div className={cn("max-w-[min(40rem,82%)] rounded-xl border p-3 shadow-sm shadow-foreground/5", item.direction === "sent" ? "spoke-border-on-primary bg-primary text-primary-foreground" : "spoke-border bg-background")}>
                      <Button
                        variant="ghost"
                        className={cn("mb-2 h-auto gap-2 p-0 hover:bg-transparent", item.direction === "sent" ? "text-primary-foreground hover:text-primary-foreground" : "")}
                        type="button"
                        onClick={() => onOpenProfile(item.message.sender)}
                        title={`View ${displayNameForIdentity(item.message.sender)}`}
                      >
                        {renderAvatar(item.message.sender)}
                        <span className="text-xs font-medium">{displayNameForIdentity(item.message.sender)}</span>
                      </Button>
                      {item.message.body ? <p className="whitespace-pre-wrap text-sm leading-6">{item.message.body}</p> : null}
                      {item.message.attachments?.length ? (
                        <div className="mt-3 grid gap-2">
                          {item.message.attachments.map((attachment) => {
                            const key = messageAttachmentKey(item.message.id, attachment);
                            return (
                              <MediaFrame
                                className="bg-background/85 text-foreground"
                                imageClassName="max-h-72"
                                key={key}
                                src={messageAttachmentUrls[key]}
                                error={messageAttachmentErrors[key]}
                                alt={attachment.alt || "Message image"}
                                caption={attachment.alt}
                                onError={() => onMessageImageFailed(key)}
                              />
                            );
                          })}
                        </div>
                      ) : null}
                      <time className={cn("mt-2 block text-xs", item.direction === "sent" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {new Date(item.message.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </div>
                ))}
                {activeThreadMessages.length === 0 ? (
                  <EmptyState icon={<MessageCircle className="size-8" />} title={activeThread.contact.displayName}>
                    Start the encrypted one-to-one conversation.
                  </EmptyState>
                ) : null}
              </div>
            </ScrollArea>

            <div className="border-t spoke-border bg-card p-4 shadow-[0_-1px_8px_color-mix(in_oklch,var(--foreground),transparent_94%)]">
              <div className="mx-auto grid w-full max-w-4xl gap-3">
                <Textarea
                  className="min-h-16"
                  rows={2}
                  value={messageDrafts[activeThread.contact.identity] || ""}
                  onChange={(event) => onMessageDraftChange(activeThread.contact.identity, event.target.value)}
                  onKeyDown={(event) => onMessageKeyDown(event, activeThread.contact)}
                  placeholder={`Message ${activeThread.contact.displayName}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="icon" title="Attach images">
                      <label>
                        <ImagePlus className="size-4" />
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => onAddMessageAttachments(activeThread.contact.identity, event)}
                        />
                      </label>
                    </Button>
                    <span className="text-xs text-muted-foreground">Images are encrypted with the message thread</span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => onSendMessage(activeThread.contact)}
                    disabled={busy === `message:${activeThread.contact.identity}`}
                    title="Send encrypted message"
                  >
                    <Send className="size-4" />
                    Send
                  </Button>
                </div>
                {(messageAttachments[activeThread.contact.identity] || []).length > 0 ? (
                  <div className="grid gap-2">
                    {(messageAttachments[activeThread.contact.identity] || []).map((attachment) => (
                      <AttachmentDraftRow
                        attachment={attachment}
                        formatBytes={formatBytes}
                        imageClassName="size-16"
                        key={attachment.id}
                        onAltChange={(alt) => onUpdateMessageAttachmentAlt(activeThread.contact.identity, attachment.id, alt)}
                        onRemove={() => onRemoveMessageAttachment(activeThread.contact.identity, attachment.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <EmptyState icon={<MessageCircle className="size-10" />} title="No message threads">
              Accept a contact, then start a private conversation here.
            </EmptyState>
          </div>
        )}
      </section>
    </section>
  );
}
