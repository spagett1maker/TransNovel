import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 active:scale-[0.97] active:duration-75",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.1),0_4px_8px_-2px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_8px_16px_-4px_rgba(0,0,0,0.15)] hover:-translate-y-px hover:bg-primary/90 rounded-full",
        destructive:
          "bg-destructive text-white shadow-[0_1px_2px_rgba(0,0,0,0.1),0_4px_8px_-2px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_8px_16px_-4px_rgba(0,0,0,0.15)] hover:-translate-y-px hover:bg-destructive/90 rounded-full",
        outline:
          "border-2 border-input bg-transparent text-foreground hover:border-foreground/40 hover:bg-muted/50 hover:shadow-sm rounded-full",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 rounded-full",
        ghost:
          "hover:bg-muted text-foreground rounded-full",
        link:
          "text-primary underline-offset-4 hover:underline",
        tonal:
          "bg-primary/10 text-primary hover:bg-primary/16 rounded-full",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "size-10 rounded-full",
        "icon-sm": "size-8 rounded-full",
        "icon-lg": "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
