import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import {
  COLORS,
  RADIUS,
  SHADOWS,
  FadeIn,
  SpringIn,
  SceneWrapper,
  AnimatedCursor,
  CaptionBar,
  Badge,
  ProgressBar,
  ProjectCard,
  Counter,
} from "../components/common";
import { AppSidebar, PageLayout, StatCard } from "../components/app-ui";
import { CheckCircle } from "lucide-react";

export const Accepted: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showContract = frame >= 100;
  const toastOpacity = interpolate(frame, [0, 10, 100, 120], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const progressValue = interpolate(frame, [120, 200], [0, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneWrapper>
      <AbsoluteFill>
        <PageLayout
          sidebar={
            <AppSidebar
              activeItem="dashboard"
              highlightItem="projects"
              highlightFrame={320}
            />
          }
        >
          <div style={{ padding: 48, position: "relative" }}>
            {/* Notification toast */}
            <div
              style={{
                opacity: toastOpacity,
                background: COLORS.accent,
                borderRadius: RADIUS.full,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 500,
                color: COLORS.accentFg,
                marginBottom: 24,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle size={16} /> 지원이 수락되었습니다 — 달빛 아래 피어난 꽃
            </div>

            {/* Header */}
            <FadeIn delay={10}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  marginBottom: 24,
                }}
              >
                대시보드
              </div>
            </FadeIn>

            {/* Stat cards — using production StatCard with lucide icons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
              <StatCard label="활성 계약" value={<Counter from={0} to={1} delay={60} duration={20} />} delay={20} />
              <StatCard label="검토 대기" value={<Counter from={0} to={12} delay={70} duration={25} />} delay={30} accentColor={COLORS.warning} borderLeft />
              <StatCard label="지원 대기중" value="0" delay={40} />
              <StatCard label="평점" value="-" delay={50} />
            </div>

            {/* Contract card */}
            {showContract && (
              <SpringIn delay={100}>
                <ProjectCard>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      달빛 아래 피어난 꽃
                    </div>
                    <Badge variant="progress">진행 중</Badge>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    봄날의 작가
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>
                    1-50화 · 로맨스
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        color: COLORS.textDim,
                        marginBottom: 8,
                      }}
                    >
                      <span>진행률</span>
                      <span>
                        <Counter
                          from={0}
                          to={8}
                          delay={120}
                          duration={40}
                          suffix="%"
                        />
                      </span>
                    </div>
                    <ProgressBar progress={progressValue} width={500} />
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      color: COLORS.info,
                      fontWeight: 500,
                    }}
                  >
                    담당 프로젝트에서 작업 시작 →
                  </div>
                </ProjectCard>
              </SpringIn>
            )}
          </div>
        </PageLayout>

        {/* Cursor */}
        <AnimatedCursor
          positions={[
            { x: 800, y: 300, frame: 0 },
            { x: 700, y: 480, frame: 180 },
            { x: 120, y: 200, frame: 300 },
            { x: 120, y: 200, frame: 340, click: true },
          ]}
        />

        {/* Caption */}
        <CaptionBar text="담당 프로젝트에서 작업을 시작하세요" delay={150} />
      </AbsoluteFill>
    </SceneWrapper>
  );
};
