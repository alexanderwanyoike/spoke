import { useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../app/AppShell";
import { MessageSession, MessagesPage, type MessagesGateway } from "../message";
import { conversationViews } from "../message/view-model";
import {
  conversationsFromMessages,
  conversationIdForParticipants,
  type ConversationMessage
} from "../message/model";
import walk from "./walk.svg?raw";

const identity = "alex.jolt";
const contacts = [
  { identity: "maya.jolt", displayName: "Maya Chen", relationship: "accepted" as const },
  { identity: "jamie.jolt", displayName: "Jamie Okafor", relationship: "accepted" as const },
  { identity: "sam.jolt", displayName: "Sam Wilson", relationship: "accepted" as const }
];
function message(
  id: string,
  sender: string,
  recipient: string,
  body: string,
  minute: number
): ConversationMessage {
  return {
    direction: sender === identity ? "sent" : "received",
    message: {
      schema: "spoke.message.v2",
      id,
      sender,
      recipients: [recipient],
      body,
      conversationId: conversationIdForParticipants([sender, recipient]),
      createdAt: `2026-09-06T14:${minute}:00.000Z`
    }
  };
}
function previewGateway() {
  const messages = [
    message(
      "m1",
      "maya.jolt",
      identity,
      "Did you get a chance to try the little bookshop on the corner?",
      21
    ),
    message(
      "m2",
      identity,
      "maya.jolt",
      "I did. Came home with two books and a long list for next time.",
      24
    ),
    message("m3", "maya.jolt", identity, "That sounds about right. An afternoon well spent.", 26),
    message("m4", "maya.jolt", identity, "Took the long way home, too.", 28),
    message("j1", "jamie.jolt", identity, "Thanks for the recommendation!", 12)
  ];
  messages[3].message.attachments = [
    {
      id: "walk",
      kind: "image",
      contentId: "walk",
      mimeType: "image/png",
      size: 1200,
      encrypted: true,
      alt: "A quiet path through the hills"
    }
  ];
  const blobs = new Map<string, Blob>([["walk", new Blob([walk], { type: "image/svg+xml" })]]);
  const confirmed = new Set(["m2"]);
  let offline = false;
  const gateway: MessagesGateway = {
    confirmed,
    async load() {
      if (offline) throw new Error("Jolt is unavailable.");
      return {
        conversations: conversationViews(identity, contacts, conversationsFromMessages(messages)),
        pendingCount: 0
      };
    },
    async send(recipient, draft) {
      if (offline) throw new Error("Message was not sent. Try again when Jolt is available.");
      const item = message(draft.id, identity, recipient, draft.body, 35);
      item.message.createdAt = new Date().toISOString();
      item.message.attachments = draft.images.map((image) => {
        blobs.set(image.id, image.file);
        return {
          id: image.id,
          kind: "image",
          contentId: image.id,
          mimeType: image.mimeType,
          size: image.file.size,
          alt: image.alt,
          encrypted: true
        };
      });
      messages.push(item);
      confirmed.add(draft.id);
    },
    async loadImage(attachment) {
      if (offline) throw new Error("Image unavailable while offline.");
      const blob = blobs.get(attachment.contentId);
      if (!blob) throw new Error("Image is unavailable.");
      return blob;
    }
  };
  return {
    gateway,
    setOffline(value: boolean) {
      offline = value;
    }
  };
}
export default function MessagesPreview() {
  const [preview] = useState(previewGateway);
  const [offline, setOffline] = useState(false);
  return (
    <>
      <div className="preview-toolbar">
        <span>Development preview · Fictional data · No real messages</span>
        <label>
          <input
            type="checkbox"
            checked={offline}
            onChange={(event) => {
              setOffline(event.target.checked);
              preview.setOffline(event.target.checked);
            }}
          />{" "}
          Simulate offline
        </label>
      </div>
      <HashRouter>
        <AppShell identity={identity} disconnect={() => location.reload()}>
          <MessageSession gateway={preview.gateway}>
            <Routes>
              <Route path="/messages/:conversationId?" element={<MessagesPage />} />
              <Route path="*" element={<MessagesPage />} />
            </Routes>
          </MessageSession>
        </AppShell>
      </HashRouter>
    </>
  );
}
