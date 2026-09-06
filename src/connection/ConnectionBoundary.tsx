import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { sessionApi } from "./api";
import { sessionPersistence } from "./persistence";
import { createSessionConnection } from "./session";

function ConnectToJolt({
  identity,
  request
}: {
  identity: string;
  request(identity: string): Promise<void>;
}) {
  const [requesting, setRequesting] = useState(false);
  async function connect() {
    setRequesting(true);
    try {
      await request(identity);
    } finally {
      setRequesting(false);
    }
  }
  return (
    <div className="connect-to-jolt">
      <div className="detected-identity">
        <span className="privacy-dot" />
        <div>
          <strong>Jolt is ready</strong>
          <span>{identity}</span>
        </div>
      </div>
      <p>Spoke needs your permission to message through Jolt. Approve access in Jolt Console.</p>
      <button className="primary-button" disabled={requesting} onClick={() => void connect()}>
        Connect to Jolt
      </button>
    </div>
  );
}

type Ready = { identity: string; token: string; disconnect(): void };
export function ConnectionBoundary({ children }: { children(session: Ready): ReactNode }) {
  const [connection] = useState(() =>
    createSessionConnection(sessionApi, sessionPersistence(localStorage))
  );
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  useEffect(() => {
    connection.start();
    return connection.stop;
  }, [connection]);
  if (state.kind === "ready")
    return (
      <>
        {state.error && (
          <div className="connection-warning" role="status">
            Connection needs attention: {state.error}
          </div>
        )}
        {children({ ...state, disconnect: connection.disconnect })}
      </>
    );
  return (
    <main className="connection-page">
      <section className="connection-card">
        <div className="wordmark">
          spoke<span>✳</span>
        </div>
        <LockKeyhole className="connection-symbol" size={28} />
        <h1>A little closer.</h1>
        <p>Private conversations, through your own Jolt identity.</p>
        {state.kind === "checking" && <p role="status">Connecting to Jolt…</p>}
        {state.kind === "access" && (
          <ConnectToJolt
            key={state.identity}
            identity={state.identity}
            request={connection.request}
          />
        )}
        {state.kind === "pending" && (
          <div role="status">
            <h2>Approve Spoke in Jolt Console</h2>
            <p>Your request is waiting. This page will open when access is approved.</p>
          </div>
        )}
        {state.error && <p role="alert">{state.error}</p>}
        {state.kind === "error" && (
          <button className="primary-button" onClick={() => void connection.refresh()}>
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
