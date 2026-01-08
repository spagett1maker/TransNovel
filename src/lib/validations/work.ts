import { z } from "zod";

export const GENRES = [
  "BL",
  "GL",
  "SF",
  "감성",
  "개그",
  "드라마",
  "로맨스",
  "로판",
  "무협",
  "성인",
  "소년",
  "스릴러",
  "공포",
  "스포츠",
  "액션",
  "역사",
  "일상",
  "판타지",
  "학원",
  "히어로",
  "기타",
] as const;

export const AGE_RATINGS = {
  ALL: "전체연령가",
  FIFTEEN: "15세",
  NINETEEN: "19세",
} as const;

// 프로젝트 진행 상태
export const WORK_STATUS = {
  PREPARING: "등록중",      // @deprecated
  ONGOING: "번역중",        // @deprecated
  REGISTERED: "등록완료",
  TRANSLATING: "번역중",
  PROOFREADING: "윤문중",
  COMPLETED: "완료",
} as const;

// 원작 상태
export const ORIGINAL_STATUS = {
  ONGOING: "연재중",
  COMPLETED: "완결",
} as const;

// 원작 언어
export const SOURCE_LANGUAGES = {
  ZH: "중국어",
  JA: "일본어",
  EN: "영어",
  OTHER: "기타",
} as const;

export const workSchema = z.object({
  titleKo: z
    .string()
    .min(1, "한글 작품명을 입력해주세요.")
    .max(100, "작품명은 100자 이하여야 합니다."),
  titleOriginal: z
    .string()
    .min(1, "원어 작품명을 입력해주세요.")
    .max(200, "원어 작품명은 200자 이하여야 합니다."),
  publisher: z
    .string()
    .min(1, "제작사/출판사를 입력해주세요.")
    .max(100, "제작사명은 100자 이하여야 합니다."),
  ageRating: z.enum(["ALL", "FIFTEEN", "NINETEEN"]),
  synopsis: z
    .string()
    .min(10, "줄거리는 10자 이상 입력해주세요.")
    .max(2000, "줄거리는 2000자 이하여야 합니다."),
  genres: z
    .array(z.string())
    .min(1, "장르를 1개 이상 선택해주세요.")
    .max(5, "장르는 최대 5개까지 선택 가능합니다."),
  // 원작 정보
  originalStatus: z.enum(["ONGOING", "COMPLETED"]),
  sourceLanguage: z.enum(["ZH", "JA", "EN", "OTHER"]),
  expectedChapters: z.number().int().positive().optional(),
  // 원작 플랫폼
  platformName: z.string().optional(),
  platformUrl: z.string().url("올바른 URL을 입력해주세요.").optional().or(z.literal("")),
  creators: z
    .array(
      z.object({
        name: z.string().min(1, "작가명을 입력해주세요."),
        role: z.enum(["WRITER", "ARTIST", "ADAPTER"]),
      })
    )
    .min(1, "작가 정보를 1개 이상 입력해주세요."),
});

export type WorkInput = z.infer<typeof workSchema>;
