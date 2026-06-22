# AIVA Project Instructions

이 문서는 `ai-marketing` 프로젝트에 적용되는 프로젝트 스코프 지침이다. 전역 지침보다 이 문서를 우선한다.

## 프로젝트 개요

- 제품명: AIVA — AI Marketing Platform
- 목적: 마케팅 실무자가 AI 검색 노출, 블로그, 플레이스, 이미지 생성 등 마케팅 작업을 순차적으로 수행할 수 있는 도구형 플랫폼
- 현재 핵심 기능: AI 검색 노출 키워드 분석, AI 블로그 원고 작성, 네이버 플레이스 순위 조회와 순위 기록
- 배포: GitHub `main` 브랜치와 Vercel Production

## 기술 스택

- Next.js App Router
- React Client Components
- TypeScript
- Tailwind CSS
- Gemini API
- Naver Search API
- Supabase PostgreSQL은 네이버 플레이스 일자별 순위 기록과 이력 조회에 사용한다.

## 환경 변수

민감한 값은 코드에 직접 작성하지 않는다. 로컬과 Vercel 환경 변수로만 관리한다.

- `GEMINI_API_KEY`
- `GEMINI_TEXT_MODEL` 선택 값, 기본값은 `gemini-3.5-flash`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL` 추후 사용
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 기존 anon key 호환용
- `DATABASE_URL` Supabase PostgreSQL pooler 연결용. Vercel/Serverless 환경에서는 direct connection 대신 pooler URL을 사용한다.

## 아키텍처 기준

- `app/`은 페이지와 API route entry point만 둔다.
- `app/api/**/route.ts`는 공개 API URL을 보존하는 entry point이며, 실제 구현은 `features/*/api/*-route.ts`를 re-export하는 얇은 파일로 유지한다.
- 현재 Next.js route type 생성기가 `app/api` route group을 안정적으로 처리하지 못하므로 API URL 폴더에는 route group을 사용하지 않는다.
- API route 구현은 요청 파싱, 입력 검증, 서비스 호출, 응답 반환만 담당한다.
- 기능별 UI, API 구현, 타입, 저장소, 서버 로직은 `features/<feature-name>/` 아래에 둔다.
- 외부 서비스 연동 코드는 `lib/<provider>.ts`에 둔다.
- 프롬프트 생성, 응답 정규화, 도메인 판단 로직은 route handler 내부에 두지 않는다.
- 클라이언트 localStorage 접근은 기능 단위 storage 모듈로 분리하고, 서버 렌더링 환경을 항상 방어한다.

권장 구조:

```text
app/
  api/
    blog-posting/
    gemini/
    keywords/
    marketing/
    naver/
  layout.tsx
  page.tsx
features/
  blog-posting/
    api/
    components/
    server/
    types.ts
  keyword-analysis/
    api/
    components/
    server/
    storage.ts
    types.ts
  naver-search/
    api/
    server/
  platform/
    api/
    components/
lib/
  api/
  gemini.ts
  naver.ts
public/
```

## 코드 품질 기준

- 기존 동작 보존을 우선한다.
- 하나의 파일에 화면, 상태 관리, API 호출, 데이터 정규화가 모두 섞이지 않게 한다.
- 타입은 기능 단위 `types.ts`로 공유한다.
- 외부 API 응답은 신뢰하지 않고 정규화한다.
- 고객용 오류 메시지와 개발자 로그를 분리한다.
- 반복되는 문자열, storage key, 제한 수치는 상수화한다.
- 기능 추가 시 먼저 현재 기능과 독립적인 경계를 만든다.
- 불필요한 추상화, 과한 계층화, 사용하지 않는 공용 유틸은 만들지 않는다.

## 프론트엔드 기준

- AIVA의 어두운 배경, cyan/fuchsia 포인트, 정돈된 도구형 UI를 유지한다.
- 신규 도구형 기능은 기존 패턴과 일관되게 `features/platform/components/tool-ui.tsx`의 공통 UI를 우선 사용한다.
  - 진행 상태는 `ToolLoadingPanel`을 사용하고, cyan 진행바와 `진행 중` 배지를 유지한다.
  - 최근 검색 목록은 `RecentSearchList`를 사용하고, 클릭 시 가능한 경우 즉시 실행되도록 설계한다.
  - 오류 메시지는 `ToolErrorMessage`를 사용하고, 고객용 메시지와 개발자 로그를 분리한다.
- 검색/입력 폼은 기본적으로 `max-w-3xl`, `min-h-14` 입력창, 흰색 주요 액션 버튼, `disabled:opacity-45` 상태를 따른다.
- 주요 액션 버튼은 흰색 배경과 어두운 텍스트를 기본으로 하고, 보조 액션은 cyan border/background 계열을 사용한다.
- 첫 화면은 마케팅 페이지가 아니라 실제 기능으로 진입하기 쉬운 플랫폼 홈이어야 한다.
- 기능이 준비되지 않은 메뉴는 고객에게 과도한 설명을 노출하지 않는다.
- 모바일과 데스크톱 모두에서 텍스트 개행, 버튼 폭, 카드 그리드가 안정적으로 보여야 한다.
- UI 변경 후에는 가능하면 로컬 브라우저에서 주요 화면을 확인한다.

## API 기준

- Gemini 호출은 서버에서만 수행한다.
- Naver API 인증 정보는 서버에서만 사용한다.
- Gemini 실패는 개발자 로그에 status/body를 남기고, 사용자에게는 고객 친화적인 메시지를 보여준다.
- 재시도 가능한 Gemini 오류는 서버에서 최대 3회 재시도한다.
- Naver Blog API는 키워드 분석의 주요 참고 데이터이며, 현재 기본 정렬은 정확도순 `sim`이다.
- Naver Local API는 지역/플레이스 보조 신호로 사용한다.

## 검증

변경 후 기본 검증은 아래 순서로 수행한다. 현재 프로젝트에는 ESLint 설정이 없으므로 lint는 설정을 추가한 뒤 활성화한다. Next.js route type은 빌드 모드 기준으로 먼저 생성한 뒤 타입 체크한다.

```bash
/opt/homebrew/bin/node ./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
node ./node_modules/.bin/next build --webpack
```

로컬 개발 서버는 Turbopack/native binary 문제가 있으면 webpack 모드로 실행한다.

```bash
node ./node_modules/.bin/next dev --webpack
```

## 작업 방식

- 사용자가 명시적으로 요청하지 않으면 임의로 배포하지 않는다.
- 구조 변경은 동작 변경과 분리해서 진행한다.
- 대규모 변경 후에는 변경 파일과 검증 결과를 짧게 보고한다.
