import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});
