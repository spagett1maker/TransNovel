"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PenTool, Edit3, Loader2, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const emailCheckTimer = useRef<NodeJS.Timeout | null>(null);

  // 타이머 클린업 (unmount 시 메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    };
  }, []);

  const checkEmailAvailability = useCallback(async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus("idle");
      return;
    }
    setEmailStatus("checking");
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setEmailStatus(data.available ? "available" : "taken");
    } catch {
      setEmailStatus("idle");
    }
  }, []);

  const handleEmailChange = useCallback(
    (value: string) => {
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
      setEmailStatus("idle");
      emailCheckTimer.current = setTimeout(() => {
        checkEmailAvailability(value);
      }, 600);
    },
    [checkEmailAvailability]
  );

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "AUTHOR",
    },
  });

  async function onSubmit(data: RegisterInput) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error || "회원가입에 실패했습니다.");
        return;
      }

      const result = await response.json();

      router.push("/login?registered=true");
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">회원가입</CardTitle>
        <CardDescription>
          TransNovel에 가입하고 AI 번역을 시작하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이름</FormLabel>
                  <FormControl>
                    <Input placeholder="홍길동" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="email@example.com"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          handleEmailChange(e.target.value);
                        }}
                      />
                      {emailStatus !== "idle" && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {emailStatus === "checking" && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {emailStatus === "available" && (
                            <CheckCircle className="h-4 w-4 text-status-success" />
                          )}
                          {emailStatus === "taken" && (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  {emailStatus === "taken" && (
                    <p className="text-sm text-destructive">이미 등록된 이메일입니다.</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비밀번호</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비밀번호 확인</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>역할 선택</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-3">
                      <Label
                        htmlFor="role-author"
                        className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          field.value === "AUTHOR"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          id="role-author"
                          value="AUTHOR"
                          checked={field.value === "AUTHOR"}
                          onChange={() => field.onChange("AUTHOR")}
                          className="sr-only"
                        />
                        <PenTool className="h-6 w-6 mb-2 text-primary" />
                        <span className="font-medium">작가</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          원고 등록 및 번역 요청
                        </span>
                      </Label>
                      <Label
                        htmlFor="role-editor"
                        className={`flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          field.value === "EDITOR"
                            ? "border-accent-foreground bg-accent"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          id="role-editor"
                          value="EDITOR"
                          checked={field.value === "EDITOR"}
                          onChange={() => field.onChange("EDITOR")}
                          className="sr-only"
                        />
                        <Edit3 className="h-6 w-6 mb-2 text-accent-foreground" />
                        <span className="font-medium">윤문가</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          번역본 검토 및 수정
                        </span>
                      </Label>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading || emailStatus === "taken" || emailStatus === "checking"}>
              {isLoading && <ButtonSpinner />}
              회원가입
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-foreground font-medium hover:underline">
            로그인
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
