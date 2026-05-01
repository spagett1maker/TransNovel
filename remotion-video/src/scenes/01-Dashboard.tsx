import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, FadeIn, SceneWrapper, AnimatedCursor, CaptionBar, ProjectCard } from "../components/common";
import { AppSidebar, PageLayout, StatCard } from "../components/app-ui";
import { Languages } from "lucide-react";

export const Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneWrapper>
      <AbsoluteFill>
        <PageLayout
          sidebar={
            <AppSidebar
              activeItem="dashboard"
              highlightItem="marketplace"
              highlightFrame={280}
            />
          }
        >
          {/* Main content — matches max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 */}
          <div style={{ padding: "32px 32px", maxWidth: 1152 }}>
            {/* Page Header — matches production header section */}
            <FadeIn delay={5}>
              <header style={{ paddingBottom: 40, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 40 }}>
                <p
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: COLORS.textMuted,
                    marginBottom: 12,
                  }}
                >
                  Editor
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <h1
                    style={{
                      fontSize: 36, // text-4xl
                      fontWeight: 600, // font-semibold
                      letterSpacing: "-0.025em",
                      color: COLORS.text,
                      margin: 0,
                    }}
                  >
                    김윤문
                  </h1>
                  {/* Availability badge */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#fff",
                      background: COLORS.success,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.8)" }} />
                    가능
                  </span>
                </div>
                <p style={{ fontSize: 18, color: COLORS.textMuted }}>
                  검토가 필요한 번역본을 확인하세요
                </p>
              </header>
            </FadeIn>

            {/* Overview section header */}
            <FadeIn delay={10}>
              <h2
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: COLORS.textMuted,
                  marginBottom: 24,
                }}
              >
                Overview
              </h2>
            </FadeIn>

            {/* Stat Cards — grid gap-4 sm:grid-cols-2 lg:grid-cols-4 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <StatCard label="활성 계약" value="0" delay={20} />
              <StatCard label="검토 대기" value="0" delay={30} accentColor={COLORS.warning} borderLeft />
              <StatCard label="지원 대기중" value="0" delay={40} />
              <StatCard label="평점" value="-" delay={50} />
            </div>

            {/* Empty state for projects */}
            <div style={{ marginTop: 40 }}>
              <FadeIn delay={70}>
                <ProjectCard
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 60,
                  }}
                >
                  <Languages size={64} style={{ color: COLORS.textDim, marginBottom: 16 }} />
                  <span style={{ fontSize: 16, color: COLORS.textMuted, fontWeight: 500, marginBottom: 8 }}>
                    담당 프로젝트가 없습니다
                  </span>
                  <span style={{ fontSize: 13, color: COLORS.textDim }}>
                    마켓플레이스에서 윤문 프로젝트를 찾아보세요
                  </span>
                </ProjectCard>
              </FadeIn>
            </div>
          </div>
        </PageLayout>

        {/* Animated cursor */}
        <AnimatedCursor
          positions={[
            { x: 960, y: 400, frame: 0 },
            { x: 120, y: 280, frame: 250 },
            { x: 120, y: 280, frame: 300, click: true },
          ]}
        />

        {/* Captions */}
        {frame < 200 && (
          <CaptionBar text="가입 후 처음 보이는 대시보드입니다" delay={15} />
        )}
        {frame >= 200 && (
          <CaptionBar text="마켓플레이스에서 프로젝트를 찾아보세요" delay={200} />
        )}
      </AbsoluteFill>
    </SceneWrapper>
  );
};
