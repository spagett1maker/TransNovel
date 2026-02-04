/**
 * 번역 시스템 부하 테스트 스크립트
 *
 * 실행 방법:
 * 1. .env.local에서 DATABASE_URL 설정 확인
 * 2. npx tsx scripts/load-test.ts
 *
 * 테스트 항목:
 * - Gemini API 실제 처리량 (RPM)
 * - Cron 작업 처리 속도
 * - 동시 사용자 수용량 추정
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ============ 설정 ============
const TEST_CONFIG = {
  // Gemini API 테스트
  geminiRpmTest: {
    enabled: true,
    targetRpm: 200, // Paid tier 1000 RPM 중 200으로 테스트
    durationSec: 30, // 30초 테스트
  },
  // 시뮬레이션 설정
  simulation: {
    avgChaptersPerWork: 200, // 평균 작품당 챕터 수
    avgChapterLength: 5000, // 평균 챕터 글자 수
    translationTimePerChapter: 3, // 챕터당 평균 번역 시간 (초)
    cronIntervalSec: 60, // Cron 호출 간격
    chaptersPerCronPerJob: 50, // Cron당 작업당 처리 챕터 수 (증가: 10 → 50)
    jobsPerCron: 5, // Cron당 처리 작업 수 (증가: 3 → 5)
  },
};

// ============ Gemini API 테스트 (병렬) ============
async function testGeminiRpm(): Promise<{
  actualRpm: number;
  avgLatencyMs: number;
  errorRate: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("⚠️  GEMINI_API_KEY가 설정되지 않음. Gemini 테스트 스킵.");
    return { actualRpm: 0, avgLatencyMs: 0, errorRate: 0 };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // 병렬 테스트 설정
  const PARALLEL_BATCH_SIZE = 50; // 한 번에 보낼 병렬 요청 수
  const TOTAL_BATCHES = 4; // 총 배치 수
  const TOTAL_REQUESTS = PARALLEL_BATCH_SIZE * TOTAL_BATCHES;

  console.log(`\n🔬 Gemini API 병렬 처리량 테스트`);
  console.log(`   배치 크기: ${PARALLEL_BATCH_SIZE}개 동시 요청`);
  console.log(`   총 배치: ${TOTAL_BATCHES}회`);
  console.log(`   총 요청: ${TOTAL_REQUESTS}개\n`);

  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  // 간단한 번역 요청 (토큰 최소화)
  const testPrompt = "Translate to Korean: Hello world, this is a test.";

  for (let batch = 0; batch < TOTAL_BATCHES; batch++) {
    const batchStart = Date.now();

    // 병렬 요청 생성
    const promises = Array.from({ length: PARALLEL_BATCH_SIZE }, async (_, i) => {
      const reqStart = Date.now();
      try {
        await model.generateContent(testPrompt);
        return { success: true, latency: Date.now() - reqStart };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isRateLimit = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");
        return { success: false, latency: Date.now() - reqStart, isRateLimit };
      }
    });

    const results = await Promise.all(promises);

    let batchSuccess = 0;
    let batchError = 0;
    let rateLimitHits = 0;

    for (const result of results) {
      if (result.success) {
        batchSuccess++;
        successCount++;
        latencies.push(result.latency);
      } else {
        batchError++;
        errorCount++;
        if (result.isRateLimit) rateLimitHits++;
      }
    }

    const batchDuration = (Date.now() - batchStart) / 1000;
    const elapsed = (Date.now() - startTime) / 1000;
    const currentRpm = (successCount / elapsed) * 60;

    console.log(`   배치 ${batch + 1}/${TOTAL_BATCHES}: 성공 ${batchSuccess}/${PARALLEL_BATCH_SIZE} | ` +
      `Rate Limit: ${rateLimitHits} | 소요: ${batchDuration.toFixed(1)}초 | 누적 RPM: ${currentRpm.toFixed(0)}`);

    // 배치 간 짧은 대기 (rate limit 회피)
    if (batch < TOTAL_BATCHES - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const totalDuration = (Date.now() - startTime) / 1000;
  const actualRpm = (successCount / totalDuration) * 60;
  const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const errorRate = errorCount / TOTAL_REQUESTS;

  console.log(`\n   ✅ 테스트 완료`);
  console.log(`   - 총 소요 시간: ${totalDuration.toFixed(1)}초`);
  console.log(`   - 실제 RPM: ${actualRpm.toFixed(0)} (${successCount}개 성공)`);
  console.log(`   - 평균 응답 지연: ${avgLatencyMs.toFixed(0)}ms`);
  console.log(`   - 에러율: ${(errorRate * 100).toFixed(1)}%`);

  return { actualRpm, avgLatencyMs, errorRate };
}

// ============ 동시 사용자 시뮬레이션 ============
function simulateConcurrentUsers(geminiRpm: number) {
  const { simulation } = TEST_CONFIG;

  console.log(`\n📊 동시 사용자 수용량 시뮬레이션`);
  console.log(`   설정:`);
  console.log(`   - 평균 작품 챕터: ${simulation.avgChaptersPerWork}개`);
  console.log(`   - 챕터당 번역 시간: ~${simulation.translationTimePerChapter}초`);
  console.log(`   - Cron 간격: ${simulation.cronIntervalSec}초`);
  console.log(`   - Cron당 작업 수: ${simulation.jobsPerCron}개`);
  console.log(`   - 작업당 챕터: ${simulation.chaptersPerCronPerJob}개\n`);

  // 실제 Gemini RPM 기반 계산 (테스트 안했으면 설정값 사용)
  const effectiveRpm = geminiRpm > 0 ? geminiRpm : 800;

  // 분당 처리 가능한 총 챕터 수
  // 제약 1: Gemini API RPM
  const maxChaptersByApi = effectiveRpm; // 챕터당 1 API 호출 가정

  // 제약 2: Cron 처리량
  const cronsPerMinute = 60 / simulation.cronIntervalSec;
  const maxChaptersByCron = cronsPerMinute * simulation.jobsPerCron * simulation.chaptersPerCronPerJob;

  // 실제 처리량은 더 작은 쪽에 의해 제한
  const actualChaptersPerMinute = Math.min(maxChaptersByApi, maxChaptersByCron);

  console.log(`   처리량 분석:`);
  console.log(`   - API 제한 기준: ${maxChaptersByApi} 챕터/분`);
  console.log(`   - Cron 제한 기준: ${maxChaptersByCron} 챕터/분`);
  console.log(`   - 실제 처리량: ${actualChaptersPerMinute} 챕터/분`);
  console.log(`   - 병목: ${maxChaptersByApi < maxChaptersByCron ? "Gemini API" : "Cron 처리량"}`);

  // 동시 사용자 추정
  // 가정: 각 사용자가 평균 200챕터 작품을 번역 중
  // 1인 작품 완료 시간 = 200챕터 / 분당 처리량
  const avgWorkCompletionTime = simulation.avgChaptersPerWork / actualChaptersPerMinute;

  // 동시 활성 사용자 = 분당 처리량 / 사용자당 분당 소비 챕터
  // 사용자당 분당 소비 = 총 챕터 / 완료 시간 = actualChaptersPerMinute / 동시사용자
  // 즉, 모든 사용자가 공평하게 처리량을 나눠 갖는다고 가정

  // 시나리오별 계산
  const scenarios = [
    { name: "낙관적 (짧은 작품)", chaptersPerWork: 50 },
    { name: "평균적", chaptersPerWork: 200 },
    { name: "비관적 (긴 작품)", chaptersPerWork: 500 },
  ];

  console.log(`\n   📈 시나리오별 동시 사용자 추정:`);
  console.log(`   (목표: 1시간 내 번역 완료 기준)\n`);

  for (const scenario of scenarios) {
    // 1시간 내 완료 = 60분 * 처리량 >= 총 챕터 * 사용자 수
    // 사용자 수 <= 60분 * 처리량 / 총 챕터
    const maxUsersFor1Hour = Math.floor((60 * actualChaptersPerMinute) / scenario.chaptersPerWork);

    // 실시간 번역 (제출 즉시 시작) 가능한 사용자 수
    // = Cron당 작업 수 (대기 없이 바로 시작 가능)
    const instantUsers = simulation.jobsPerCron;

    console.log(`   ${scenario.name} (${scenario.chaptersPerWork}챕터/작품):`);
    console.log(`     - 1시간 내 완료 가능: ${maxUsersFor1Hour}명`);
    console.log(`     - 즉시 시작 가능: ${instantUsers}명`);
    console.log(`     - 예상 완료 시간: ${(scenario.chaptersPerWork / actualChaptersPerMinute).toFixed(1)}분\n`);
  }

  // 450명 동시 접속 분석
  console.log(`\n   🎯 450명 동시 접속 분석:`);
  const chaptersFor450 = 450 * simulation.avgChaptersPerWork;
  const timeFor450 = chaptersFor450 / actualChaptersPerMinute;
  console.log(`   - 총 처리 챕터: ${chaptersFor450.toLocaleString()}개`);
  console.log(`   - 모두 완료 시간: ${(timeFor450 / 60).toFixed(1)}시간`);
  console.log(`   - 평균 대기 시간: ${(timeFor450 / 450 / 2).toFixed(1)}분 (FIFO 가정)`);

  // 권장 사항
  console.log(`\n   💡 450명 지원을 위한 권장 사항:`);
  const requiredRpm = (450 * simulation.avgChaptersPerWork) / 60; // 1시간 내 완료 기준
  console.log(`   - 필요 처리량: ${requiredRpm.toFixed(0)} 챕터/분`);
  console.log(`   - 현재 처리량: ${actualChaptersPerMinute} 챕터/분`);
  console.log(`   - 개선 필요: ${requiredRpm > actualChaptersPerMinute ? "예" : "아니오"}`);

  if (requiredRpm > actualChaptersPerMinute) {
    const gap = requiredRpm - actualChaptersPerMinute;
    console.log(`\n   🔧 개선 방안:`);
    console.log(`   1. Cron 호출 빈도 증가: 1분 → 30초 (처리량 2배)`);
    console.log(`   2. 작업당 챕터 수 증가: 10 → 20개 (처리량 2배)`);
    console.log(`   3. 동시 작업 수 증가: 3 → 5개 (처리량 1.67배)`);
    console.log(`   4. 복합 적용 시: 최대 ${(actualChaptersPerMinute * 2 * 2 * 1.67).toFixed(0)} 챕터/분 가능`);
  }

  return {
    actualChaptersPerMinute,
    bottleneck: maxChaptersByApi < maxChaptersByCron ? "api" : "cron",
  };
}

// ============ 메인 ============
async function main() {
  console.log("=".repeat(60));
  console.log("  TransNovel 번역 시스템 부하 테스트");
  console.log("=".repeat(60));

  // 1. Gemini API 테스트 (선택적)
  let geminiResult = { actualRpm: 0, avgLatencyMs: 0, errorRate: 0 };
  if (TEST_CONFIG.geminiRpmTest.enabled) {
    geminiResult = await testGeminiRpm();
  } else {
    console.log("\n⏭️  Gemini API 테스트 스킵됨 (설정에서 비활성화)");
  }

  // 2. 동시 사용자 시뮬레이션
  simulateConcurrentUsers(geminiResult.actualRpm);

  console.log("\n" + "=".repeat(60));
  console.log("  테스트 완료");
  console.log("=".repeat(60));
}

main().catch(console.error);
