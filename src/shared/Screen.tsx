import type { ReactNode } from "react";
export function Screen({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="feature-page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="page-actions">{actions}</div>
      </header>
      <div className="page-content">{children}</div>
    </main>
  );
}
