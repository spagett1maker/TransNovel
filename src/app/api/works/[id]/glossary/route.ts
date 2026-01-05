import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const glossaryItemSchema = z.object({
  original: z.string().min(1, "원문을 입력해주세요."),
  translated: z.string().min(1, "번역어를 입력해주세요."),
  category: z.string().optional(),
  note: z.string().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const glossary = await db.glossaryItem.findMany({
      where: { workId: id },
      orderBy: { original: "asc" },
    });

    return NextResponse.json(glossary);
  } catch (error) {
    console.error("Failed to fetch glossary:", error);
    return NextResponse.json(
      { error: "용어집을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();

    // Handle bulk insert
    if (Array.isArray(body.items)) {
      const items = body.items.map((item: unknown) =>
        glossaryItemSchema.parse(item)
      );

      const created = await db.$transaction(
        items.map((item) =>
          db.glossaryItem.upsert({
            where: {
              workId_original: { workId: id, original: item.original },
            },
            update: {
              translated: item.translated,
              category: item.category || null,
              note: item.note || null,
            },
            create: {
              workId: id,
              original: item.original,
              translated: item.translated,
              category: item.category || null,
              note: item.note || null,
            },
          })
        )
      );

      return NextResponse.json({ created: created.length }, { status: 201 });
    }

    // Single insert
    const validatedData = glossaryItemSchema.parse(body);

    const existingItem = await db.glossaryItem.findUnique({
      where: {
        workId_original: { workId: id, original: validatedData.original },
      },
    });

    if (existingItem) {
      return NextResponse.json(
        { error: "이미 등록된 용어입니다." },
        { status: 400 }
      );
    }

    const item = await db.glossaryItem.create({
      data: {
        workId: id,
        original: validatedData.original,
        translated: validatedData.translated,
        category: validatedData.category || null,
        note: validatedData.note || null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Failed to create glossary item:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "용어 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
