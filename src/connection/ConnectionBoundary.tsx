import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LockKeyhole } from "lucide-react";
import { sessionApi } from "./api";
import { sessionPersistence } from "./persistence";
import { createSessionConnection } from "./session";

const AccessInput = z.object({ identity: z.string().trim().min(1, "Enter your Jolt identity.") });
function AccessForm({
  identity,
  request
}: {
  identity: string;
  request(identity: string): Promise<void>;
}) {
  const form = useForm({ resolver: zodResolver(AccessInput), defaultValues: { identity } });
  return (
    <form onSubmit={form.handleSubmit((value) => request(value.identity))}>
      <label htmlFor="identity">Your Jolt identity</label>
      <input id="identity" autoComplete="off" {...form.register("identity")} />
      <p role="alert">{form.formState.errors.identity?.message}</p>
      <button className="primary-button" disabled={form.formState.isSubmitting}>
        Connect to Jolt
      </button>
    </form>
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
          <AccessForm key={state.identity} identity={state.identity} request={connection.request} />
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
        <small>Jolt must be running on this device.</small>
      </section>
    </main>
  );
}
