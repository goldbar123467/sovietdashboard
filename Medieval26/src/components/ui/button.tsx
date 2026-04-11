import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 cursor-pointer disabled:pointer-events-none disabled:opacity-35 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-gold-accent to-[#b88a18] text-bg-deep font-heading tracking-widest uppercase hover:opacity-90 active:scale-[0.98] shadow-[0_2px_8px_rgba(212,160,32,0.15)]",
        secondary:
          "bg-gradient-to-br from-bg-elevated to-bg-card border border-border-base text-gold-base font-heading tracking-wider uppercase hover:border-gold-accent hover:from-bg-hover hover:to-bg-elevated active:scale-[0.97]",
        ghost:
          "text-gold-dim hover:text-gold-base hover:bg-bg-hover/50",
        danger:
          "bg-gradient-to-br from-danger/30 to-danger/20 border border-danger/50 text-danger-text hover:from-danger/40 hover:to-danger/30",
        outline:
          "border border-border-base text-gold-base bg-transparent hover:bg-bg-hover/30 hover:border-border-strong",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
