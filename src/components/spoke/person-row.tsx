import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AvatarRenderer } from "./types";

type PersonRowProps = {
  identity: string;
  displayName: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  renderAvatar: AvatarRenderer;
  onOpen?: () => void;
  onRemove?: () => void;
};

export function PersonRow({
  identity,
  displayName,
  badge,
  badgeVariant = "secondary",
  renderAvatar,
  onOpen,
  onRemove
}: PersonRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border spoke-border bg-background/85 p-3 shadow-sm shadow-foreground/5">
      <Button
        variant="ghost"
        className="size-auto p-0 hover:bg-transparent"
        type="button"
        onClick={onOpen}
        title={`View ${displayName}`}
      >
        {renderAvatar(identity)}
      </Button>
      <div className="min-w-0">
        <strong className="block truncate text-sm">{displayName}</strong>
        <span className="block truncate text-xs text-muted-foreground">{identity}</span>
        {badge ? (
          <Badge className="mt-1" variant={badgeVariant}>
            {badge}
          </Badge>
        ) : null}
      </div>
      {onRemove ? (
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} title="Remove contact">
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
