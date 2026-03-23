import * as React from "react"
import { cn } from "@/lib/utils"

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border border-slate-300 bg-white text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
          className
        )}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"
