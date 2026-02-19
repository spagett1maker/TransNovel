import { z } from "zod";

export const translationRequestSchema = z.object({
  workId: z.string().min(1, "작품 ID가 필요합니다."),
  chapterNumbers: z
    .array(
      z
        .number()
        .int("챕터 번호는 정수여야 합니다.")
        .nonnegative("챕터 번호는 0 이상이어야 합니다.")
        .max(10000, "챕터 번호는 10000 이하여야 합니다.")
    )
    .min(1, "최소 1개 이상의 챕터를 선택해야 합니다.")
    .max(10000, "한 번에 최대 10000개 챕터까지 선택할 수 있습니다."),
  force: z.boolean().optional(),
});

export type TranslationRequest = z.infer<typeof translationRequestSchema>;
