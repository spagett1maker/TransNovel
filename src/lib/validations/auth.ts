import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("올바른 이메일 형식을 입력해주세요."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "이름은 2자 이상이어야 합니다.")
      .max(50, "이름은 50자 이하여야 합니다."),
    email: z.string().email("올바른 이메일 형식을 입력해주세요."),
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다.")
      .regex(
        /^(?=.*[a-zA-Z])(?=.*\d)/,
        "비밀번호는 영문과 숫자를 포함해야 합니다."
      ),
    confirmPassword: z.string(),
    role: z.enum(["AUTHOR", "EDITOR"], {
      message: "역할을 선택해주세요.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
