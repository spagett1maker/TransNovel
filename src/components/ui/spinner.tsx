import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-8 w-8",
};

export function Spinner({
  className,
  size = "md",
  label = "로딩 중...",
}: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", sizeClasses[size], className)}
      role="status"
      aria-label={label}
    />
  );
}

// 버튼 내부에서 사용할 때 (텍스트와 함께)
export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("mr-2 h-4 w-4 animate-spin", className)}
      aria-hidden="true"
    />
  );
}
