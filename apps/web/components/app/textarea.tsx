import * as React from "react";
import { cn } from "../../lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full resize-none rounded-[8px] border border-app-border bg-app-input",
        "px-3 py-2.5 text-[13px] leading-[1.45] text-app-text placeholder:text-app-muted",
        "focus-visible:outline-none focus-visible:border-app-text/40 focus-visible:ring-1 focus-visible:ring-app-text/30",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
