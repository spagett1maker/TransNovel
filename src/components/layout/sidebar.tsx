"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Moon,
  Send,
  Store,
  Sun,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getRoleDisplayName } from "@/lib/permissions";
import { UserRole } from "@prisma/client";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

// 작가용 네비게이션
const authorNavigation: NavItem[] = [
  { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { name: "프로젝트", href: "/works", icon: FolderOpen },
  { name: "윤문가 찾기", href: "/editors", icon: Users },
  { name: "계약 관리", href: "/contracts", icon: FileText },
];

// 윤문가용 네비게이션
const editorNavigation: NavItem[] = [
  { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { name: "담당 프로젝트", href: "/works", icon: FolderOpen },
  { name: "마켓플레이스", href: "/marketplace", icon: Store },
  { name: "내 지원", href: "/my-applications", icon: Send },
  { name: "계약 관리", href: "/contracts", icon: FileText },
  { name: "내 프로필", href: "/my-profile", icon: UserCircle },
];

// 관리자 전용 네비게이션
const adminNavigation: NavItem[] = [
  { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { name: "프로젝트", href: "/works", icon: FolderOpen },
  { name: "모니터링", href: "/admin", icon: Activity },
];

// 사이드바 내부 콘텐츠 (데스크톱/모바일 공용)
function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  const button = (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex items-center w-full py-2.5 text-[13px] rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200",
        collapsed ? "justify-center px-0" : "gap-3 px-3"
      )}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px] shrink-0" />
      ) : (
        <Moon className="h-[18px] w-[18px] shrink-0" />
      )}
      {!collapsed && (isDark ? "라이트 모드" : "다크 모드")}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {isDark ? "라이트 모드" : "다크 모드"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function SidebarContent({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
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
    <>
      {/* Logo + Toggle */}
      <div className={cn(
        "flex items-center pt-8 pb-8",
        collapsed ? "justify-center px-2" : "justify-between px-6"
      )}>
        <Link href="/dashboard" className="block group">
          <span className={cn(
            "font-semibold tracking-tight group-hover:opacity-70 transition-opacity",
            collapsed ? "text-base" : "text-xl"
          )}>
            {collapsed ? "TN" : "TransNovel"}
          </span>
        </Link>
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200",
              collapsed && "absolute right-0 translate-x-1/2 top-8 z-10 bg-background border border-border/60 shadow-sm h-6 w-6 rounded-full"
            )}
            aria-label={collapsed ? "사이드바 열기" : "사이드바 접기"}
          >
            {collapsed ? (
              <ChevronsRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronsLeft className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1", collapsed ? "px-2" : "px-4")}>
        {!collapsed && (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3 px-3 font-medium">
            Menu
          </p>
        )}
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const link = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center py-2.5 text-[13px] rounded-xl transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  isActive
                    ? "text-foreground font-semibold bg-muted nav-active"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors duration-200", isActive ? "text-foreground" : "")} />
                {!collapsed && item.name}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}
        </div>
      </nav>

      {/* Theme Toggle */}
      <div className={cn("mb-2", collapsed ? "px-2" : "px-4")}>
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* User Profile */}
      <div className={cn("py-5", collapsed ? "px-2" : "px-6")}>
        <div className={cn("pt-5 border-t border-border/60", collapsed && "flex justify-center")}>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              "text-left focus:outline-none group",
              collapsed ? "flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted/70 transition-colors" : "w-full"
            )}>
              {collapsed ? (
                <UserCircle className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    Account
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium truncate group-hover:text-muted-foreground transition-colors"
                        title={session?.user?.name || undefined}
                      >
                        {session?.user?.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getRoleDisplayName(userRole)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">→</span>
                  </div>
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={collapsed ? "center" : "start"} side={collapsed ? "right" : "top"} sideOffset={8} className="w-52 rounded-xl p-2">
              <div className="px-3 py-2 mb-1 border-b border-border">
                <p className="text-sm font-medium truncate">{session?.user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {session?.user?.email}
                </p>
              </div>
              {userRole === UserRole.EDITOR && (
                <DropdownMenuItem asChild className="rounded-lg py-2.5 px-3 cursor-pointer">
                  <Link href="/my-profile">내 프로필</Link>
                </DropdownMenuItem>
              )}
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
    </>
  );
}

// 데스크톱 사이드바
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden lg:flex h-full flex-col bg-muted/30 border-r border-border/40 transition-all duration-300 ease-in-out relative",
          collapsed ? "w-[60px]" : "w-60"
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggle} />
      </aside>
    </TooltipProvider>
  );
}

// 모바일 사이드바 (Sheet 드로어)
export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // pathname 변경 시 Sheet 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden flex items-center justify-center h-10 w-10 rounded-lg hover:bg-muted transition-colors"
        aria-label="메뉴 열기"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">네비게이션 메뉴</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
