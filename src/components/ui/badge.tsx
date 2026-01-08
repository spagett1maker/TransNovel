import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none transition-all duration-200 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        destructive:
          "border-transparent bg-status-error/15 text-status-error [a&]:hover:bg-status-error/25",
        outline:
          "border-current/20 text-foreground bg-transparent [a&]:hover:bg-accent",
        // Status variants with colors
        success:
          "border-transparent bg-status-success/15 text-status-success [a&]:hover:bg-status-success/25",
        warning:
          "border-transparent bg-status-warning/15 text-status-warning [a&]:hover:bg-status-warning/25",
        info:
          "border-transparent bg-status-info/15 text-status-info [a&]:hover:bg-status-info/25",
        pending:
          "border-transparent bg-status-pending/15 text-status-pending [a&]:hover:bg-status-pending/25",
        progress:
          "border-transparent bg-status-progress/15 text-status-progress [a&]:hover:bg-status-progress/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
