import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-xl border spoke-border bg-muted/30 p-6 text-center text-sm text-muted-foreground",
        className
      )}
    >
      <div className="max-w-sm">
        {icon ? <div className="mb-3 flex justify-center text-muted-foreground">{icon}</div> : null}
        {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
        <div className={cn(title ? "mt-1" : "")}>{children}</div>
      </div>
    </div>
  );
}
