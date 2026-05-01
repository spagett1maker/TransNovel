import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

/*
 * TransNovel Design System — exact production tokens
 * Ref: globals.css, android.com-inspired minimal design
 * Font: Pretendard Variable
 * Base radius: 1.5rem (24px)
 */

// ── Light Mode Palette (production) ──
export const COLORS = {
  // Surface
  bg: "#ffffff",
  bgCard: "#ffffff",
  bgMuted: "#f8f9fa",
  bgSecondary: "#f8f9fa",

  // Text
  text: "#1f1f1f",
  textMuted: "#5f6368",
  textDim: "#80868b",

  // Border
  border: "#e8eaed",

  // Primary
  primary: "#1f1f1f",
  primaryFg: "#ffffff",

  // Accent (Android Green)
  accent: "#e8f5e9",
  accentFg: "#1e8e3e",

  // Status
  success: "#1e8e3e",
  successBg: "rgba(30,142,62,0.10)",
  warning: "#f9ab00",
  warningBg: "rgba(249,171,0,0.10)",
  error: "#d93025",
  errorBg: "rgba(217,48,37,0.12)",
  info: "#1a73e8",
  infoBg: "rgba(26,115,232,0.10)",
  pending: "#80868b",
  pendingBg: "rgba(128,134,139,0.10)",
  progress: "#1a73e8",

  // Chart
  chart1: "#1a73e8",
  chart2: "#1e8e3e",
  chart3: "#e8710a",
  chart4: "#9334e6",
  chart5: "#e52592",

  // Selection
  selection: "#c8e6c9",
};

// ── Radius tokens ──
export const RADIUS = {
  sm: 20,   // calc(1.5rem - 4px)
  md: 22,   // calc(1.5rem - 2px)
  lg: 24,   // 1.5rem
  xl: 28,   // calc(1.5rem + 4px)
  card: 20, // 1.25rem — project-card
  full: 999,
};

// ── Shadow tokens ──
export const SHADOWS = {
  card: "0 1px 2px rgba(0,0,0,0.03), 0 4px 8px -2px rgba(0,0,0,0.04)",
  cardHover: "0 4px 12px -2px rgba(0,0,0,0.06), 0 12px 32px -8px rgba(0,0,0,0.1), 0 24px 48px -12px rgba(0,0,0,0.06)",
  button: "0 1px 2px rgba(0,0,0,0.1), 0 4px 8px -2px rgba(0,0,0,0.1)",
  surface: "0 1px 2px 0 rgba(0,0,0,0.03), 0 2px 8px -2px rgba(0,0,0,0.04)",
};

// ── Font ──
export const FONT = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

// ── Fade In with optional slide ──
export const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  slideY?: number;
  slideX?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, duration = 20, slideY = 30, slideX = 0, style }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const opacity = interpolate(f, [0, duration], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(f, [0, duration], [slideY, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const x = interpolate(f, [0, duration], [slideX, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{ opacity, transform: `translate(${x}px, ${y}px)`, ...style }}>
      {children}
    </div>
  );
};

// ── Spring Scale In ──
export const SpringIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.8 },
  });
  return (
    <div style={{ transform: `scale(${scale})`, ...style }}>
      {children}
    </div>
  );
};

// ── Typing effect ──
export const TypingText: React.FC<{
  text: string;
  delay?: number;
  speed?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, speed = 2, style }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const charCount = Math.min(text.length, Math.floor(f / speed));
  const showCursor = f % 16 < 10;
  return (
    <span style={style}>
      {text.slice(0, charCount)}
      {charCount < text.length && (
        <span style={{ opacity: showCursor ? 1 : 0, color: COLORS.textDim }}>|</span>
      )}
    </span>
  );
};

// ── Counter Roll-Up ──
export const Counter: React.FC<{
  from?: number;
  to: number;
  delay?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  style?: React.CSSProperties;
}> = ({ from = 0, to, delay = 0, duration = 30, suffix = "", prefix = "", style }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const value = Math.round(
    interpolate(f, [0, duration], [from, to], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })
  );
  return (
    <span style={{ fontFeatureSettings: '"tnum" 1', fontVariantNumeric: "tabular-nums", ...style }}>
      {prefix}{value.toLocaleString()}{suffix}
    </span>
  );
};

// ── Badge (matches production: rounded-full + dot + tinted bg) ──
export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "pending" | "progress" | "secondary";
}> = ({ children, variant = "default" }) => {
  const variantStyles: Record<string, { bg: string; color: string; dot?: string }> = {
    default: { bg: COLORS.primary, color: COLORS.primaryFg },
    secondary: { bg: COLORS.bgSecondary, color: COLORS.text },
    success: { bg: COLORS.successBg, color: COLORS.success, dot: COLORS.success },
    warning: { bg: COLORS.warningBg, color: COLORS.warning, dot: COLORS.warning },
    error: { bg: COLORS.errorBg, color: COLORS.error, dot: COLORS.error },
    info: { bg: COLORS.infoBg, color: COLORS.info, dot: COLORS.info },
    pending: { bg: COLORS.pendingBg, color: COLORS.pending, dot: COLORS.pending },
    progress: { bg: COLORS.infoBg, color: COLORS.progress, dot: COLORS.progress },
  };
  const s = variantStyles[variant] || variantStyles.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: RADIUS.full,
        fontSize: 12,
        fontWeight: 500,
        color: s.color,
        background: s.bg,
        whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
      }}
    >
      {s.dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: RADIUS.full,
            background: s.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};

// ── Button (matches production: rounded-full + layered shadow) ──
export const ProductButton: React.FC<{
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "tonal";
  size?: "default" | "sm" | "lg";
  style?: React.CSSProperties;
}> = ({ children, variant = "default", size = "default", style }) => {
  const sizeMap = {
    sm: { height: 32, padding: "0 16px", fontSize: 12 },
    default: { height: 40, padding: "0 24px", fontSize: 14 },
    lg: { height: 48, padding: "0 32px", fontSize: 16 },
  };
  const variantMap: Record<string, React.CSSProperties> = {
    default: {
      background: COLORS.primary,
      color: COLORS.primaryFg,
      boxShadow: SHADOWS.button,
      border: "none",
    },
    outline: {
      background: "transparent",
      color: COLORS.text,
      border: `2px solid ${COLORS.border}`,
      boxShadow: "none",
    },
    ghost: {
      background: "transparent",
      color: COLORS.text,
      border: "none",
      boxShadow: "none",
    },
    tonal: {
      background: "rgba(31,31,31,0.10)",
      color: COLORS.primary,
      border: "none",
      boxShadow: "none",
    },
  };
  const s = sizeMap[size];
  const v = variantMap[variant] || variantMap.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: s.height,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 500,
        borderRadius: RADIUS.full,
        letterSpacing: "-0.01em",
        ...v,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

// ── Progress Bar ──
export const ProgressBar: React.FC<{
  progress: number;
  color?: string;
  width?: number;
  height?: number;
}> = ({ progress, color = COLORS.progress, width = 400, height = 6 }) => (
  <div
    style={{
      width,
      height,
      borderRadius: RADIUS.full,
      background: COLORS.bgMuted,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        width: `${Math.min(100, progress)}%`,
        height: "100%",
        borderRadius: RADIUS.full,
        background: color,
      }}
    />
  </div>
);

// ── Project Card (matches .project-card exactly) ──
export const ProjectCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      background: COLORS.bgCard,
      border: `1px solid ${COLORS.border}`,
      borderRadius: RADIUS.card,
      padding: 28,
      boxShadow: SHADOWS.card,
      ...style,
    }}
  >
    {children}
  </div>
);

// ── Section Surface (matches .section-surface) ──
export const SectionSurface: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: COLORS.bgMuted,
      borderRadius: RADIUS.xl,
      padding: 32,
      boxShadow: SHADOWS.surface,
      ...style,
    }}
  >
    {children}
  </div>
);

// ── Animated Cursor (mouse pointer simulator) ──
export const AnimatedCursor: React.FC<{
  positions: Array<{ x: number; y: number; frame: number; click?: boolean }>;
}> = ({ positions }) => {
  const frame = useCurrentFrame();
  if (positions.length === 0) return null;

  // Find current segment
  let fromPos = positions[0];
  let toPos = positions[0];
  for (let i = 0; i < positions.length - 1; i++) {
    if (frame >= positions[i].frame && frame <= positions[i + 1].frame) {
      fromPos = positions[i];
      toPos = positions[i + 1];
      break;
    }
    if (frame > positions[i + 1].frame) {
      fromPos = positions[i + 1];
      toPos = positions[i + 1];
    }
  }
  if (frame >= positions[positions.length - 1].frame) {
    fromPos = positions[positions.length - 1];
    toPos = fromPos;
  }

  let x: number;
  let y: number;
  if (fromPos.frame === toPos.frame) {
    x = toPos.x;
    y = toPos.y;
  } else {
    const segProgress = interpolate(
      frame,
      [fromPos.frame, toPos.frame],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    const eased = Easing.inOut(Easing.cubic)(segProgress);
    x = fromPos.x + (toPos.x - fromPos.x) * eased;
    y = fromPos.y + (toPos.y - fromPos.y) * eased;
  }

  // Check for click ripple
  let rippleOpacity = 0;
  let rippleScale = 0;
  for (const pos of positions) {
    if (pos.click && frame >= pos.frame && frame <= pos.frame + 20) {
      const rippleF = frame - pos.frame;
      rippleOpacity = interpolate(rippleF, [0, 20], [0.5, 0], { extrapolateRight: "clamp" });
      rippleScale = interpolate(rippleF, [0, 20], [0, 1], { extrapolateRight: "clamp" });
      break;
    }
  }

  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 1000, pointerEvents: "none" }}>
      {/* Ripple */}
      {rippleOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: COLORS.primary,
            opacity: rippleOpacity,
            transform: `translate(-50%, -50%) scale(${rippleScale})`,
          }}
        />
      )}
      {/* Cursor SVG */}
      <svg width="24" height="24" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>
        <path d="M5 3l14 10-6.5 1.5L9 21z" fill="#ffffff" stroke="#1f1f1f" strokeWidth="1.5" />
      </svg>
    </div>
  );
};

// ── Caption Bar (bottom center text) ──
export const CaptionBar: React.FC<{
  text: string;
  delay?: number;
  icon?: string;
}> = ({ text, delay = 0, icon }) => {
  return (
    <FadeIn delay={delay} slideY={10} style={{
      position: "absolute",
      bottom: 48,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 900,
    }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.full,
          padding: "12px 28px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
          fontSize: 16,
          fontWeight: 500,
          color: COLORS.text,
          whiteSpace: "nowrap",
        }}
      >
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        {text}
      </div>
    </FadeIn>
  );
};

// ── Scene transition wrapper ──
export const SceneWrapper: React.FC<{
  children: React.ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ children, fadeIn = 15, fadeOut = 10 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeOutStart = Math.max(fadeIn + 1, durationInFrames - fadeOut);
  const fadeOutEnd = Math.max(fadeOutStart + 1, durationInFrames);
  const opacity = fadeOut === 0
    ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" })
    : interpolate(
        frame,
        [0, fadeIn, fadeOutStart, fadeOutEnd],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        background: COLORS.bg,
        fontFamily: FONT,
        color: COLORS.text,
        WebkitFontSmoothing: "antialiased",
        letterSpacing: "-0.01em",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
};
