import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionBoundary } from "../connection";
import { MessageSession, MessagesPage, createMessagesGateway } from "../message";
import { AppShell } from "./AppShell";

function ConnectedApp({
  identity,
  token,
  disconnect
}: {
  identity: string;
  token: string;
  disconnect(): void;
}) {
  const [gateway] = useState(() => createMessagesGateway(identity, token));
  return (
    <AppShell identity={identity} disconnect={disconnect}>
      <MessageSession gateway={gateway}>
        <Routes>
          <Route path="/messages/:conversationId?" element={<MessagesPage />} />
          <Route path="*" element={<Navigate to="/messages" replace />} />
        </Routes>
      </MessageSession>
    </AppShell>
  );
}
export default function App() {
  return (
    <HashRouter>
      <ConnectionBoundary>
        {(session) => <ConnectedApp key={`${session.identity}:${session.token}`} {...session} />}
      </ConnectionBoundary>
    </HashRouter>
  );
}
