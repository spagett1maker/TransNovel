import { z } from "zod";

export const preferencesSchema = z.object({
  editorBgColor: z.string().max(20).optional(),
  savedColors: z.array(z.string().max(20)).max(8).optional(),
  editorFontSize: z.number().int().min(12).max(24).optional(),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;
