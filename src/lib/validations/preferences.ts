import { z } from "zod";

export const preferencesSchema = z.object({
  editorBgColor: z.string().max(20).optional(),
  savedColors: z.array(z.string().max(20)).max(8).optional(),
  editorFontSize: z.number().int().min(12).max(24).optional(),
  editorLineHeight: z.number().min(1).max(3).optional(),
  editorPadding: z.number().int().min(0).max(120).optional(),
  showParagraphMarks: z.boolean().optional(),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;
