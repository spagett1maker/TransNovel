import React from "react";
import {
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import {
  LayoutDashboard,
  FolderOpen,
  Store,
  Send,
  FileText,
  UserCircle,
  Clock,
  Briefcase,
  Star,
  type LucideIcon,
} from "lucide-react";
import { COLORS, RADIUS, SHADOWS, FONT, Badge } from "./common";

// ── App Sidebar (w-60 = 240px, production layout) ──
// Matches: src/components/layout/sidebar.tsx exactly

const NAV_ITEMS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { key: "projects", label: "담당 프로젝트", icon: FolderOpen },
  { key: "marketplace", label: "마켓플레이스", icon: Store },
  { key: "applications", label: "내 지원", icon: Send },
  { key: "contracts", label: "계약 관리", icon: FileText },
  { key: "profile", label: "내 프로필", icon: UserCircle },
];

export type NavKey = string;

export const AppSidebar: React.FC<{
  activeItem?: NavKey;
  highlightItem?: NavKey;
  highlightFrame?: number;
}> = ({ activeItem = "dashboard", highlightItem, highlightFrame = 0 }) => {
  const frame = useCurrentFrame();
  const isHighlighting = highlightItem && frame >= highlightFrame;

  return (
    <div
      style={{
        width: 240,
        height: "100%",
        background: "rgba(248,249,250,0.3)", // bg-muted/30
        borderRight: `1px solid rgba(232,234,237,0.4)`, // border-border/40
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        flexShrink: 0,
      }}
    >
      {/* Logo — matches pt-8 pb-8 px-6 */}
      <div
        style={{
          padding: "32px 24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 20, // text-xl
            fontWeight: 600, // font-semibold
            letterSpacing: "-0.025em", // tracking-tight
            color: COLORS.text,
          }}
        >
          TransNovel
        </span>
      </div>

      {/* Menu label — matches text-[10px] uppercase tracking-widest */}
      <div style={{ padding: "0 16px" }}>
        <p
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "rgba(95,99,104,0.7)", // text-muted-foreground/70
            marginBottom: 12,
            padding: "0 12px",
            fontWeight: 500,
          }}
        >
          Menu
        </p>

        {/* Nav items — matches space-y-0.5 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === activeItem;
            const isHighlighted = isHighlighting && item.key === highlightItem;
            const Icon = item.icon;

            return (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12, // gap-3
                  padding: "10px 12px", // py-2.5 px-3
                  borderRadius: 12, // rounded-xl
                  fontSize: 13, // text-[13px]
                  fontWeight: isActive ? 600 : 400, // font-semibold when active
                  color: isActive ? COLORS.text : COLORS.textMuted,
                  background: isHighlighted
                    ? COLORS.accent
                    : isActive
                    ? COLORS.bgMuted // bg-muted
                    : "transparent",
                  position: "relative",
                }}
              >
                {/* Active indicator — 3px left border (nav-active class) */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 16, // 1rem
                      borderRadius: "0 3px 3px 0",
                      background: COLORS.text,
                    }}
                  />
                )}
                <Icon
                  size={18} // h-[18px] w-[18px]
                  style={{
                    flexShrink: 0,
                    color: isActive ? COLORS.text : undefined,
                  }}
                />
                {item.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom account section */}
      <div style={{ marginTop: "auto", padding: "20px 24px" }}>
        <div
          style={{
            paddingTop: 20,
            borderTop: `1px solid rgba(232,234,237,0.6)`, // border-border/60
          }}
        >
          <p
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: COLORS.textMuted,
              marginBottom: 8,
            }}
          >
            Account
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500 }}>김윤문</p>
              <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>윤문가</p>
            </div>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>→</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Chapter List Item (for editor scenes) ──
export const ChapterListItem: React.FC<{
  number: number;
  title?: string;
  status: "pending" | "in_progress" | "completed" | "approved";
  isActive?: boolean;
  delay?: number;
}> = ({ number, title, status, isActive = false, delay = 0 }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const opacity = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  const statusConfig: Record<string, { variant: "pending" | "success" | "progress" | "info"; label: string }> = {
    pending: { variant: "pending", label: "대기" },
    in_progress: { variant: "progress", label: "진행중" },
    completed: { variant: "info", label: "완료" },
    approved: { variant: "success", label: "승인" },
  };

  const s = statusConfig[status] || statusConfig.pending;

  return (
    <div
      style={{
        opacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: RADIUS.sm,
        fontSize: 13,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? COLORS.text : COLORS.textMuted,
        background: isActive ? COLORS.bgMuted : "transparent",
      }}
    >
      <span>
        제{number}화{title ? ` - ${title}` : ""}
      </span>
      <Badge variant={s.variant}>{s.label}</Badge>
    </div>
  );
};

// ── Page Layout (sidebar + content) ──
export const PageLayout: React.FC<{
  children: React.ReactNode;
  sidebar: React.ReactNode;
}> = ({ children, sidebar }) => (
  <div
    style={{
      display: "flex",
      width: "100%",
      height: "100%",
      fontFamily: FONT,
    }}
  >
    {sidebar}
    <div
      style={{
        flex: 1,
        overflow: "hidden",
        background: COLORS.bg,
      }}
    >
      {children}
    </div>
  </div>
);

// ── Stat Card (matches production stat-card exactly) ──
// Production layout: icon in 36px rounded-xl bg-muted box, top-right corner
const STAT_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  "활성 계약": { icon: FileText, color: COLORS.textMuted, bg: COLORS.bgMuted },
  "검토 대기": { icon: Clock, color: COLORS.warning, bg: "rgba(249,171,0,0.10)" },
  "지원 대기중": { icon: Briefcase, color: COLORS.textMuted, bg: COLORS.bgMuted },
  "평점": { icon: Star, color: COLORS.warning, bg: "rgba(249,171,0,0.10)" },
};

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  delay?: number;
  accentColor?: string;
  borderLeft?: boolean;
}> = ({ label, value, delay = 0, accentColor, borderLeft = false }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const opacity = interpolate(f, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(f, [0, 15], [20, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const iconConfig = STAT_ICONS[label];
  const Icon = iconConfig?.icon;
  const labelColor = accentColor || COLORS.textMuted;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderLeft: borderLeft ? `2px solid ${accentColor || COLORS.border}` : `1px solid ${COLORS.border}`,
        borderRadius: 16, // rounded-2xl (stat-card uses 1rem)
        padding: 24, // p-6
        boxShadow: SHADOWS.card,
        flex: 1,
        minWidth: 180,
        display: "flex",
        flexDirection: "column",
        gap: 10, // gap-2.5
      }}
    >
      {/* Top row: label + icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <p style={{ fontSize: 14, color: labelColor, fontWeight: 400 }}>{label}</p>
        {Icon && (
          <div
            style={{
              height: 36, // h-9
              width: 36, // w-9
              borderRadius: 12, // rounded-xl
              background: iconConfig.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              size={16} // h-4 w-4
              style={{ color: iconConfig.color }}
              fill={label === "평점" ? iconConfig.color : "none"}
            />
          </div>
        )}
      </div>
      {/* Value */}
      <div
        style={{
          fontSize: 30, // text-3xl
          fontWeight: 600, // font-semibold
          color: accentColor || COLORS.text,
          fontFeatureSettings: '"tnum" 1',
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
};
