import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 내 계약 목록
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role"); // 'author' or 'editor'
    const isActive = searchParams.get("isActive");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    const userRole = session.user.role as UserRole;

    // Build where clause based on user role
    let where: Record<string, unknown> = {};

    if (userRole === "AUTHOR" || role === "author") {
      where.authorId = session.user.id;
    } else if (userRole === "EDITOR" || role === "editor") {
      where.editorId = session.user.id;
    } else if (userRole === "ADMIN") {
      // Admin can see all
    } else {
      where.OR = [
        { authorId: session.user.id },
        { editorId: session.user.id },
      ];
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const [contracts, total] = await Promise.all([
      db.projectContract.findMany({
        where,
        include: {
          work: {
            select: {
              id: true,
              titleKo: true,
              coverImage: true,
              totalChapters: true,
            },
          },
          author: {
            select: { id: true, name: true, image: true },
          },
          editor: {
            select: { id: true, name: true, image: true },
          },
          listing: {
            select: { id: true, title: true },
          },
          _count: {
            select: { revisionRequests: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.projectContract.count({ where }),
    ]);

    return NextResponse.json({
      data: contracts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return NextResponse.json(
      { error: "계약 목록을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}
