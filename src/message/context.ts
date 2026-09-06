import { createContext, useContext, useSyncExternalStore } from "react";
import type { createServices } from "./services";
export const MessagesContext = createContext<ReturnType<typeof createServices> | null>(null);
export function useMessagesServices() {
  const services = useContext(MessagesContext);
  if (!services) throw new Error("Messages requires MessageSession.");
  return services;
}
export function useMessagesSnapshot() {
  const { resource } = useMessagesServices();
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot);
}
