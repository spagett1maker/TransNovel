# UI/UX 일관성 감사 보고서

> 작성일: 2026-02-02
> 대상: TransNovel v2 프론트엔드 전체

---

## 목차

1. [페이지 헤더 크기 불일치](#1-페이지-헤더-크기-불일치)
2. [컨테이너 max-width 불일치](#2-컨테이너-max-width-불일치)
3. [영문/한국어 혼용](#3-영문한국어-혼용)
4. [빈 상태(Empty State) 패턴 불일치](#4-빈-상태empty-state-패턴-불일치)
5. [토스트 메시지 문장부호 불일치](#5-토스트-메시지-문장부호-불일치)
6. [로딩/스피너 패턴 불일치](#6-로딩스피너-패턴-불일치)
7. [tracking-widest vs tracking-wider 혼용](#7-tracking-widest-vs-tracking-wider-혼용)

---

## 1. 페이지 헤더 크기 불일치

**문제**: 대시보드만 `text-4xl`, 나머지 페이지는 모두 `text-3xl` 사용.

| 페이지 | 파일 | 라인 | 크기 |
|--------|------|------|------|
| 대시보드 | `src/app/(dashboard)/dashboard/page.tsx` | 245 | `text-4xl` |
| 프로젝트 목록 | `src/app/(dashboard)/works/page.tsx` | 156 | `text-3xl` |
| 작품 상세 | `src/app/(dashboard)/works/[id]/page.tsx` | 162 | `text-3xl` |
| 새 프로젝트 | `src/app/(dashboard)/works/new/page.tsx` | 179 | `text-3xl` |
| 회차 업로드 | `src/app/(dashboard)/works/[id]/chapters/page.tsx` | 101 | `text-3xl` |
| 마켓플레이스 | `src/app/(dashboard)/marketplace/page.tsx` | 145 | `text-3xl` |
| 윤문가 찾기 | `src/app/(dashboard)/editors/page.tsx` | 143 | `text-3xl` |
| 내 계약 | `src/app/(dashboard)/contracts/page.tsx` | 102 | `text-3xl` |
| 내 지원 | `src/app/(dashboard)/my-applications/page.tsx` | 188 | `text-3xl` |
| 지원서 관리 | `src/app/(dashboard)/works/[id]/listings/page.tsx` | 233 | `text-3xl` |
| 내 프로필 | `src/app/(dashboard)/my-profile/page.tsx` | 304/390 | `text-3xl` |
| 설정 | `src/app/(dashboard)/settings/page.tsx` | 163 | `text-3xl` |

**권장**: 대시보드도 `text-3xl`로 통일, 또는 의도적 차별화라면 문서화.

---

## 2. 컨테이너 max-width 불일치

**문제**: 비슷한 유형의 페이지가 서로 다른 `max-w` 값을 사용.

### max-w-6xl (가장 넓음)
| 페이지 | 파일 | 라인 |
|--------|------|------|
| 대시보드 | `dashboard/page.tsx` | 230 |
| 대시보드 로딩 | `dashboard/loading.tsx` | 3 |
| 프로젝트 목록 | `works/page.tsx` | 60, 148 |
| 프로젝트 목록 로딩 | `works/loading.tsx` | 5 |
| 작품 상세 | `works/[id]/page.tsx` | 138 |
| 작품 상세 로딩 | `works/[id]/loading.tsx` | 5 |
| 회차 업로드 | `works/[id]/chapters/page.tsx` | 92 |
| 설정집 | `works/[id]/setting-bible/page.tsx` | 333, 424 |
| 번역 관리 | `works/[id]/translate/page.tsx` | 497 |

### max-w-5xl
| 페이지 | 파일 | 라인 |
|--------|------|------|
| 윤문가 찾기 | `editors/page.tsx` | 137 |
| 윤문가 찾기 로딩 | `editors/loading.tsx` | 5 |
| 마켓플레이스 | `marketplace/page.tsx` | 139 |
| 마켓플레이스 로딩 | `marketplace/loading.tsx` | 5 |
| 내 계약 | `contracts/page.tsx` | 96 |
| 내 계약 로딩 | `contracts/loading.tsx` | 5 |
| 계약 상세 | `contracts/[id]/page.tsx` | 207, 217, 232 |
| 내 지원 | `my-applications/page.tsx` | 173, 182 |
| 지원서 관리 | `works/[id]/listings/page.tsx` | 203, 212 |

### max-w-4xl
| 페이지 | 파일 | 라인 |
|--------|------|------|
| 내 프로필 (보기) | `my-profile/page.tsx` | 383 |
| 윤문가 상세 | `editors/[id]/page.tsx` | 172 |
| 마켓플레이스 상세 | `marketplace/[id]/page.tsx` | 180 |
| 번역 관리 로딩 | `works/[id]/translate/loading.tsx` | 5 |

### max-w-3xl
| 페이지 | 파일 | 라인 |
|--------|------|------|
| 새 프로젝트 | `works/new/page.tsx` | 163 |

### max-w-2xl
| 페이지 | 파일 | 라인 |
|--------|------|------|
| 내 프로필 (생성 폼) | `my-profile/page.tsx` | 302 |
| 설정 | `settings/page.tsx` | 157 |

**불일치 사례**:
- 번역 관리 페이지는 `max-w-6xl`인데, 번역 관리 loading.tsx는 `max-w-4xl`
- 목록 페이지끼리도 works는 `6xl`, editors/marketplace/contracts는 `5xl`

**권장**: 페이지 유형별 가이드라인 수립
- 데이터 테이블/카드 목록: `max-w-6xl`
- 단일 항목 상세: `max-w-5xl`
- 프로필/상세 보기: `max-w-4xl`
- 폼 페이지: `max-w-3xl`
- 설정/간단 폼: `max-w-2xl`

---

## 3. 영문/한국어 혼용

### 3-1. 페이지 상단 브레드크럼 라벨 (영문)

모든 페이지에서 `tracking-widest uppercase` 스타일의 소형 라벨이 영문으로 되어 있음.

| 영문 라벨 | 파일 | 라인 | 한국어 제목 |
|-----------|------|------|-------------|
| `Editor` / `Author` | `dashboard/page.tsx` | 241-242 | 대시보드 |
| `Projects` | `works/page.tsx` | 153-154 | 번역 프로젝트 / 담당 프로젝트 |
| `New Project` | `works/new/page.tsx` | 176-177 | 새 번역 프로젝트 |
| `Directory` | `editors/page.tsx` | 140-141 | 윤문가 찾기 |
| `Marketplace` | `marketplace/page.tsx` | 142-143 | 윤문 프로젝트 마켓 |
| `Contracts` | `contracts/page.tsx` | 99-100 | 내 계약 |
| `Applications` | `my-applications/page.tsx` | 185-186 | 내 지원 |
| `Applications` | `works/[id]/listings/page.tsx` | 230-231 | 지원서 관리 |
| `Editor Profile` | `my-profile/page.tsx` | 387-388 | (프로필 이름) |
| `Settings` | `settings/page.tsx` | 160-161 | 설정 |

**예외 - 한국어 사용 사례**:
| 한국어 라벨 | 파일 | 라인 |
|-------------|------|------|
| `포트폴리오` | `works/[id]/listings/page.tsx` | 365-366 |

### 3-2. 사이드바 섹션 라벨 (영문)

| 영문 라벨 | 파일 | 라인 | 권장 한국어 |
|-----------|------|------|-------------|
| `Menu` | `sidebar.tsx` | 122-123 | `메뉴` |
| `Account` | `sidebar.tsx` | 159-160 | `계정` |

### 3-3. 에디터 컬럼 라벨

| 라벨 | 파일 | 라인 |
|------|------|------|
| (확인 필요) | `editor/columns/OriginalColumn.tsx` | 42 |
| (확인 필요) | `editor/columns/TranslationColumn.tsx` | 66 |
| (확인 필요) | `editor/columns/EditingColumn.tsx` | 49 |
| (확인 필요) | `editor/changes/TrackChangesView.tsx` | 161 |

### 3-4. 작품 상세 페이지 섹션 라벨

| 파일 | 라인 | 스타일 |
|------|------|--------|
| `works/[id]/page.tsx` | 321, 331, 378, 402, 425 | `text-xs uppercase tracking-widest` |

**결정 필요**: 영문 브레드크럼이 **디자인 의도**인지 **실수**인지 확정 후 전체 통일.

---

## 4. 빈 상태(Empty State) 패턴 불일치

**두 가지 패턴이 혼재**:

### 패턴 A: `border-dashed` (총 15건)

```
text-center py-{N} border rounded-xl border-dashed
```

| 파일 | 라인 | 패딩 |
|------|------|------|
| `marketplace/page.tsx` | 202 | `py-20` |
| `marketplace/page.tsx` | 212 | `py-20` |
| `editors/page.tsx` | 213 | `py-20` |
| `editors/page.tsx` | 223 | `py-20` |
| `contracts/page.tsx` | 130 | `py-20` |
| `contracts/page.tsx` | 135 | `py-20` |
| `my-applications/page.tsx` | 251 | `py-20` |
| `works/[id]/listings/page.tsx` | 242 | `py-20` |
| `contracts/[id]/page.tsx` | 354 | `py-12` |
| `works/[id]/listings/page.tsx` | 293 | `py-12` |
| `my-profile/page.tsx` | 624 | `py-8` |
| `dashboard/page.tsx` | 575 | `py-8` |
| `works/page.tsx` | 341 | `border-dashed border-2` (두꺼운 테두리) |
| `stats-charts.tsx` | 395 | `h-[220px]` (차트용) |
| `stats-charts.tsx` | 428 | `h-[220px]` (차트용) |

### 패턴 B: `section-surface` (주로 작품 관련 페이지)

```
section-surface text-center py-{N} / section-surface p-{N} text-center
```

| 파일 | 라인 | 패딩 |
|------|------|------|
| `works/page.tsx` | 175 | `py-24` |
| `works/page.tsx` | 243 | `py-16` |
| `works/[id]/page.tsx` | 295 | `py-16` |
| `dashboard/page.tsx` | 610 | `py-16` |
| `works/[id]/setting-bible/page.tsx` | 344 | `p-16` |
| `works/[id]/translate/page.tsx` | 528, 534, 551, 563 | `p-12` |

**문제 요약**:
- 패딩 값이 `py-8`, `py-12`, `py-16`, `py-20`, `py-24`, `p-12`, `p-16` 으로 제각각
- 같은 목록 페이지인데 일부는 `border-dashed`, 일부는 `section-surface`
- `works/page.tsx:341`만 `border-2` (두꺼운 테두리)

**권장**: 하나의 `<EmptyState>` 컴포넌트로 추출하여 통일.

---

## 5. 토스트 메시지 문장부호 불일치

총 108건의 토스트 호출 중 문장부호 사용이 불규칙.

### 마침표 있음 (`.`) - 약 55건

```
"파일 "${file.name}"을 불러왔습니다."
"파일을 읽는데 실패했습니다."
"업로드할 회차가 없습니다."
"윤문가 할당에 실패했습니다."
"번역이 일시정지되었습니다."
"이름이 변경되었습니다."
"비밀번호가 변경되었습니다."
"인물 정보가 저장되었습니다."
"설정집 생성이 취소되었습니다."
```

### 마침표 없음 - 약 45건

```
"프로필이 생성되었습니다"
"프로필이 저장되었습니다"
"저장되었습니다"
"상태가 변경되었습니다"
"표현이 적용되었습니다"
"클립보드에 복사되었습니다"
"지원이 완료되었습니다"
"계약이 완료 처리되었습니다"
"읽기 전용 모드에서는 저장할 수 없습니다"
```

### 말줄임표 (`...`) - 2건

```
"번역을 일시정지하고 있습니다..."  (translate/page.tsx:478)
```

### 느낌표 (`!`) - 1건

```
"설정집 생성이 완료되었습니다!"  (generation-progress.tsx:272)
```

### 같은 파일 내에서도 불일치하는 사례

**`editor-assignment.tsx`**:
- L72: `"윤문가가 할당되었습니다"` (마침표 없음)
- L76: `"윤문가 할당에 실패했습니다."` (마침표 있음)
- L80: `"윤문가 할당에 실패했습니다."` (마침표 있음)
- L97: `"윤문가가 해제되었습니다"` (마침표 없음)
- L102: `"윤문가 해제에 실패했습니다."` (마침표 있음)

**`EditorProvider.tsx`**:
- L237: `"저장되었습니다"` (마침표 없음)
- L271: `"상태 변경에 실패했습니다."` (마침표 있음)
- L277: `"상태가 변경되었습니다"` (마침표 없음)

**권장**: 모든 토스트 메시지에서 마침표를 **제거**하거나 **통일**. 한국어 UI에서는 토스트처럼 짧은 알림에 마침표를 생략하는 것이 일반적.

---

## 6. 로딩/스피너 패턴 불일치

### 세 가지 스피너 패턴이 혼재

#### 패턴 A: `Loader2` 아이콘 (lucide-react) - 약 40+건
```tsx
<Loader2 className="h-4 w-4 animate-spin" />
```
사용 크기: `h-3 w-3`, `h-3.5 w-3.5`, `h-4 w-4`, `h-5 w-5`, `h-6 w-6`, `h-8 w-8`

#### 패턴 B: 커스텀 CSS 스피너 (div + border) - 약 13건
```tsx
<div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
```

사용 위치:
| 파일 | 라인 | 크기 |
|------|------|------|
| `my-profile/page.tsx` | 294 | `h-8 w-8` |
| `settings/page.tsx` | 143 | `h-8 w-8` |
| `contracts/page.tsx` | 127 | `h-8 w-8` |
| `marketplace/page.tsx` | 199 | `h-8 w-8` |
| `works/[id]/listings/page.tsx` | 205 | `h-8 w-8` |
| `works/[id]/review/page.tsx` | 457 | `h-8 w-8` |
| `auth/login/page.tsx` | 227 | `h-6 w-6` |
| `editor/versions/SnapshotPanel.tsx` | 171 | `h-5 w-5` |
| `editor/activity/ActivitySidebar.tsx` | 122 | `h-5 w-5` |
| `editor/comments/CommentSidebar.tsx` | 155 | `h-5 w-5` |

#### 패턴 C: `<Spinner />` 컴포넌트 (`src/components/ui/spinner.tsx`)
- 내부적으로 Loader2 사용
- size prop: `sm`, `default`, `lg`
- 사용 빈도 낮음

#### 패턴 D: Skeleton 로딩 (`loading.tsx` 파일들)
7개 loading.tsx 파일이 존재하며, 모두 `<Skeleton>` 컴포넌트 사용:
- `dashboard/loading.tsx`
- `works/loading.tsx`
- `works/[id]/loading.tsx`
- `works/[id]/translate/loading.tsx`
- `marketplace/loading.tsx`
- `editors/loading.tsx`
- `contracts/loading.tsx`

**없는 페이지**: `settings`, `my-profile`, `my-applications` 등에는 loading.tsx 없음.

**권장**:
- 페이지 전체 로딩: `loading.tsx` + Skeleton
- 인라인 로딩: `Loader2` 통일 (커스텀 CSS 스피너 제거)
- 누락된 loading.tsx 파일 추가

---

## 7. tracking-widest vs tracking-wider 혼용

**문제**: 동일한 디자인 패턴(소형 라벨)에 두 가지 letter-spacing 사용.

### `tracking-widest` 사용 (대다수)
- 사이드바: `sidebar.tsx:122`, `sidebar.tsx:159`
- 페이지 브레드크럼: 대시보드, 프로젝트, 마켓플레이스, 윤문가, 계약, 설정 등
- 에디터 컬럼 헤더: `OriginalColumn.tsx:42`, `TranslationColumn.tsx:66`, `EditingColumn.tsx:49`
- 설정집 차트: `stats-charts.tsx:288`

### `tracking-wider` 사용 (일부)
- 용어집 사이드바: `GlossarySidebar.tsx:65, 73, 81, 89, 98`
- AI 개선 버블: `AiImproveBubble.tsx:240`
- 캐릭터 카드 섹션 라벨: `character-card.tsx:226, 245, 255, 265, 275`
- 작품 상세 통계: `works/[id]/page.tsx:225, 229, 251, 255`

**권장**: `tracking-widest`로 통일.

---

## 수정 체크리스트

### 우선순위 높음 (사용자 경험에 직접 영향)

- [ ] 토스트 메시지 마침표 통일 (108건)
- [ ] 빈 상태 컴포넌트 추출 및 통일 (~17건)
- [ ] 사이드바 "Menu" → "메뉴", "Account" → "계정"
- [ ] 번역 관리 loading.tsx max-w 수정 (`4xl` → `6xl`)

### 우선순위 중간 (일관성 개선)

- [ ] 페이지 브레드크럼 라벨 한국어/영문 방향 결정 후 통일 (11건)
- [ ] 커스텀 CSS 스피너 → Loader2 컴포넌트로 교체 (~13건)
- [ ] 대시보드 헤더 `text-4xl` → `text-3xl` 통일
- [ ] `tracking-wider` → `tracking-widest` 통일 (~10건)
- [ ] 누락된 loading.tsx 파일 추가 (settings, my-profile, my-applications)

### 우선순위 낮음 (가이드라인 정립)

- [ ] max-w 페이지 유형별 가이드라인 문서화 및 적용
- [ ] 빈 상태 패딩 가이드라인 (목록: py-20, 내부 섹션: py-12, 소형: py-8)
- [ ] 스피너 크기 가이드라인 (버튼 내: h-4, 섹션: h-6, 전체 페이지: h-8)
