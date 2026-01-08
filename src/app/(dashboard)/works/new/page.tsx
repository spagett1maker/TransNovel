"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGE_RATINGS,
  GENRES,
  ORIGINAL_STATUS,
  SOURCE_LANGUAGES,
  workSchema,
  type WorkInput,
} from "@/lib/validations/work";

type Step = "basic" | "details" | "creators";

const STEPS: { key: Step; label: string; description: string }[] = [
  { key: "basic", label: "기본 정보", description: "작품명과 줄거리" },
  { key: "details", label: "상세 정보", description: "장르와 원작 정보" },
  { key: "creators", label: "작가 정보", description: "원작자와 플랫폼" },
];

export default function NewWorkPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("basic");

  const form = useForm<WorkInput>({
    resolver: zodResolver(workSchema),
    defaultValues: {
      titleKo: "",
      titleOriginal: "",
      publisher: "",
      ageRating: "ALL",
      synopsis: "",
      genres: [],
      originalStatus: "COMPLETED",
      sourceLanguage: "ZH",
      expectedChapters: undefined,
      platformName: "",
      platformUrl: "",
      creators: [{ name: "", role: "WRITER" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "creators",
  });

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  async function onSubmit(data: WorkInput) {
    setIsLoading(true);

    try {
      const response = await fetch("/api/works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "작품 등록에 실패했습니다.");
      }

      const work = await response.json();
      toast.success("작품이 등록되었습니다.");
      router.push(`/works/${work.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "작품 등록에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const toggleGenre = (genre: string) => {
    const current = form.getValues("genres");
    if (current.includes(genre)) {
      form.setValue(
        "genres",
        current.filter((g) => g !== genre)
      );
    } else if (current.length < 5) {
      form.setValue("genres", [...current, genre]);
    }
  };

  const goToStep = (step: Step) => {
    setCurrentStep(step);
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].key);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key);
    }
  };

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <Link
          href="/works"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 프로젝트 목록
        </Link>
      </nav>

      {/* Header */}
      <header className="pb-10 border-b border-border mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          New Project
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          새 번역 프로젝트
        </h1>
        <p className="text-lg text-muted-foreground">
          번역할 원작의 정보를 입력해주세요
        </p>
      </header>

      {/* Step Indicator */}
      <div className="flex gap-2 mb-10">
        {STEPS.map((step, index) => {
          const isActive = step.key === currentStep;
          const isPast = index < currentStepIndex;

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => goToStep(step.key)}
              className={`flex-1 text-left p-4 rounded-xl transition-all ${
                isActive
                  ? "bg-foreground text-background"
                  : isPast
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground"
              }`}
            >
              <p className={`text-xs mb-1 ${isActive ? "opacity-70" : ""}`}>
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="font-medium text-sm">{step.label}</p>
            </button>
          );
        })}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* Step 1: Basic Info */}
          {currentStep === "basic" && (
            <div className="space-y-8">
              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  작품명
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="titleKo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>한글 작품명</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="번역될 한글 제목"
                            className="h-12"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="titleOriginal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>원어 작품명</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="원작의 원어 제목"
                            className="h-12"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  줄거리
                </h2>
                <FormField
                  control={form.control}
                  name="synopsis"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder="작품의 시놉시스를 입력해주세요. 번역 시 톤앤매너 설정에 활용됩니다."
                          className="min-h-[160px] text-base leading-relaxed"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  기본 설정
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="publisher"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>제작사/출판사</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="출판사명 또는 판권사명"
                            className="h-12"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ageRating"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>연령등급</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="연령등급 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(AGE_RATINGS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </div>
          )}

          {/* Step 2: Details */}
          {currentStep === "details" && (
            <div className="space-y-8">
              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  장르 (최대 5개)
                </h2>
                <FormField
                  control={form.control}
                  name="genres"
                  render={() => (
                    <FormItem>
                      <div className="flex flex-wrap gap-2">
                        {GENRES.map((genre) => {
                          const isSelected = form.watch("genres").includes(genre);
                          return (
                            <button
                              key={genre}
                              type="button"
                              onClick={() => toggleGenre(genre)}
                              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                                isSelected
                                  ? "bg-foreground text-background"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {genre}
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  원작 정보
                </h2>
                <div className="grid gap-6 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="sourceLanguage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>원작 언어</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="언어 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(SOURCE_LANGUAGES).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="originalStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>연재 상태</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="상태 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(ORIGINAL_STATUS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expectedChapters"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>총 회차</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="완결 시"
                            className="h-12"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? parseInt(e.target.value) : undefined
                              )
                            }
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormDescription>완결 작품인 경우</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </div>
          )}

          {/* Step 3: Creators */}
          {currentStep === "creators" && (
            <div className="space-y-8">
              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  원작자
                </h2>
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex gap-3">
                      <FormField
                        control={form.control}
                        name={`creators.${index}.role`}
                        render={({ field }) => (
                          <FormItem className="w-28">
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-12">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="WRITER">글</SelectItem>
                                <SelectItem value="ARTIST">그림</SelectItem>
                                <SelectItem value="ADAPTER">각색</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`creators.${index}.name`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                placeholder="작가명"
                                className="h-12"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-12 px-4 text-muted-foreground hover:text-foreground"
                          onClick={() => remove(index)}
                        >
                          삭제
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: "", role: "WRITER" })}
                    className="mt-2"
                  >
                    + 작가 추가
                  </Button>
                </div>
              </section>

              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                  원작 플랫폼 (선택)
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="platformName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>플랫폼명</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="起点中文网, 晋江文学城 등"
                            className="h-12"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="platformUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://..."
                            className="h-12"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-12 pt-8 border-t border-border">
            <div>
              {currentStepIndex > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goPrev}
                >
                  ← 이전
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                취소
              </Button>
              {currentStepIndex < STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  다음 →
                </Button>
              ) : (
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "등록 중..." : "프로젝트 등록"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
