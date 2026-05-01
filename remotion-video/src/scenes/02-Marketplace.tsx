import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, FadeIn, SceneWrapper, AnimatedCursor, CaptionBar, Badge } from "../components/common";
import { AppSidebar, PageLayout } from "../components/app-ui";
import { Search, Filter, Calendar, Users, ChevronDown } from "lucide-react";

const LISTINGS = [
  {
    title: "달빛 아래 피어난 꽃",
    workTitle: "月光下绽放的花",
    description: "중국 고전 로맨스 소설의 한국어 윤문. 서정적 문체와 시적 표현 감수 필요.",
    range: "1-50화",
    budget: "₩2,500,000",
    deadline: "3일 남음",
    deadlineUrgent: true,
    genres: ["로맨스", "고전"],
    language: "중국어",
    applicants: 3,
  },
  {
    title: "무한의 검",
    workTitle: "无尽之剑",
    description: "무협 판타지 소설 윤문. 전투 장면과 무공 용어 전문 감수 필요.",
    range: "1-80화",
    budget: "₩3,800,000",
    deadline: "7일 남음",
    deadlineUrgent: false,
    genres: ["무협", "판타지"],
    language: "중국어",
    applicants: 5,
  },
  {
    title: "도시의 그림자",
    workTitle: "都市的阴影",
    description: "현대 미스터리 스릴러. 긴장감 있는 문체와 복선 처리 감수 필요.",
    range: "1-30화",
    budget: "₩1,200,000",
    deadline: "14일 남음",
    deadlineUrgent: false,
    genres: ["미스터리", "스릴러"],
    language: "중국어",
    applicants: 1,
  },
];

export const Marketplace: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneWrapper>
      <AbsoluteFill>
        <PageLayout
          sidebar={<AppSidebar activeItem="marketplace" />}
        >
          <div style={{ padding: "32px 32px", maxWidth: 1152 }}>
            {/* Page Header */}
            <FadeIn delay={5}>
              <header style={{ marginBottom: 32 }}>
                <p
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: COLORS.textMuted,
                    marginBottom: 12,
                  }}
                >
                  Marketplace
                </p>
                <h1
                  style={{
                    fontSize: 36,
                    fontWeight: 600,
                    letterSpacing: "-0.025em",
                    color: COLORS.text,
                    margin: "0 0 8px 0",
                  }}
                >
                  윤문 프로젝트 마켓
                </h1>
                <p style={{ fontSize: 16, color: COLORS.textMuted }}>
                  작가들이 올린 윤문 프로젝트에 지원하세요
                </p>
              </header>
            </FadeIn>

            {/* Filter bar */}
            <FadeIn delay={15}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                  <Search size={16} style={{ position: "absolute", left: 16, color: COLORS.textDim }} />
                  <div
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 16,
                      border: `1px solid ${COLORS.border}`,
                      paddingLeft: 44,
                      paddingRight: 16,
                      fontSize: 14,
                      color: COLORS.textDim,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    프로젝트 또는 작품 검색...
                  </div>
                </div>
                <div
                  style={{
                    height: 48, borderRadius: 16, border: `1px solid ${COLORS.border}`,
                    padding: "0 16px", fontSize: 14, color: COLORS.textMuted,
                    display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  }}
                >
                  전체 장르 <ChevronDown size={16} style={{ opacity: 0.5 }} />
                </div>
                <div
                  style={{
                    height: 48, borderRadius: 16, border: `1px solid ${COLORS.border}`,
                    padding: "0 16px", fontSize: 14, color: COLORS.textMuted,
                    display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  }}
                >
                  최신순 <ChevronDown size={16} style={{ opacity: 0.5 }} />
                </div>
                <div
                  style={{
                    height: 48, borderRadius: 16, background: COLORS.primary, color: COLORS.primaryFg,
                    padding: "0 20px", fontSize: 14, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  }}
                >
                  <Filter size={16} /> 검색
                </div>
              </div>
            </FadeIn>

            {/* Listing cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {LISTINGS.map((listing, i) => (
                <FadeIn key={listing.title} delay={30 + i * 15}>
                  <div
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      padding: 24,
                      background: COLORS.bgCard,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{listing.title}</div>
                        <div style={{ fontSize: 13, color: COLORS.textDim }}>{listing.workTitle}</div>
                      </div>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                          color: listing.deadlineUrgent ? COLORS.error : COLORS.textMuted,
                          padding: "4px 10px", borderRadius: 999,
                          background: listing.deadlineUrgent ? COLORS.errorBg : COLORS.bgMuted,
                        }}
                      >
                        <Calendar size={12} /> {listing.deadline}
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: COLORS.textMuted, margin: "12px 0 16px", lineHeight: 1.6 }}>
                      {listing.description}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: COLORS.textMuted }}>
                        <span>{listing.range}</span>
                        <span>·</span>
                        <span style={{ fontWeight: 500, color: COLORS.text }}>{listing.budget}</span>
                        <span>·</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Users size={13} /> {listing.applicants}명 지원
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Badge variant="info">{listing.language}</Badge>
                        {listing.genres.map((g) => (
                          <Badge key={g} variant="secondary">{g}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </PageLayout>

        <AnimatedCursor
          positions={[
            { x: 800, y: 200, frame: 0 },
            { x: 700, y: 350, frame: 300 },
            { x: 700, y: 350, frame: 380, click: true },
          ]}
        />
        <CaptionBar text="관심있는 프로젝트를 클릭하세요" delay={60} />
      </AbsoluteFill>
    </SceneWrapper>
  );
};
