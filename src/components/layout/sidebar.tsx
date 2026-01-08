"use client";

import {
  BookOpen,
  ClipboardCheck,
  Home,
  LogOut,
  Settings,
  User,
  Feather,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getRoleDisplayName } from "@/lib/permissions";
import { UserRole } from "@prisma/client";

// 작가용 네비게이션
const authorNavigation = [
  { name: "대시보드", href: "/dashboard", icon: Home },
  { name: "프로젝트", href: "/works", icon: BookOpen },
];

// 윤문가용 네비게이션
const editorNavigation = [
  { name: "대시보드", href: "/dashboard", icon: Home },
  { name: "검토 목록", href: "/works", icon: ClipboardCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;
  const navigation = userRole === UserRole.EDITOR ? editorNavigation : authorNavigation;

  return (
    <div className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Feather className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
            TransNovel
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-4.5 w-4.5", isActive && "text-accent-foreground")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 py-2.5 h-auto hover:bg-sidebar-accent/50"
            >
              <Avatar className="h-9 w-9 ring-2 ring-sidebar-border">
                <AvatarImage src={session?.user?.image ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {session?.user?.name?.[0] ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-sidebar-foreground truncate">
                    {session?.user?.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 bg-accent/30 text-accent-foreground border-0"
                  >
                    {getRoleDisplayName(userRole)}
                  </Badge>
                </div>
                <span className="text-xs text-sidebar-foreground/60 truncate w-full">
                  {session?.user?.email}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <User className="mr-2 h-4 w-4" />
                프로필
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                설정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
