import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-mono font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "bg-bg-hover/50 text-gold-base border border-border-subtle",
        good: "bg-stat-good/15 text-stat-good border border-stat-good/30",
        mid: "bg-stat-mid/15 text-stat-mid border border-stat-mid/30",
        low: "bg-stat-low/15 text-stat-low border border-stat-low/30",
        gold: "bg-gold-accent/15 text-gold-accent border border-gold-accent/30",
        danger: "bg-danger/20 text-danger-text border border-danger/30",
        info: "bg-info/15 text-info border border-info/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
