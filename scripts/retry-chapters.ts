import { db } from "../src/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function translateWithFallback(content: string): Promise<string> {
  // 여러 모델 시도
  const models = ["gemini-2.0-flash", "gemini-2.5-flash"];

  for (const modelName of models) {
    try {
      console.log(`  모델 ${modelName} 시도 중...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ] as any
      });

      const prompt = `다음 중국어 웹소설을 한국어로 자연스럽게 번역해주세요.
번역만 출력하고, 다른 설명은 하지 마세요.

원문:
${content}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (text && text.length > 100) {
        console.log(`  ${modelName} 성공!`);
        return text;
      }
    } catch (error) {
      console.log(`  ${modelName} 실패:`, error instanceof Error ? error.message : error);
    }
  }

  throw new Error("모든 모델 실패");
}

async function main() {
  const work = await db.work.findFirst({
    where: { titleKo: { contains: "현민" } }
  });

  if (!work) {
    console.log("작품을 찾을 수 없음");
    return;
  }

  const chapters = await db.chapter.findMany({
    where: {
      workId: work.id,
      number: { in: [553, 571] }
    },
    select: { id: true, number: true, originalContent: true }
  });

  for (const chapter of chapters) {
    console.log(`\n챕터 ${chapter.number} 번역 시작...`);
    try {
      const translated = await translateWithFallback(chapter.originalContent);

      await db.chapter.update({
        where: { id: chapter.id },
        data: {
          translatedContent: translated,
          status: "TRANSLATED"
        }
      });

      console.log(`챕터 ${chapter.number} 번역 완료 ✓`);
    } catch (error) {
      console.error(`챕터 ${chapter.number} 실패:`, error instanceof Error ? error.message : error);
    }
  }

  // 최종 확인
  const translatedCount = await db.chapter.count({
    where: {
      workId: work.id,
      status: { in: ["TRANSLATED", "EDITED", "APPROVED"] }
    }
  });

  console.log(`\n최종 결과: ${translatedCount}/${work.totalChapters}`);

  await db.$disconnect();
}

main();
