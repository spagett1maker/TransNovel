import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole, EditorAvailability } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 내 윤문가 프로필 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const profile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        portfolioItems: {
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: {
            applications: true,
            reviews: true,
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error fetching editor profile:", error);
    return NextResponse.json(
      { error: "프로필을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// POST - 윤문가 프로필 생성
const createProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(2000).optional(),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
  specialtyGenres: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  availability: z.nativeEnum(EditorAvailability).optional(),
  maxConcurrent: z.number().int().min(1).max(10).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // 윤문가 역할이 필요 (또는 ADMIN)
    const userRole = session.user.role as UserRole;
    if (userRole !== "EDITOR" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "윤문가만 프로필을 생성할 수 있습니다" },
        { status: 403 }
      );
    }

    // 이미 프로필이 있는지 확인
    const existingProfile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (existingProfile) {
      return NextResponse.json(
        { error: "이미 프로필이 존재합니다. PATCH를 사용해주세요" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = createProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const profile = await db.editorProfile.create({
      data: {
        userId: session.user.id,
        displayName: parsed.data.displayName || session.user.name || "",
        bio: parsed.data.bio,
        portfolioUrl: parsed.data.portfolioUrl || null,
        specialtyGenres: parsed.data.specialtyGenres,
        languages: parsed.data.languages,
        availability: parsed.data.availability || EditorAvailability.AVAILABLE,
        maxConcurrent: parsed.data.maxConcurrent || 3,
      },
      include: {
        portfolioItems: true,
      },
    });

    revalidateTag(`editor-profile-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    console.error("Error creating editor profile:", error);
    return NextResponse.json(
      { error: "프로필 생성에 실패했습니다" },
      { status: 500 }
    );
  }
}

// PATCH - 윤문가 프로필 수정
const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(2000).optional(),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
  specialtyGenres: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  availability: z.nativeEnum(EditorAvailability).optional(),
  maxConcurrent: z.number().int().min(1).max(10).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const existingProfile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: "프로필이 존재하지 않습니다. POST를 사용해주세요" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
    if (parsed.data.bio !== undefined) updateData.bio = parsed.data.bio;
    if (parsed.data.portfolioUrl !== undefined) {
      updateData.portfolioUrl = parsed.data.portfolioUrl || null;
    }
    if (parsed.data.specialtyGenres !== undefined) updateData.specialtyGenres = parsed.data.specialtyGenres;
    if (parsed.data.languages !== undefined) updateData.languages = parsed.data.languages;
    if (parsed.data.availability !== undefined) updateData.availability = parsed.data.availability;
    if (parsed.data.maxConcurrent !== undefined) updateData.maxConcurrent = parsed.data.maxConcurrent;

    const profile = await db.editorProfile.update({
      where: { userId: session.user.id },
      data: updateData,
      include: {
        portfolioItems: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    revalidateTag(`editor-profile-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error updating editor profile:", error);
    return NextResponse.json(
      { error: "프로필 수정에 실패했습니다" },
      { status: 500 }
    );
  }
}
