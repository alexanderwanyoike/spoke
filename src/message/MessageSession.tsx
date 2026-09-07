import { useEffect, useState, type ReactNode } from "react";
import type { MessagesGateway } from "./gateway";
import { MessagesContext } from "./context";
import { createServices } from "./services";

export function MessageSession({
  gateway,
  children
}: {
  gateway: MessagesGateway;
  children: ReactNode;
}) {
  const [services] = useState(() => createServices(gateway));
  useEffect(() => {
    services.start();
    return () => {
      services.stop();
      services.drafts.dispose();
    };
  }, [services]);
  return <MessagesContext.Provider value={services}>{children}</MessagesContext.Provider>;
}
