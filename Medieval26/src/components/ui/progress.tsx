import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "default" | "good" | "mid" | "low" | "gold" | "gradient";
}

const variantStyles: Record<string, string> = {
  default: "bg-gold-dim",
  good: "bg-stat-good",
  mid: "bg-stat-mid",
  low: "bg-stat-low",
  gold: "bg-gradient-to-r from-gold-accent to-gold-shine",
  gradient: "bg-gradient-to-r from-stat-good via-gold-accent to-stat-low",
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, variant = "default", ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div
        ref={ref}
        className={cn(
          "h-2 w-full overflow-hidden rounded-full bg-bg-deep/60",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            variantStyles[variant]
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
