"use client";

import {
  BookOpen,
  ClipboardCheck,
  Home,
  LogOut,
  Settings,
  User,
  Sparkles,
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
    <div className="flex h-full w-72 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-20 items-center px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary shadow-md">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
            TransNovel
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-4 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-4 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-4 px-4 py-3 h-auto rounded-2xl hover:bg-sidebar-accent"
            >
              <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                <AvatarImage src={session?.user?.image ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {session?.user?.name?.[0] ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-sidebar-foreground truncate">
                    {session?.user?.name}
                  </span>
                  <Badge
                    variant="success"
                    className="text-[10px] px-2 py-0.5"
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
          <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
            <DropdownMenuItem asChild className="rounded-xl py-2.5 px-3">
              <Link href="/settings">
                <User className="mr-3 h-4 w-4" />
                프로필
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-xl py-2.5 px-3">
              <Link href="/settings">
                <Settings className="mr-3 h-4 w-4" />
                설정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive rounded-xl py-2.5 px-3"
            >
              <LogOut className="mr-3 h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
