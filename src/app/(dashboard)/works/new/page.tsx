"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function NewWorkPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">새 번역 프로젝트</h1>
        <p className="text-gray-500">번역할 원작의 정보를 입력해주세요</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 기본 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
              <CardDescription>작품의 기본 정보를 입력합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="titleKo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>한글 작품명 *</FormLabel>
                      <FormControl>
                        <Input placeholder="나는 두꺼비다" {...field} />
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
                      <FormLabel>원어 작품명 *</FormLabel>
                      <FormControl>
                        <Input placeholder="老子是癞蛤蟆" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="publisher"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>제작사/출판사 *</FormLabel>
                    <FormControl>
                      <Input placeholder="출판사명 또는 판권사명" {...field} />
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
                    <FormLabel>연령등급 *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
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

              <FormField
                control={form.control}
                name="synopsis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>줄거리 *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="작품의 시놉시스를 입력해주세요"
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      번역 시 톤앤매너 설정에 활용됩니다
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* 장르 */}
          <Card>
            <CardHeader>
              <CardTitle>장르</CardTitle>
              <CardDescription>
                장르를 선택해주세요 (최대 5개)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="genres"
                render={() => (
                  <FormItem>
                    <div className="flex flex-wrap gap-2">
                      {GENRES.map((genre) => {
                        const isSelected =
                          form.watch("genres").includes(genre);
                        return (
                          <Button
                            key={genre}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleGenre(genre)}
                          >
                            {genre}
                          </Button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* 작가 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>작가 정보</CardTitle>
              <CardDescription>원작자 정보를 입력합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-4">
                  <FormField
                    control={form.control}
                    name={`creators.${index}.role`}
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
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
                          <Input placeholder="작가명" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ name: "", role: "WRITER" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                작가 추가
              </Button>
            </CardContent>
          </Card>

          {/* 원작 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>원작 정보</CardTitle>
              <CardDescription>원작의 언어와 상태를 입력합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="sourceLanguage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>원작 언어 *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="원작 언어 선택" />
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
                      <FormLabel>원작 상태 *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="원작 상태 선택" />
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
                          placeholder="완결 작품의 총 회차"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        완결 작품인 경우 입력
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* 원작 플랫폼 */}
          <Card>
            <CardHeader>
              <CardTitle>원작 플랫폼 (선택)</CardTitle>
              <CardDescription>원작이 연재된 플랫폼 정보를 입력합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="platformName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>플랫폼명</FormLabel>
                      <FormControl>
                        <Input placeholder="起点中文网, 晋江文学城 등" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="platformUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>플랫폼 URL</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="https://..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              취소
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              작품 등록
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
