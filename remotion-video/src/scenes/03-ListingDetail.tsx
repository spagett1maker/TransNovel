import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
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
  ProductButton,
  ProjectCard,
  TypingText,
} from "../components/common";
import { ArrowLeft, Eye, Users, Clock, BookOpen, Calendar } from "lucide-react";

export const ListingDetail: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showDialog = frame >= 200;
  const showSubmit = frame >= 350;
  const showSuccess = frame >= 380;

  return (
    <SceneWrapper>
      <AbsoluteFill>
        {/* Main layout */}
        <div
          style={{
            padding: "60px 80px",
            display: "flex",
            flexDirection: "row",
            gap: 40,
            height: "100%",
          }}
        >
          {/* LEFT COLUMN */}
          <FadeIn delay={10} style={{ flex: 2 }}>
            {/* Breadcrumb */}
            <div
              style={{
                fontSize: 14,
                color: COLORS.textMuted,
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ArrowLeft size={16} /> 프로젝트 목록
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.025em",
              }}
            >
              달빛 아래 피어난 꽃
            </div>

            {/* Badge row */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
              }}
            >
              <Badge variant="info">1-50화</Badge>
              <Badge variant="secondary">로맨스</Badge>
              <Badge variant="secondary">고전</Badge>
            </div>

            {/* Description */}
            <div
              style={{
                marginTop: 24,
                fontSize: 15,
                lineHeight: 1.8,
                color: COLORS.textMuted,
              }}
            >
              중국 고전 로맨스 소설의 한국어 윤문 작업입니다. 서정적이고
              아름다운 문체를 유지하면서도 한국어 독자들이 자연스럽게 읽을 수
              있도록 감수해주세요. 시적 표현과 고전 문학적 표현에 대한 이해가
              필요합니다.
            </div>

            {/* Budget */}
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.textDim,
                }}
              >
                예산
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                }}
              >
                ₩2,500,000
              </div>
            </div>

            {/* Chapter preview */}
            <FadeIn delay={30} style={{ marginTop: 24 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                챕터 미리보기
              </div>
              <ProjectCard style={{ padding: 16, marginBottom: 8 }}>
                <div style={{ fontSize: 13 }}>
                  제1화 - 봄바람이 불어오는 날
                </div>
              </ProjectCard>
              <ProjectCard style={{ padding: 16 }}>
                <div style={{ fontSize: 13 }}>제2화 - 달빛 아래의 만남</div>
              </ProjectCard>
            </FadeIn>
          </FadeIn>

          {/* RIGHT COLUMN */}
          <FadeIn delay={20} style={{ width: 320, flexShrink: 0 }}>
            {/* Author info */}
            <ProjectCard>
              {/* Avatar */}
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: RADIUS.full,
                  background: COLORS.bgMuted,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 600,
                  margin: "0 auto 12px auto",
                }}
              >
                작
              </div>

              {/* Author name */}
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                봄날의 작가
              </div>

              {/* Rating row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 12,
                  fontSize: 13,
                  color: COLORS.textMuted,
                  marginTop: 4,
                }}
              >
                <span>⭐ 4.8</span>
                <span>완료 23건</span>
              </div>

              {/* Divider */}
              <div
                style={{
                  borderTop: `1px solid ${COLORS.border}`,
                  margin: "16px 0",
                }}
              />

              {/* Project description */}
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.textMuted,
                  lineHeight: 1.7,
                }}
              >
                프로젝트 설명
              </div>
            </ProjectCard>

            {/* Apply button */}
            <div style={{ marginTop: 20 }}>
              <ProductButton
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                지원하기
              </ProductButton>
            </div>
          </FadeIn>
        </div>

        {/* DIALOG OVERLAY */}
        {showDialog && !showSuccess && (
          <AbsoluteFill
            style={{
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 500,
            }}
          >
            <SpringIn delay={200}>
              <div
                style={{
                  width: 500,
                  background: COLORS.bgCard,
                  borderRadius: RADIUS.lg,
                  padding: 32,
                  boxShadow: SHADOWS.cardHover,
                }}
              >
                {/* Dialog title */}
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                  }}
                >
                  프로젝트 지원
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.textMuted,
                    marginTop: 4,
                  }}
                >
                  달빛 아래 피어난 꽃
                </div>

                {/* Textarea */}
                <div
                  style={{
                    marginTop: 20,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    padding: 16,
                    minHeight: 100,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: COLORS.text,
                  }}
                >
                  <TypingText
                    text="3년간 중국 고전 문학 번역 경험이 있습니다. 서정적 문체 표현에 자신있으며..."
                    delay={220}
                    speed={1.5}
                  />
                </div>

                {/* Submit button */}
                {showSubmit && (
                  <div style={{ marginTop: 20 }}>
                    <FadeIn delay={350}>
                      <ProductButton
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        제출하기
                      </ProductButton>
                    </FadeIn>
                  </div>
                )}
              </div>
            </SpringIn>
          </AbsoluteFill>
        )}

        {/* SUCCESS OVERLAY */}
        {showSuccess && (
          <AbsoluteFill
            style={{
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 500,
            }}
          >
            <SpringIn delay={380}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  background: COLORS.bgCard,
                  borderRadius: RADIUS.lg,
                  padding: "48px 64px",
                  boxShadow: SHADOWS.cardHover,
                }}
              >
                <div style={{ fontSize: 48 }}>✅</div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.025em",
                  }}
                >
                  지원이 완료되었습니다
                </div>
              </div>
            </SpringIn>
          </AbsoluteFill>
        )}

        {/* ANIMATED CURSOR */}
        <AnimatedCursor
          positions={[
            { x: 1200, y: 520, frame: 0 },
            { x: 1200, y: 520, frame: 160, click: true },
            { x: 730, y: 480, frame: 340 },
            { x: 730, y: 480, frame: 360, click: true },
          ]}
        />

        {/* CAPTION BAR */}
        {frame < 200 && (
          <CaptionBar text="지원하기 버튼을 클릭하세요" delay={20} />
        )}
        {frame >= 380 && (
          <CaptionBar
            text="작가가 지원서를 검토하면 알림을 받습니다"
            delay={380}
          />
        )}
      </AbsoluteFill>
    </SceneWrapper>
  );
};
