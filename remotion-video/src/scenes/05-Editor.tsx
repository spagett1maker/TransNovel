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
  ProductButton,
  TypingText,
} from "../components/common";
import {
  FolderOpen,
  LayoutDashboard,
  Store,
  UserCircle,
  MessageSquare,
  History,
  BookOpen,
  Activity,
  Save,
  Sparkles,
  Undo,
  Redo,
  Columns2,
  CheckCheck,
  Check,
  X,
  Loader2,
  Copy,
} from "lucide-react";

// ── Long novel text data ──

const ORIGINAL_TEXT = `三月的春风轻柔地吹过古老的庭院，带来了远方花园里淡淡的花香。瑞林静静地站在石桥之上，望着桥下清澈的溪水缓缓流淌。

月光如水般倾洒在她的白衣之上，将她整个人笼罩在一层朦胧的银色光辉之中。远处传来悠扬的箫声，仿佛在诉说着一段古老而凄美的爱情故事。

她轻轻抬起手，接住了一片从天而降的樱花花瓣。这片花瓣柔软而温暖，就像他曾经握住她的手时的感觉。那是三年前的春天，也是在这座桥上，他们第一次相遇。

"你还记得吗？"身后传来一个低沉而熟悉的声音。瑞林的身体微微一颤，缓缓转过身来。`;

const AI_TRANSLATION = `3월의 봄바람이 부드럽게 오래된 정원을 스쳐 지나며, 먼 곳 화원의 은은한 꽃향기를 실어왔다. 서린은 조용히 돌다리 위에 서서, 다리 아래 맑은 시냇물이 천천히 흘러가는 것을 바라보았다.

달빛이 물처럼 그녀의 흰 옷 위에 쏟아져 내렸고, 그녀의 온몸을 몽롱한 은빛 광채로 감싸 안았다. 멀리서 은은한 퉁소 소리가 들려왔는데, 마치 오래되고 슬프고도 아름다운 사랑 이야기를 들려주는 것 같았다.

그녀가 가볍게 손을 들어 하늘에서 떨어지는 벚꽃 꽃잎 한 장을 받아들었다. 이 꽃잎은 부드럽고 따뜻했는데, 마치 그가 한때 그녀의 손을 잡았을 때의 느낌과 같았다. 그것은 3년 전의 봄, 역시 이 다리 위에서, 그들이 처음 만났을 때였다.

"아직 기억하나요?" 뒤에서 낮고 익숙한 목소리가 들려왔다. 서린의 몸이 미세하게 떨렸고, 천천히 몸을 돌렸다.`;

// Diff segments for track changes view
const DIFF_SEGMENTS: Array<{
  text: string;
  type: "same" | "delete" | "insert";
}> = [
  { text: "3월의 봄바람이 ", type: "same" },
  { text: "부드럽게", type: "delete" },
  { text: "살며시", type: "insert" },
  { text: " 오래된 정원을 스쳐 지나며, 먼 곳 화원의 ", type: "same" },
  { text: "은은한 꽃향기를 실어왔다", type: "delete" },
  { text: "그윽한 꽃향기를 싣고 왔다", type: "insert" },
  {
    text: ". 서린은 조용히 돌다리 위에 서서, 다리 아래 맑은 시냇물이 천천히 흘러가는 것을 바라보았다.\n\n달빛이 물처럼 그녀의 흰 옷 위에 ",
    type: "same",
  },
  { text: "쏟아져 내렸고", type: "delete" },
  { text: "쏟아져 내리고", type: "insert" },
  { text: ", 그녀의 온몸을 ", type: "same" },
  { text: "몽롱한 은빛 광채로", type: "delete" },
  { text: "은은한 달빛으로", type: "insert" },
  { text: " 감싸 안았다. 멀리서 은은한 퉁소 소리가 들려왔는데, ", type: "same" },
  { text: "마치 오래되고 슬프고도 아름다운", type: "delete" },
  { text: "마치 오래고 애틋한", type: "insert" },
  {
    text: " 사랑 이야기를 들려주는 것 같았다.\n\n그녀가 ",
    type: "same",
  },
  { text: "가볍게 손을 들어", type: "delete" },
  { text: "살포시 손을 올려", type: "insert" },
  {
    text: " 하늘에서 떨어지는 벚꽃 꽃잎 한 장을 받아들었다. 이 꽃잎은 부드럽고 따뜻했는데, 마치 그가 한때 그녀의 손을 잡았을 때의 느낌과 같았다. 그것은 3년 전의 봄, 역시 이 다리 위에서, 그들이 처음 만났을 때였다.\n\n\"아직 기억하나요?\" 뒤에서 낮고 익숙한 목소리가 들려왔다. 서린의 몸이 ",
    type: "same",
  },
  { text: "미세하게", type: "delete" },
  { text: "미약하게", type: "insert" },
  { text: " 떨렸고, 천천히 몸을 돌렸다.", type: "same" },
];

// AI Suggestions
const AI_SUGGESTIONS = [
  {
    text: "살며시 불어오는",
    reason: "더 서정적이고 우아한 표현으로, 고전 소설의 문체에 적합합니다",
  },
  {
    text: "은근히 스치는",
    reason: "봄바람의 부드러움을 감각적으로 전달합니다",
  },
  {
    text: "나긋이 스쳐가는",
    reason: "바람의 움직임을 섬세하게 표현합니다",
  },
];

// Glossary data
const GLOSSARY_TERMS = [
  { source: "庭院", target: "정원", category: "지역" },
  { source: "石桥", target: "돌다리", category: "지역" },
  { source: "白衣", target: "흰 옷", category: "의상" },
  { source: "箫声", target: "퉁소 소리", category: "문화" },
  { source: "樱花", target: "벚꽃", category: "자연" },
  { source: "花瓣", target: "꽃잎", category: "자연" },
];

const GLOSSARY_CHARACTERS = [
  { name: "서린", original: "瑞林", role: "여주인공", trait: "조용하고 섬세한 성격" },
  { name: "???", original: "未知", role: "남주인공", trait: "낮고 익숙한 목소리" },
];

// Chapter data with production statuses
const CHAPTERS = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1,
  title: [
    "봄바람이 불어오는 날",
    "달빛 아래의 만남",
    "비밀의 정원",
    "첫 번째 약속",
    "흔들리는 마음",
    "잊혀진 기억",
    "다시 피어난 꽃",
    "바람의 노래",
    "별빛 아래서",
    "마지막 편지",
    "새로운 시작",
    "영원한 봄",
  ][i],
  wordCount: [3842, 4120, 3567, 4203, 3890, 4012, 3654, 3978, 4156, 3723, 4089, 3845][i],
}));

// ── Component ──

export const EditorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase controls (1080 frames total)
  const phase1 = frame < 120;
  const phase2 = frame >= 120 && frame < 280;
  const phase3 = frame >= 280 && frame < 450;
  const phase4 = frame >= 450 && frame < 620;
  const phase5 = frame >= 620 && frame < 750;
  const phase6 = frame >= 750 && frame < 900;
  const phase7 = frame >= 900;

  // UI state
  const chapterSelected = frame >= 90;
  const showThreeCol = frame >= 140;
  const showAiTrigger = frame >= 300;
  const showAiLoading = frame >= 320 && frame < 350;
  const showAiSuggestions = frame >= 350 && frame < 440;
  const showAiApplied = frame >= 440;
  const showEdits = frame >= 460;
  const showSaveToast = frame >= 540 && frame < 580;
  const showRightPanel = frame >= 480;
  const rightPanelTab: "comments" | "glossary" | "characters" =
    frame >= 680 ? "characters" : frame >= 640 ? "glossary" : "comments";
  const showTrackChanges = frame >= 770;
  const showStatusChange = frame >= 920;
  const statusChanged = frame >= 960;

  // Chapter statuses
  const getChapterStatus = (i: number): string => {
    if (i === 0) {
      if (statusChanged) return "edited";
      if (chapterSelected) return "reviewing";
      return "translated";
    }
    if (i === 1) {
      if (frame >= 1020) return "reviewing";
      return "translated";
    }
    if (i < 4) return "translated";
    return "pending";
  };

  const activeChapter = frame >= 1020 ? 1 : chapterSelected ? 0 : -1;

  // Toolbar view mode
  const viewMode: "edit" | "trackchanges" = showTrackChanges && !showStatusChange ? "trackchanges" : "edit";

  // Right panel animation
  const rightPanelWidth = showRightPanel
    ? interpolate(frame, [480, 500], [0, 280], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;

  // Scroll offset for text (simulate scrolling)
  const scrollOffset = interpolate(frame, [160, 260], [0, -20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Text selection highlight
  const showSelection = frame >= 290 && frame < 440;
  const selectionText = "부드럽게";

  // Cursor positions
  const getCursorPositions = () => {
    if (phase1) {
      return [
        { x: 500, y: 300, frame: 0 },
        { x: 160, y: 145, frame: 70 },
        { x: 160, y: 145, frame: 90, click: true },
      ];
    }
    if (phase2) {
      return [
        { x: 700, y: 300, frame: 120 },
        { x: 600, y: 250, frame: 200 },
      ];
    }
    if (phase3) {
      return [
        { x: 1200, y: 195, frame: 280 },
        { x: 1200, y: 195, frame: 295, click: true },
        { x: 1050, y: 340, frame: 380 },
        { x: 1050, y: 340, frame: 395 },
        { x: 1050, y: 368, frame: 430, click: true },
      ];
    }
    if (phase4) {
      return [
        { x: 1200, y: 300, frame: 450 },
        { x: 1100, y: 250, frame: 470 },
      ];
    }
    if (phase5) {
      return [
        { x: 1700, y: 105, frame: 620 },
        { x: 1700, y: 105, frame: 635, click: true },
        { x: 1700, y: 130, frame: 670, click: true },
      ];
    }
    if (phase6) {
      return [
        { x: 460, y: 68, frame: 750 },
        { x: 460, y: 68, frame: 765, click: true },
      ];
    }
    return [
      { x: 1700, y: 68, frame: 900 },
      { x: 1700, y: 68, frame: 920, click: true },
    ];
  };

  // Caption
  const getCaptionProps = () => {
    if (frame < 120) return { text: "챕터를 선택하여 윤문을 시작하세요", delay: 10 };
    if (frame < 280) return { text: "3단 비교 뷰로 원문, 번역문, 편집문을 동시에 확인하세요", delay: 130 };
    if (frame < 450) return { text: "텍스트를 선택하면 AI가 더 나은 표현을 제안합니다", delay: 290 };
    if (frame < 620) return { text: "수정 사항이 자동으로 저장됩니다", delay: 460 };
    if (frame < 750) return { text: "용어집으로 일관된 번역을 유지하세요", delay: 630 };
    if (frame < 900) return { text: "수정 추적으로 변경사항을 한눈에 확인하세요", delay: 760 };
    return { text: "윤문이 완료되면 상태를 변경하세요", delay: 910 };
  };

  const captionProps = getCaptionProps();

  // Status map
  const statusMap: Record<string, { variant: "pending" | "success" | "progress" | "info" | "warning"; label: string }> = {
    pending: { variant: "pending", label: "대기" },
    translated: { variant: "info", label: "번역완료" },
    reviewing: { variant: "warning", label: "윤문중" },
    edited: { variant: "success", label: "윤문완료" },
    approved: { variant: "success", label: "작가승인" },
  };

  return (
    <SceneWrapper>
      <AbsoluteFill>
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          {/* ── Mini sidebar ── */}
          <div
            style={{
              width: 50,
              background: COLORS.bgCard,
              borderRight: `1px solid ${COLORS.border}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "16px 0",
              gap: 20,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.025em" }}>TN</div>
            {[FolderOpen, LayoutDashboard, Store, UserCircle].map((Icon, i) => (
              <div
                key={i}
                style={{
                  opacity: i === 0 ? 0.9 : 0.4,
                  padding: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderLeft: i === 0 ? `3px solid ${COLORS.primary}` : "3px solid transparent",
                  marginLeft: -3,
                }}
              >
                <Icon size={18} />
              </div>
            ))}
          </div>

          {/* ── Chapter list panel ── */}
          <FadeIn delay={5}>
            <div
              style={{
                width: 224,
                height: "100%",
                background: COLORS.bgCard,
                borderRight: `1px solid ${COLORS.border}`,
                overflow: "hidden",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>검토 가능한 회차</span>
                <Badge variant="warning">12건</Badge>
              </div>
              {/* Chapter list */}
              <div style={{ padding: "6px 8px", flex: 1, overflow: "hidden" }}>
                {CHAPTERS.map((ch, i) => {
                  const status = getChapterStatus(i);
                  const isActive = i === activeChapter;
                  const delay = 10 + i * 4;
                  const f = Math.max(0, frame - delay);
                  const opacity = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
                  const s = statusMap[status];

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
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                        <span style={{ whiteSpace: "nowrap" }}>제{ch.number}화</span>
                        <span
                          style={{
                            fontSize: 10,
                            color: COLORS.textDim,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 100,
                          }}
                        >
                          {ch.wordCount.toLocaleString()}자
                        </span>
                      </div>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </FadeIn>

          {/* ── Main editor area ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* ── Toolbar ── */}
            <div
              style={{
                height: 52,
                borderBottom: `1px solid ${COLORS.border}`,
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                gap: 6,
                background: COLORS.bgCard,
                flexShrink: 0,
              }}
            >
              {/* Chapter title */}
              {chapterSelected && (
                <span style={{ fontSize: 14, fontWeight: 600, marginRight: 12 }}>
                  {activeChapter === 1 ? "제2화" : "제1화"} · {CHAPTERS[activeChapter >= 0 ? activeChapter : 0].title}
                </span>
              )}

              {/* View mode tabs */}
              <div
                style={{
                  display: "flex",
                  background: COLORS.bgMuted,
                  borderRadius: RADIUS.sm,
                  padding: 3,
                  gap: 2,
                }}
              >
                {[
                  { key: "edit", label: "편집" },
                  { key: "trackchanges", label: "수정 추적" },
                ].map((tab) => (
                  <span
                    key={tab.key}
                    style={{
                      fontSize: 12,
                      padding: "4px 12px",
                      borderRadius: RADIUS.sm - 2,
                      background: viewMode === tab.key ? COLORS.bgCard : "transparent",
                      color: viewMode === tab.key ? COLORS.text : COLORS.textDim,
                      fontWeight: viewMode === tab.key ? 500 : 400,
                      boxShadow: viewMode === tab.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    {tab.label}
                  </span>
                ))}
              </div>

              {/* Undo/Redo */}
              {chapterSelected && viewMode === "edit" && (
                <>
                  <div style={{ width: 1, height: 20, background: COLORS.border, margin: "0 4px" }} />
                  <Undo size={15} style={{ opacity: 0.3, margin: "0 4px" }} />
                  <Redo size={15} style={{ opacity: 0.3, margin: "0 4px" }} />
                </>
              )}

              <div style={{ flex: 1 }} />

              {/* Char count */}
              {chapterSelected && viewMode === "edit" && (
                <span
                  style={{
                    fontSize: 12,
                    color: COLORS.textDim,
                    fontFeatureSettings: '"tnum" 1',
                    marginRight: 8,
                  }}
                >
                  {showEdits ? "3,865" : "3,842"}자
                </span>
              )}

              {/* Sidebar toggles */}
              {chapterSelected &&
                [
                  { icon: MessageSquare, label: "댓글", active: showRightPanel && rightPanelTab === "comments" },
                  { icon: History, label: "버전", active: false },
                  { icon: Activity, label: "활동", active: false },
                  { icon: BookOpen, label: "용어집", active: showRightPanel && (rightPanelTab === "glossary" || rightPanelTab === "characters") },
                ].map((btn) => (
                  <span
                    key={btn.label}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: RADIUS.sm,
                      background: btn.active ? COLORS.bgMuted : "transparent",
                      border: `1px solid ${btn.active ? COLORS.border : "transparent"}`,
                      color: btn.active ? COLORS.text : COLORS.textDim,
                      fontWeight: btn.active ? 500 : 400,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <btn.icon size={14} /> {btn.label}
                  </span>
                ))}

              {/* Save button */}
              {chapterSelected && viewMode === "edit" && (
                <span
                  style={{
                    fontSize: 12,
                    padding: "5px 14px",
                    borderRadius: RADIUS.full,
                    background: COLORS.primary,
                    color: COLORS.primaryFg,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Save size={13} /> 저장
                </span>
              )}

              {/* Status transition button */}
              {chapterSelected && !showTrackChanges && (
                <span
                  style={{
                    fontSize: 12,
                    padding: "5px 14px",
                    borderRadius: RADIUS.full,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                    fontWeight: 500,
                    marginLeft: 4,
                  }}
                >
                  {statusChanged ? "윤문완료" : "윤문완료"}
                </span>
              )}
            </div>

            {/* ── Editor content ── */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
              {/* Track Changes View */}
              {showTrackChanges && !showStatusChange ? (
                <div style={{ flex: 1, padding: 24, overflow: "hidden" }}>
                  {/* Stats header */}
                  <FadeIn delay={775}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 20,
                        padding: "12px 16px",
                        background: COLORS.bgMuted,
                        borderRadius: RADIUS.sm,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600 }}>수정 추적</div>
                      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                        <span style={{ color: COLORS.success, fontWeight: 600 }}>+47자</span>
                        <span style={{ color: COLORS.error, fontWeight: 600 }}>-23자</span>
                        <span style={{ color: COLORS.textMuted }}>12건 변경</span>
                      </div>
                    </div>
                  </FadeIn>

                  {/* Diff content */}
                  <FadeIn delay={785}>
                    <div style={{ fontSize: 15, lineHeight: 2.2, whiteSpace: "pre-wrap" }}>
                      {DIFF_SEGMENTS.map((seg, i) => {
                        if (seg.type === "same") {
                          return <span key={i}>{seg.text}</span>;
                        }
                        if (seg.type === "delete") {
                          return (
                            <span
                              key={i}
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
                          );
                        }
                        return (
                          <span
                            key={i}
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
                        );
                      })}
                    </div>
                  </FadeIn>
                </div>
              ) : showThreeCol && chapterSelected ? (
                /* ── 3-column comparison view ── */
                <>
                  {/* Original column */}
                  <div
                    style={{
                      flex: 1,
                      borderRight: `1px solid ${COLORS.border}`,
                      background: COLORS.bgMuted,
                      padding: "16px 20px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase" as const,
                        color: COLORS.textDim,
                        letterSpacing: "0.08em",
                        marginBottom: 14,
                      }}
                    >
                      Original Text
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 2,
                        color: COLORS.textMuted,
                        whiteSpace: "pre-wrap",
                        transform: `translateY(${scrollOffset}px)`,
                      }}
                    >
                      {ORIGINAL_TEXT}
                    </div>
                  </div>

                  {/* AI Translation column */}
                  <div
                    style={{
                      flex: 1,
                      borderRight: `1px solid ${COLORS.border}`,
                      padding: "16px 20px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase" as const,
                        color: COLORS.textDim,
                        letterSpacing: "0.08em",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      AI 번역문
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 400,
                          textTransform: "none" as const,
                          color: COLORS.textDim,
                          letterSpacing: "0",
                          padding: "2px 6px",
                          background: COLORS.bgMuted,
                          borderRadius: RADIUS.full,
                        }}
                      >
                        참조용 읽기 전용
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 2,
                        color: `${COLORS.text}cc`,
                        whiteSpace: "pre-wrap",
                        transform: `translateY(${scrollOffset}px)`,
                      }}
                    >
                      {AI_TRANSLATION}
                    </div>
                  </div>

                  {/* Editing column */}
                  <div
                    style={{
                      flex: 1,
                      padding: "16px 20px",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase" as const,
                        color: COLORS.textDim,
                        letterSpacing: "0.08em",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>윤문 편집</span>
                      <span
                        style={{
                          fontWeight: 400,
                          letterSpacing: "0",
                          fontFeatureSettings: '"tnum" 1',
                        }}
                      >
                        {showEdits ? "3,865자" : "3,842자"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 2,
                        color: COLORS.text,
                        whiteSpace: "pre-wrap",
                        transform: `translateY(${scrollOffset}px)`,
                      }}
                    >
                      {showEdits ? (
                        <>
                          3월의 봄바람이{" "}
                          <span style={{ textDecoration: "line-through", color: COLORS.error, background: COLORS.errorBg, padding: "1px 3px", borderRadius: 3 }}>
                            부드럽게
                          </span>{" "}
                          <span style={{ color: COLORS.success, background: COLORS.successBg, padding: "1px 3px", borderRadius: 3 }}>
                            살며시
                          </span>{" "}
                          오래된 정원을 스쳐 지나며, 먼 곳 화원의{" "}
                          <span style={{ textDecoration: "line-through", color: COLORS.error, background: COLORS.errorBg, padding: "1px 3px", borderRadius: 3 }}>
                            은은한 꽃향기를 실어왔다
                          </span>{" "}
                          <span style={{ color: COLORS.success, background: COLORS.successBg, padding: "1px 3px", borderRadius: 3 }}>
                            그윽한 꽃향기를 싣고 왔다
                          </span>
                          . 서린은 조용히 돌다리 위에 서서, 다리 아래 맑은 시냇물이 천천히 흘러가는 것을 바라보았다.
                          {"\n\n"}달빛이 물처럼 그녀의 흰 옷 위에 쏟아져 내리고, 그녀의 온몸을 은은한 달빛으로 감싸 안았다...
                        </>
                      ) : showSelection ? (
                        <>
                          3월의 봄바람이{" "}
                          <span
                            style={{
                              background: COLORS.selection,
                              padding: "1px 2px",
                              borderRadius: 2,
                            }}
                          >
                            {selectionText}
                          </span>{" "}
                          오래된 정원을 스쳐 지나며, 먼 곳 화원의 은은한 꽃향기를 실어왔다. 서린은 조용히 돌다리 위에 서서, 다리 아래 맑은 시냇물이 천천히 흘러가는 것을 바라보았다.
                          {"\n\n"}달빛이 물처럼 그녀의 흰 옷 위에 쏟아져 내렸고, 그녀의 온몸을 몽롱한 은빛 광채로 감싸 안았다...
                        </>
                      ) : (
                        <>
                          {AI_TRANSLATION}
                        </>
                      )}
                    </div>

                    {/* AI Improve trigger button */}
                    {showAiTrigger && !showAiLoading && !showAiSuggestions && !showAiApplied && (
                      <SpringIn delay={300}>
                        <div
                          style={{
                            position: "absolute",
                            top: 78,
                            left: 100,
                            background: COLORS.bgCard,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: RADIUS.full,
                            padding: "6px 14px",
                            boxShadow: SHADOWS.cardHover,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 500,
                            color: "#7c3aed",
                            zIndex: 20,
                          }}
                        >
                          <Sparkles size={14} style={{ color: "#7c3aed" }} />
                          AI 표현 개선
                        </div>
                      </SpringIn>
                    )}

                    {/* AI Loading */}
                    {showAiLoading && (
                      <SpringIn delay={320}>
                        <div
                          style={{
                            position: "absolute",
                            top: 78,
                            left: 100,
                            background: COLORS.bgCard,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: RADIUS.card,
                            padding: "12px 16px",
                            boxShadow: SHADOWS.cardHover,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            color: COLORS.textMuted,
                            zIndex: 20,
                          }}
                        >
                          <Loader2 size={14} style={{ color: "#7c3aed" }} />
                          대안 표현 생성 중...
                          <X size={12} style={{ opacity: 0.5, marginLeft: 8 }} />
                        </div>
                      </SpringIn>
                    )}

                    {/* AI Suggestions panel */}
                    {showAiSuggestions && (
                      <SpringIn delay={350}>
                        <div
                          style={{
                            position: "absolute",
                            top: 78,
                            left: 60,
                            width: 340,
                            background: COLORS.bgCard,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: RADIUS.card,
                            boxShadow: SHADOWS.cardHover,
                            zIndex: 20,
                            overflow: "hidden",
                          }}
                        >
                          {/* Header */}
                          <div
                            style={{
                              padding: "10px 14px",
                              borderBottom: `1px solid ${COLORS.border}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#7c3aed" }}>
                              <Sparkles size={14} />
                              AI 제안
                            </div>
                            <X size={14} style={{ opacity: 0.4 }} />
                          </div>
                          {/* Suggestions */}
                          {AI_SUGGESTIONS.map((sug, i) => {
                            const sugDelay = 360 + i * 15;
                            const sugF = Math.max(0, frame - sugDelay);
                            const sugOpacity = interpolate(sugF, [0, 10], [0, 1], { extrapolateRight: "clamp" });
                            return (
                              <div
                                key={i}
                                style={{
                                  opacity: sugOpacity,
                                  padding: "10px 14px",
                                  borderBottom: i < 2 ? `1px solid ${COLORS.border}` : "none",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 10,
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{sug.text}</div>
                                  <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>{sug.reason}</div>
                                </div>
                                <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: 2 }}>
                                  <Copy size={13} style={{ opacity: 0.3 }} />
                                  <span
                                    style={{
                                      fontSize: 11,
                                      padding: "3px 10px",
                                      borderRadius: RADIUS.full,
                                      background: "#7c3aed",
                                      color: "#fff",
                                      fontWeight: 500,
                                    }}
                                  >
                                    적용
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {/* Footer */}
                          <div
                            style={{
                              padding: "6px 14px",
                              background: COLORS.bgMuted,
                              fontSize: 10,
                              color: COLORS.textDim,
                              textAlign: "center",
                            }}
                          >
                            클릭하여 적용 · 호버하여 복사
                          </div>
                        </div>
                      </SpringIn>
                    )}
                  </div>
                </>
              ) : (
                /* ── Empty / single editor view ── */
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: COLORS.textMuted,
                    fontSize: 15,
                  }}
                >
                  {chapterSelected ? (
                    <FadeIn delay={95}>
                      <div style={{ padding: 32, fontSize: 14, lineHeight: 2, whiteSpace: "pre-wrap" }}>
                        {AI_TRANSLATION}
                      </div>
                    </FadeIn>
                  ) : (
                    "회차를 선택하세요"
                  )}
                </div>
              )}

              {/* ── Right panel ── */}
              {rightPanelWidth > 0 && (
                <div
                  style={{
                    width: rightPanelWidth,
                    borderLeft: `1px solid ${COLORS.border}`,
                    background: COLORS.bgCard,
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Tab bar */}
                  <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
                    {[
                      { key: "comments", label: "댓글", icon: MessageSquare },
                      { key: "glossary", label: "용어집", icon: BookOpen },
                    ].map((tab) => {
                      const isActive =
                        (tab.key === "comments" && rightPanelTab === "comments") ||
                        (tab.key === "glossary" && (rightPanelTab === "glossary" || rightPanelTab === "characters"));
                      return (
                        <div
                          key={tab.key}
                          style={{
                            flex: 1,
                            textAlign: "center",
                            padding: "10px 0",
                            fontSize: 12,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? COLORS.text : COLORS.textDim,
                            borderBottom: isActive ? `2px solid ${COLORS.primary}` : "2px solid transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 5,
                          }}
                        >
                          <tab.icon size={13} /> {tab.label}
                        </div>
                      );
                    })}
                  </div>

                  {/* Content */}
                  <div style={{ padding: 10, flex: 1, overflow: "hidden" }}>
                    {rightPanelTab === "comments" ? (
                      <FadeIn delay={490}>
                        {[
                          { text: "\"부드럽게\"를 \"살며시\"로 변경 — 고전 소설의 서정적 문체에 더 적합합니다", author: "윤문가", time: "방금 전" },
                          { text: "용어 통일: \"은은한\" → \"그윽한\" (꽃향기 묘사 시)", author: "윤문가", time: "2분 전" },
                          { text: "전체적으로 시제를 과거형으로 통일했습니다", author: "윤문가", time: "5분 전" },
                        ].map((comment, i) => (
                          <div
                            key={i}
                            style={{
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: RADIUS.sm,
                              padding: 10,
                              marginBottom: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: RADIUS.full,
                                    background: COLORS.bgMuted,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  윤
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{comment.author}</span>
                              </div>
                              <span style={{ fontSize: 10, color: COLORS.textDim }}>{comment.time}</span>
                            </div>
                            <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
                              {comment.text}
                            </div>
                          </div>
                        ))}
                      </FadeIn>
                    ) : rightPanelTab === "glossary" ? (
                      <FadeIn delay={645}>
                        {/* Sub-tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "4px 10px",
                              borderRadius: RADIUS.full,
                              background: COLORS.primary,
                              color: COLORS.primaryFg,
                              fontWeight: 500,
                            }}
                          >
                            용어집
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "4px 10px",
                              borderRadius: RADIUS.full,
                              background: COLORS.bgMuted,
                              color: COLORS.textDim,
                            }}
                          >
                            캐릭터
                          </span>
                        </div>
                        {/* Category pills */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
                          {["전체", "지역", "의상", "문화", "자연"].map((cat, i) => (
                            <span
                              key={cat}
                              style={{
                                fontSize: 10,
                                padding: "3px 8px",
                                borderRadius: RADIUS.full,
                                background: i === 0 ? COLORS.primary : COLORS.bgMuted,
                                color: i === 0 ? COLORS.primaryFg : COLORS.textDim,
                              }}
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                        {/* Terms */}
                        {GLOSSARY_TERMS.map((item, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 8px",
                              borderBottom: `1px solid ${COLORS.border}`,
                              fontSize: 12,
                            }}
                          >
                            <span style={{ color: COLORS.textDim, minWidth: 32, fontWeight: 500 }}>{item.source}</span>
                            <span style={{ color: COLORS.textDim, fontSize: 10 }}>→</span>
                            <span style={{ color: COLORS.text, fontWeight: 500, flex: 1 }}>{item.target}</span>
                            <span
                              style={{
                                fontSize: 9,
                                padding: "2px 6px",
                                borderRadius: RADIUS.full,
                                background: COLORS.bgMuted,
                                color: COLORS.textDim,
                              }}
                            >
                              {item.category}
                            </span>
                          </div>
                        ))}
                      </FadeIn>
                    ) : (
                      <FadeIn delay={685}>
                        {/* Sub-tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "4px 10px",
                              borderRadius: RADIUS.full,
                              background: COLORS.bgMuted,
                              color: COLORS.textDim,
                            }}
                          >
                            용어집
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "4px 10px",
                              borderRadius: RADIUS.full,
                              background: COLORS.primary,
                              color: COLORS.primaryFg,
                              fontWeight: 500,
                            }}
                          >
                            캐릭터
                          </span>
                        </div>
                        {/* Characters */}
                        {GLOSSARY_CHARACTERS.map((ch, i) => (
                          <div
                            key={i}
                            style={{
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: RADIUS.sm,
                              padding: 10,
                              marginBottom: 6,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{ch.name}</span>
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: "2px 6px",
                                  borderRadius: RADIUS.full,
                                  background: COLORS.infoBg,
                                  color: COLORS.info,
                                }}
                              >
                                {ch.role}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: COLORS.textDim }}>{ch.original}</div>
                            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{ch.trait}</div>
                          </div>
                        ))}
                      </FadeIn>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Save toast ── */}
            {showSaveToast && (
              <div
                style={{
                  position: "absolute",
                  bottom: 80,
                  right: 24,
                  background: COLORS.accent,
                  color: COLORS.accentFg,
                  borderRadius: RADIUS.full,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  zIndex: 100,
                  boxShadow: SHADOWS.card,
                }}
              >
                <Check size={14} /> 저장되었습니다
              </div>
            )}

            {/* ── Status change overlay ── */}
            {showStatusChange && statusChanged && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 100,
                }}
              >
                <SpringIn delay={960}>
                  <div
                    style={{
                      background: COLORS.bgCard,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.lg,
                      padding: "24px 40px",
                      textAlign: "center",
                      boxShadow: SHADOWS.cardHover,
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>
                      <Check
                        size={32}
                        style={{ color: COLORS.success }}
                      />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                      제1화 윤문 완료
                    </div>
                    <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                      작가에게 리뷰 요청이 전송되었습니다
                    </div>
                  </div>
                </SpringIn>
              </div>
            )}
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
