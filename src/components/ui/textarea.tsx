import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border spoke-border-interactive bg-muted/45 px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground spoke-border-focus focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive/70 aria-invalid:ring-1 aria-invalid:ring-destructive/25 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:ring-destructive/35",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
