import React from "react";
import ReactDOM from "react-dom/client";
import MessagesPreview from "./MessagesPreview";
import { ErrorBoundary } from "../common/ErrorBoundary";
import "../app/styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MessagesPreview />
    </ErrorBoundary>
  </React.StrictMode>
);
