import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionBoundary } from "../connection";
import { MessageSession, MessagesPage, createMessagesGateway } from "../message";
import { PeopleRoute } from "./PeopleRoute";
import { AppShell } from "./AppShell";
import {
  AccountIdentity,
  createAccountProfile,
  createProfilesGateway,
  ProfilePage
} from "../profile";

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
  const [profile] = useState(() => createAccountProfile(identity, token));
  const [profiles] = useState(() => createProfilesGateway(identity, token));
  const [profileVersion, refreshProfile] = useState(0);
  return (
    <AppShell
      account={<AccountIdentity key={profileVersion} identity={identity} profile={profile} />}
      disconnect={disconnect}
    >
      <MessageSession gateway={gateway}>
        <Routes>
          <Route path="/people" element={<PeopleRoute identity={identity} profiles={profiles} />} />
          <Route
            path="/profile/:identity?"
            element={
              <ProfilePage
                identity={identity}
                gateway={profiles}
                onSaved={() => refreshProfile((value) => value + 1)}
              />
            }
          />
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
