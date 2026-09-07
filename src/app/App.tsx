import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionBoundary } from "../connection";
import { MessageSession, MessagesPage } from "../message";
import { ProfileRoute } from "./ProfileRoute";
import { PostRoute } from "./PostRoute";
import { createRuntime } from "./runtime";
import { HomeRoute } from "./HomeRoute";
import { PeopleRoute } from "./PeopleRoute";
import { AppShell } from "./AppShell";
import { AccountIdentity } from "../profile";

function ConnectedApp({
  identity,
  token,
  disconnect
}: {
  identity: string;
  token: string;
  disconnect(): void;
}) {
  const [{ home, messages: gateway, profile, profiles, replies }] = useState(() =>
    createRuntime(identity, token)
  );
  const [profileVersion, refreshProfile] = useState(0);
  return (
    <AppShell
      account={<AccountIdentity key={profileVersion} identity={identity} profile={profile} />}
      disconnect={disconnect}
    >
      <MessageSession gateway={gateway}>
        <Routes>
          <Route
            path="/home"
            element={<HomeRoute identity={identity} gateway={home} profiles={profiles} />}
          />
          <Route
            path="/post/:identity/:postId"
            element={
              <PostRoute identity={identity} home={home} replies={replies} profiles={profiles} />
            }
          />
          <Route path="/people" element={<PeopleRoute identity={identity} profiles={profiles} />} />
          <Route
            path="/profile/:identity?"
            element={
              <ProfileRoute
                identity={identity}
                profiles={profiles}
                home={home}
                onSaved={() => refreshProfile((value) => value + 1)}
              />
            }
          />
          <Route path="/messages/:conversationId?" element={<MessagesPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
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
