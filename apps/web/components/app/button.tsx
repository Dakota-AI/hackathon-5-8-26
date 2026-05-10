import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonStyles = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[6px] font-bold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/40",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:shrink-0"
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-app-accent text-[#050505] hover:bg-white/90 disabled:hover:bg-app-accent",
        outline:
          "border border-app-border bg-transparent text-app-text hover:bg-app-input",
        ghost: "bg-transparent text-app-text hover:bg-app-input",
        destructive:
          "bg-[#7F1D1D] text-app-text hover:bg-[#991b1b] disabled:hover:bg-[#7F1D1D]",
        soft: "bg-app-input text-app-text hover:bg-[#1a1a1a] border border-app-border"
      },
      size: {
        sm: "h-7 px-2.5 text-[12px] [&_svg]:h-3.5 [&_svg]:w-3.5",
        md: "h-8 px-3 text-[12px] [&_svg]:h-3.5 [&_svg]:w-3.5",
        lg: "h-9 px-4 text-[13px] [&_svg]:h-4 [&_svg]:w-4",
        icon: "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
