import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/70",
        destructive:
          "border-transparent bg-status-error/12 text-status-error [a&]:hover:bg-status-error/20",
        outline:
          "border-border text-foreground bg-transparent [a&]:hover:bg-muted",
        // Status variants — dot + tinted bg
        success:
          "border-transparent bg-status-success/10 text-status-success before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-status-success before:shrink-0 [a&]:hover:bg-status-success/18",
        warning:
          "border-transparent bg-status-warning/10 text-status-warning before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-status-warning before:shrink-0 [a&]:hover:bg-status-warning/18",
        info:
          "border-transparent bg-status-info/10 text-status-info before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-status-info before:shrink-0 [a&]:hover:bg-status-info/18",
        pending:
          "border-transparent bg-status-pending/10 text-status-pending before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-status-pending before:shrink-0 [a&]:hover:bg-status-pending/18",
        progress:
          "border-transparent bg-status-progress/10 text-status-progress before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-status-progress before:shrink-0 [a&]:hover:bg-status-progress/18",
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
