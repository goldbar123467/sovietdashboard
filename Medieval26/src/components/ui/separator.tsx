import * as React from "react";
import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
  ornate?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ornate = false, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn(
        orientation === "horizontal"
          ? "h-px w-full"
          : "h-full w-px",
        ornate
          ? "bg-gradient-to-r from-transparent via-gold-accent/40 to-transparent"
          : "bg-border-subtle",
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = "Separator";

export { Separator };
