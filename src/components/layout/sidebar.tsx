"use client";

import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Home,
  LogOut,
  Settings,
  Sparkles,
  User,
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
    <div className="flex h-full w-72 flex-col bg-sidebar/90 backdrop-blur-xl border-r border-sidebar-border/50">
      {/* Logo */}
      <div className="flex h-20 items-center px-6">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary shadow-lg group-hover:shadow-xl transition-shadow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
              TransNovel
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
              AI Translation
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-4 py-6">
        <p className="px-4 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          메뉴
        </p>
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-4 rounded-2xl px-4 py-3.5 text-sm font-medium transition-all duration-300",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                isActive
                  ? "bg-primary-foreground/20"
                  : "bg-sidebar-accent group-hover:bg-sidebar-accent"
              )}>
                <item.icon className="h-5 w-5" />
              </div>
              <span className="flex-1">{item.name}</span>
              {isActive && (
                <ChevronRight className="h-4 w-4 opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-4 px-4 py-4 h-auto rounded-2xl hover:bg-sidebar-accent group transition-all duration-200"
            >
              <Avatar className="h-11 w-11 ring-2 ring-primary/10 group-hover:ring-primary/20 transition-all">
                <AvatarImage src={session?.user?.image ?? undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-sm font-semibold">
                  {session?.user?.name?.[0] ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left min-w-0 flex-1">
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-semibold text-sidebar-foreground truncate">
                    {session?.user?.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-2 py-0 h-5 bg-primary/10 text-primary border-0"
                  >
                    {getRoleDisplayName(userRole)}
                  </Badge>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-2xl p-2">
            <div className="px-3 py-2 mb-2">
              <p className="text-xs text-muted-foreground truncate">
                {session?.user?.email}
              </p>
            </div>
            <DropdownMenuItem asChild className="rounded-xl py-2.5 px-3 cursor-pointer">
              <Link href="/settings">
                <User className="mr-3 h-4 w-4" />
                프로필
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-xl py-2.5 px-3 cursor-pointer">
              <Link href="/settings">
                <Settings className="mr-3 h-4 w-4" />
                설정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-xl py-2.5 px-3 cursor-pointer"
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
