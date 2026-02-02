"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Activity,
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
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-[13px] rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px] shrink-0" />
      ) : (
        <Moon className="h-[18px] w-[18px] shrink-0" />
      )}
      {isDark ? "라이트 모드" : "다크 모드"}
    </button>
  );
}

function SidebarContent() {
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
      {/* Logo */}
      <div className="px-8 pt-10 pb-10">
        <Link href="/dashboard" className="block group">
          <span className="text-xl font-semibold tracking-tight group-hover:opacity-70 transition-opacity">
            TransNovel
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3 px-3 font-medium">
          Menu
        </p>
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-xl transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isActive
                    ? "text-foreground font-semibold bg-muted nav-active"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors duration-200", isActive ? "text-foreground" : "")} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Theme Toggle */}
      <div className="px-5 mb-2">
        <ThemeToggle />
      </div>

      {/* User Profile */}
      <div className="px-8 py-6">
        <div className="pt-6 border-t border-border/60">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full text-left focus:outline-none group">
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
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-52 rounded-xl p-2">
              <div className="px-3 py-2 mb-1 border-b border-border">
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
  return (
    <aside className="hidden lg:flex h-full w-72 flex-col bg-muted/30 border-r border-border/40">
      <SidebarContent />
    </aside>
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
