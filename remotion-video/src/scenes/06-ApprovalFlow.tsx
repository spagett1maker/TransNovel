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
  ProductButton,
} from "../components/common";
import {
  CheckCircle,
  CheckCircle2,
  CheckCheck,
  XCircle,
  Eye,
  ArrowRight,
  Check,
  X,
  MessageSquare,
} from "lucide-react";

// ── Diff segments for author review ──
const REVIEW_DIFFS: Array<{
  text: string;
  type: "same" | "delete" | "insert";
  id?: number;
}> = [
  { text: "3월의 봄바람이 ", type: "same" },
  { text: "부드럽게", type: "delete", id: 1 },
  { text: "살며시", type: "insert", id: 1 },
  { text: " 오래된 정원을 스쳐 지나며, 먼 곳 화원의 ", type: "same" },
  { text: "은은한 꽃향기를 실어왔다", type: "delete", id: 2 },
  { text: "그윽한 꽃향기를 싣고 왔다", type: "insert", id: 2 },
  {
    text: ". 서린은 조용히 돌다리 위에 서서, 다리 아래 맑은 시냇물이 천천히 흘러가는 것을 바라보았다.\n\n달빛이 물처럼 그녀의 흰 옷 위에 ",
    type: "same",
  },
  { text: "쏟아져 내렸고", type: "delete", id: 3 },
  { text: "쏟아져 내리고", type: "insert", id: 3 },
  { text: ", 그녀의 온몸을 ", type: "same" },
  { text: "몽롱한 은빛 광채로", type: "delete", id: 4 },
  { text: "은은한 달빛으로", type: "insert", id: 4 },
  { text: " 감싸 안았다. 멀리서 은은한 퉁소 소리가 들려왔는데, ", type: "same" },
  { text: "마치 오래되고 슬프고도 아름다운", type: "delete", id: 5 },
  { text: "마치 오래고 애틋한", type: "insert", id: 5 },
  {
    text: " 사랑 이야기를 들려주는 것 같았다.\n\n그녀가 ",
    type: "same",
  },
  { text: "가볍게 손을 들어", type: "delete", id: 6 },
  { text: "살포시 손을 올려", type: "insert", id: 6 },
  {
    text: " 하늘에서 떨어지는 벚꽃 꽃잎 한 장을 받아들었다...",
    type: "same",
  },
];

// Chapter data for review sidebar
const REVIEW_CHAPTERS = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1,
  title: [
    "봄바람이 불어오는 날", "달빛 아래의 만남", "비밀의 정원", "첫 번째 약속",
    "흔들리는 마음", "잊혀진 기억", "다시 피어난 꽃", "바람의 노래",
    "별빛 아래서", "마지막 편지", "새로운 시작", "영원한 봄",
  ][i],
  wordCount: [3842, 4120, 3567, 4203, 3890, 4012, 3654, 3978, 4156, 3723, 4089, 3845][i],
}));

export const ApprovalFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase controls (600 frames)
  const phase1 = frame < 100;         // Author review page loads
  const phase2 = frame >= 100 && frame < 250;  // Individual accept/reject
  const phase3 = frame >= 250 && frame < 350;  // Bulk accept + approve
  const phase4 = frame >= 350 && frame < 450;  // Montage approval
  const phase5 = frame >= 450;                   // Completion

  // Accept state per change id
  const getChangeAccepted = (id: number): "undecided" | "accepted" | "rejected" => {
    if (frame >= 270) return "accepted"; // bulk accept all
    if (id === 1 && frame >= 140) return "accepted";
    if (id === 2 && frame >= 170) return "accepted";
    if (id === 3 && frame >= 200) return "accepted";
    return "undecided";
  };

  const showBulkAccept = frame >= 270;
  const showApplyDone = frame >= 290;
  const showApproveButtons = frame >= 300 && frame < 340;
  const approveClicked = frame >= 340;

  // Chapter approval progress for montage
  const getChapterApproved = (i: number): boolean => {
    if (i === 0 && approveClicked) return true;
    if (i < 3) return frame >= 370 + (i - 1) * 20;
    const threshold = 370 + (i - 1) * 12;
    return frame >= threshold;
  };

  // All approved
  const allApproved = frame >= 440;

  // Progress value
  const progressValue = allApproved
    ? 100
    : interpolate(frame, [350, 440], [8, 100], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Completion banner spring
  const bannerScale = allApproved
    ? spring({
        frame: Math.max(0, frame - 455),
        fps,
        config: { damping: 10, stiffness: 120 },
      })
    : 0;

  // Active chapter in sidebar
  const activeChapter = approveClicked ? -1 : 0;

  // Chapter status for sidebar
  const getChapterStatus = (i: number) => {
    if (getChapterApproved(i)) return "approved";
    if (i < 3) return "edited";
    return "edited";
  };

  const statusMap: Record<string, { variant: "pending" | "success" | "progress" | "info" | "warning"; label: string }> = {
    edited: { variant: "success", label: "윤문완료" },
    approved: { variant: "success", label: "작가승인" },
  };

  // Cursor positions
  const getCursorPositions = () => {
    if (phase1) {
      return [
        { x: 600, y: 300, frame: 0 },
        { x: 180, y: 145, frame: 60 },
        { x: 180, y: 145, frame: 80, click: true },
      ];
    }
    if (phase2) {
      // Click individual accept buttons
      return [
        { x: 700, y: 260, frame: 100 },
        { x: 680, y: 230, frame: 130, click: true },
        { x: 710, y: 310, frame: 160, click: true },
        { x: 690, y: 375, frame: 190, click: true },
      ];
    }
    if (phase3) {
      return [
        { x: 900, y: 125, frame: 250 },
        { x: 900, y: 125, frame: 265, click: true },
        { x: 830, y: 440, frame: 330, click: true },
      ];
    }
    return [
      { x: 600, y: 400, frame: 350 },
    ];
  };

  // Caption
  const getCaptionProps = () => {
    if (frame < 100) return { text: "작가가 윤문 결과를 확인합니다", delay: 10 };
    if (frame < 250) return { text: "개별 변경사항을 수락하거나 거절하세요", delay: 110 };
    if (frame < 350) return { text: "전체 수락 후 승인하여 챕터를 완료하세요", delay: 260 };
    if (frame < 450) return { text: "모든 챕터를 순차적으로 승인합니다", delay: 360 };
    return { text: "축하합니다! 모든 승인이 완료되었습니다", delay: 460 };
  };

  const captionProps = getCaptionProps();

  // ── RENDER ──

  // Phase 5: Completion screen (replaces editor view)
  if (allApproved) {
    return (
      <SceneWrapper>
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ maxWidth: 900, width: "100%", padding: "40px 60px" }}>
            {/* Completion banner */}
            <div
              style={{
                textAlign: "center",
                padding: "24px 0 32px",
                transform: `scale(${bannerScale})`,
              }}
            >
              {/* Green banner box */}
              <div
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: RADIUS.lg,
                  padding: "32px 48px",
                  marginBottom: 32,
                }}
              >
                <CheckCircle size={48} style={{ color: "#10b981", marginBottom: 12 }} />
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                    marginBottom: 8,
                  }}
                >
                  전체 승인 완료
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, marginBottom: 16 }}>
                  모든 회차의 승인이 완료되었습니다.
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: COLORS.info,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  프로젝트 페이지로 이동 <ArrowRight size={14} />
                </span>
              </div>
            </div>

            {/* Stats */}
            <FadeIn delay={475} slideY={20}>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                {[
                  { label: "총 수정", value: 847, suffix: "자", color: COLORS.info, delay: 480 },
                  { label: "소요 기간", value: 3, suffix: "일", color: COLORS.chart3, delay: 490, isStatic: true },
                  { label: "승인율", value: 100, suffix: "%", color: COLORS.success, delay: 500 },
                  { label: "승인 챕터", value: 12, suffix: "화", color: COLORS.chart4, delay: 510, isStatic: true },
                ].map((stat) => (
                  <SpringIn key={stat.label} delay={stat.delay}>
                    <ProjectCard style={{ padding: "20px 28px", textAlign: "center", minWidth: 160 }}>
                      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>{stat.label}</div>
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 700,
                          color: stat.color,
                          fontFeatureSettings: '"tnum" 1',
                        }}
                      >
                        {stat.isStatic ? (
                          `${stat.value}${stat.suffix}`
                        ) : (
                          <Counter from={0} to={stat.value} delay={stat.delay} duration={40} suffix={stat.suffix} />
                        )}
                      </div>
                    </ProjectCard>
                  </SpringIn>
                ))}
              </div>
            </FadeIn>
          </div>

          <CaptionBar text={captionProps.text} delay={captionProps.delay} />
        </AbsoluteFill>
      </SceneWrapper>
    );
  }

  // Phases 1-4: Author review page
  return (
    <SceneWrapper>
      <AbsoluteFill>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* ── Top header bar ── */}
          <FadeIn delay={5}>
            <div
              style={{
                padding: "16px 32px",
                borderBottom: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  ← 프로젝트 목록
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em" }}>달빛 아래 피어난 꽃</span>
                  <span style={{ fontSize: 13, color: COLORS.textDim }}>月光下绽放的花</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!approveClicked && (
                  <Badge variant="warning">
                    검토 대기 {approveClicked ? 0 : frame >= 340 ? 0 : frame >= 200 ? 9 : 12}건
                  </Badge>
                )}
                {/* Progress bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ProgressBar
                    progress={progressValue}
                    color={COLORS.success}
                    width={160}
                    height={6}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: COLORS.success,
                      fontFeatureSettings: '"tnum" 1',
                    }}
                  >
                    {Math.round(progressValue)}%
                  </span>
                </div>
              </div>
            </div>
          </FadeIn>

          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* ── Chapter list sidebar ── */}
            <FadeIn delay={10}>
              <div
                style={{
                  width: 224,
                  borderRight: `1px solid ${COLORS.border}`,
                  background: COLORS.bgCard,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: `1px solid ${COLORS.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS.textMuted,
                  }}
                >
                  검토 가능한 회차
                </div>
                <div style={{ padding: "4px 6px", flex: 1, overflow: "hidden" }}>
                  {REVIEW_CHAPTERS.map((ch, i) => {
                    const isApproved = getChapterApproved(i);
                    const status = isApproved ? "approved" : "edited";
                    const isActive = i === activeChapter;
                    const s = statusMap[status];
                    const delay = 15 + i * 3;
                    const f = Math.max(0, frame - delay);
                    const opacity = interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" });

                    return (
                      <div
                        key={i}
                        style={{
                          opacity,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          borderRadius: RADIUS.sm,
                          fontSize: 12,
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? COLORS.text : COLORS.textMuted,
                          background: isActive ? COLORS.bgMuted : "transparent",
                          marginBottom: 1,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span>제{ch.number}화</span>
                          <span style={{ fontSize: 10, color: COLORS.textDim }}>{ch.wordCount.toLocaleString()}자</span>
                        </div>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </FadeIn>

            {/* ── Main review area ── */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Read-only banner */}
              <FadeIn delay={20}>
                <div
                  style={{
                    margin: "16px 24px 0",
                    padding: "10px 16px",
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: RADIUS.sm,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  <Eye size={16} style={{ color: "#b45309", flexShrink: 0 }} />
                  <div>
                    <span style={{ fontWeight: 600, color: "#b45309" }}>읽기 전용 모드</span>
                    <span style={{ color: "#92400e" }}> — 댓글과 승인/반려만 가능합니다</span>
                  </div>
                </div>
              </FadeIn>

              {/* Toolbar */}
              <div
                style={{
                  padding: "10px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, marginRight: 8 }}>
                  제1화 · 봄바람이 불어오는 날
                </span>

                {/* View mode - track changes active */}
                <div
                  style={{
                    display: "flex",
                    background: COLORS.bgMuted,
                    borderRadius: RADIUS.sm,
                    padding: 3,
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 12px",
                      borderRadius: RADIUS.sm - 2,
                      background: "transparent",
                      color: COLORS.textDim,
                    }}
                  >
                    편집
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 12px",
                      borderRadius: RADIUS.sm - 2,
                      background: COLORS.bgCard,
                      color: COLORS.text,
                      fontWeight: 500,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    }}
                  >
                    수정 추적
                  </span>
                </div>

                <div style={{ flex: 1 }} />

                {/* Stats */}
                <div style={{ display: "flex", gap: 12, fontSize: 12, marginRight: 8 }}>
                  <span style={{ color: COLORS.success, fontWeight: 600 }}>+47자</span>
                  <span style={{ color: COLORS.error, fontWeight: 600 }}>-23자</span>
                  <span style={{ color: COLORS.textMuted }}>7건 변경</span>
                </div>

                {/* Bulk action buttons (for author) */}
                {!showBulkAccept && (
                  <>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "5px 12px",
                        borderRadius: RADIUS.full,
                        border: `1px solid ${COLORS.success}40`,
                        color: COLORS.success,
                        fontWeight: 500,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <CheckCheck size={14} /> 전체 수락
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "5px 12px",
                        borderRadius: RADIUS.full,
                        border: `1px solid ${COLORS.error}40`,
                        color: COLORS.error,
                        fontWeight: 500,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <XCircle size={14} /> 전체 거절
                    </span>
                  </>
                )}
              </div>

              {/* ── Diff content ── */}
              <div style={{ flex: 1, padding: "20px 32px", overflow: "hidden" }}>
                {showApplyDone && !approveClicked ? (
                  /* Applied message + next step buttons */
                  <FadeIn delay={290}>
                    <div style={{ textAlign: "center", paddingTop: 80 }}>
                      <CheckCheck size={40} style={{ color: COLORS.success, marginBottom: 12 }} />
                      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                        변경사항이 적용되었습니다
                      </div>
                      <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 24 }}>
                        다음 단계를 선택하세요
                      </div>
                      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                        <ProductButton
                          style={{
                            background: COLORS.success,
                            color: "#fff",
                          }}
                        >
                          <Check size={16} /> 승인
                        </ProductButton>
                        <ProductButton variant="outline">
                          재윤문 요청
                        </ProductButton>
                      </div>
                    </div>
                  </FadeIn>
                ) : !showApplyDone ? (
                  /* Diff text with inline accept/reject buttons */
                  <FadeIn delay={30}>
                    <div style={{ fontSize: 15, lineHeight: 2.2, whiteSpace: "pre-wrap" }}>
                      {REVIEW_DIFFS.map((seg, i) => {
                        if (seg.type === "same") {
                          return <span key={i}>{seg.text}</span>;
                        }

                        const changeState = seg.id ? getChangeAccepted(seg.id) : "undecided";

                        if (seg.type === "delete") {
                          if (changeState === "accepted") {
                            // Accepted deletion — show faded strikethrough
                            return (
                              <span
                                key={i}
                                style={{
                                  textDecoration: "line-through",
                                  color: `${COLORS.error}80`,
                                  background: `${COLORS.errorBg}60`,
                                  padding: "1px 3px",
                                  borderRadius: 3,
                                }}
                              >
                                {seg.text}
                              </span>
                            );
                          }
                          return (
                            <span key={i} style={{ position: "relative", display: "inline" }}>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: COLORS.error,
                                  background: COLORS.errorBg,
                                  padding: "1px 3px",
                                  borderRadius: 3,
                                }}
                              >
                                {seg.text}
                              </span>
                            </span>
                          );
                        }

                        // insert
                        if (changeState === "accepted") {
                          return (
                            <span key={i} style={{ position: "relative", display: "inline" }}>
                              <span
                                style={{
                                  color: `${COLORS.success}cc`,
                                  background: `${COLORS.successBg}80`,
                                  padding: "1px 3px",
                                  borderRadius: 3,
                                }}
                              >
                                {seg.text}
                              </span>
                              {/* Accepted checkmark */}
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 16,
                                  height: 16,
                                  borderRadius: RADIUS.full,
                                  background: COLORS.success,
                                  marginLeft: 3,
                                  verticalAlign: "middle",
                                }}
                              >
                                <Check size={10} style={{ color: "#fff" }} />
                              </span>
                            </span>
                          );
                        }

                        return (
                          <span key={i} style={{ position: "relative", display: "inline" }}>
                            <span
                              style={{
                                textDecoration: "underline",
                                textDecorationColor: COLORS.success,
                                color: COLORS.success,
                                background: COLORS.successBg,
                                padding: "1px 3px",
                                borderRadius: 3,
                              }}
                            >
                              {seg.text}
                            </span>
                            {/* Accept/reject buttons inline */}
                            <span
                              style={{
                                display: "inline-flex",
                                gap: 2,
                                marginLeft: 3,
                                verticalAlign: "middle",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 18,
                                  height: 18,
                                  borderRadius: RADIUS.full,
                                  background: COLORS.successBg,
                                  border: `1px solid ${COLORS.success}40`,
                                }}
                              >
                                <Check size={10} style={{ color: COLORS.success }} />
                              </span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 18,
                                  height: 18,
                                  borderRadius: RADIUS.full,
                                  background: COLORS.errorBg,
                                  border: `1px solid ${COLORS.error}40`,
                                }}
                              >
                                <X size={10} style={{ color: COLORS.error }} />
                              </span>
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </FadeIn>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Cursor */}
        <AnimatedCursor positions={getCursorPositions()} />

        {/* Caption */}
        <CaptionBar text={captionProps.text} delay={captionProps.delay} />
      </AbsoluteFill>
    </SceneWrapper>
  );
};
