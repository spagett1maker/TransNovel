"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

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
  { name: "대시보드", href: "/dashboard" },
  { name: "프로젝트", href: "/works" },
];

// 윤문가용 네비게이션
const editorNavigation = [
  { name: "대시보드", href: "/dashboard" },
  { name: "검토 목록", href: "/works" },
];

// 관리자 전용 네비게이션
const adminNavigation = [
  { name: "대시보드", href: "/dashboard" },
  { name: "프로젝트", href: "/works" },
  { name: "모니터링", href: "/admin" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;
  const navigation =
    userRole === UserRole.ADMIN
      ? adminNavigation
      : userRole === UserRole.EDITOR
        ? editorNavigation
        : authorNavigation;

  return (
    <div className="flex h-full w-64 flex-col bg-muted/30">
      {/* Logo */}
      <div className="px-8 pt-10 pb-12">
        <Link href="/dashboard" className="block">
          <span className="text-xl font-semibold tracking-tight">
            TransNovel
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-8">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
          Menu
        </p>
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "block py-2.5 text-sm transition-colors",
                  isActive
                    ? "text-foreground font-medium nav-active"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Profile */}
      <div className="px-8 py-8">
        <div className="pt-6 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full text-left focus:outline-none group">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Account
              </p>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate group-hover:text-muted-foreground transition-colors">
                    {session?.user?.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getRoleDisplayName(userRole)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-52 rounded-xl p-2">
              <div className="px-3 py-2 mb-1 border-b border-border">
                <p className="text-xs text-muted-foreground truncate">
                  {session?.user?.email}
                </p>
              </div>
              <DropdownMenuItem asChild className="rounded-lg py-2.5 px-3 cursor-pointer">
                <Link href="/settings">프로필</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg py-2.5 px-3 cursor-pointer">
                <Link href="/settings">설정</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-lg py-2.5 px-3 cursor-pointer"
              >
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
