import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, RADIUS, SHADOWS, FadeIn, SceneWrapper, SpringIn, ProjectCard, ProductButton } from "../components/common";

const StepIcon: React.FC<{
  icon: string;
  label: string;
  delay: number;
}> = ({ icon, label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 10, stiffness: 150 },
  });

  return (
    <div style={{ textAlign: "center", transform: `scale(${scale})` }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: RADIUS.card,
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          boxShadow: SHADOWS.card,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          margin: "0 auto 8px",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
};

export const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showBenefits = frame >= 100;
  const showCTA = frame >= 180;

  const ctaScale = spring({
    frame: Math.max(0, frame - 180),
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const pulseFrame = Math.max(0, frame - 220);
  const pulse = pulseFrame > 0 ? 1 + Math.sin(pulseFrame * 0.1) * 0.02 : 1;

  return (
    <SceneWrapper fadeOut={0}>
      <AbsoluteFill
        style={{
          background: COLORS.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", textAlign: "center", maxWidth: 900 }}>
          {/* Pipeline flow — 4 steps for proofreader workflow */}
          <FadeIn delay={10} slideY={20}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 24,
                marginBottom: 60,
              }}
            >
              {[
                { icon: "🔍", label: "프로젝트 탐색" },
                { icon: "📝", label: "지원하기" },
                { icon: "✍️", label: "윤문 작업" },
                { icon: "✅", label: "승인 완료" },
              ].map((step, i) => (
                <React.Fragment key={step.label}>
                  {i > 0 && (
                    <FadeIn delay={20 + i * 15}>
                      <div
                        style={{
                          width: 32,
                          height: 2,
                          background: COLORS.border,
                          borderRadius: 2,
                        }}
                      />
                    </FadeIn>
                  )}
                  <StepIcon icon={step.icon} label={step.label} delay={15 + i * 15} />
                </React.Fragment>
              ))}
            </div>
          </FadeIn>

          {/* Benefit cards */}
          {showBenefits && (
            <FadeIn delay={100} slideY={20}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 16,
                  marginBottom: 60,
                }}
              >
                {[
                  {
                    icon: "🤖",
                    title: "AI 지원",
                    desc: "AI 번역 비교와 제안으로 효율적인 윤문",
                  },
                  {
                    icon: "📋",
                    title: "체계적 관리",
                    desc: "챕터별 진행 추적과 용어집 관리",
                  },
                  {
                    icon: "💬",
                    title: "원활한 소통",
                    desc: "작가와의 코멘트 기반 실시간 협업",
                  },
                ].map((card, i) => (
                  <SpringIn key={card.title} delay={110 + i * 15}>
                    <ProjectCard
                      style={{
                        padding: "24px 20px",
                        textAlign: "center",
                        minWidth: 220,
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 12 }}>
                        {card.icon}
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          marginBottom: 6,
                          letterSpacing: "-0.025em",
                        }}
                      >
                        {card.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textDim,
                          lineHeight: 1.6,
                        }}
                      >
                        {card.desc}
                      </div>
                    </ProjectCard>
                  </SpringIn>
                ))}
              </div>
            </FadeIn>
          )}

          {/* Logo + CTA */}
          {showCTA && (
            <div style={{ transform: `scale(${ctaScale})` }}>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  marginBottom: 12,
                  color: COLORS.text,
                }}
              >
                TransNovel
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.textMuted,
                  marginBottom: 36,
                  letterSpacing: "-0.01em",
                }}
              >
                윤문가를 위한 문학 번역 플랫폼
              </div>
              <div style={{ transform: `scale(${pulse})`, display: "inline-block" }}>
                <ProductButton size="lg" style={{ fontSize: 18, padding: "0 40px", height: 52 }}>
                  지금 시작하기 →
                </ProductButton>
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </SceneWrapper>
  );
};
