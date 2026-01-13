import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import mammoth from "mammoth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "파일이 없습니다." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let text = "";

    if (fileName.endsWith(".txt")) {
      // TXT 파일 처리
      text = await file.text();
    } else if (fileName.endsWith(".docx")) {
      // DOCX 파일 처리
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await mammoth.extractRawText({ buffer });
      text = result.value;

      // 경고 메시지 로깅 (선택사항)
      if (result.messages.length > 0) {
        console.log("[Parse File] DOCX warnings:", result.messages);
      }
    } else if (fileName.endsWith(".doc")) {
      return NextResponse.json(
        { error: ".doc 파일은 지원되지 않습니다. .docx 또는 .txt 파일을 사용해주세요." },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "지원되지 않는 파일 형식입니다. .txt 또는 .docx 파일만 지원됩니다." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "파일에 내용이 없습니다." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      text: text,
      fileName: file.name,
      fileSize: file.size,
      charCount: text.length,
    });
  } catch (error) {
    console.error("File parsing error:", error);
    return NextResponse.json(
      { error: "파일 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
