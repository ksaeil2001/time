> STATUS: ARCHIVED
> Snapshot date: 2026-02-17
> 원본 출처: C:\Users\ksaei\workspace\time\docs\archive\2026-02-17_pre-runbook-consolidation\VERIFICATION_PROTOCOL.md
# Codex Verification Protocol (Auto Shutdown Scheduler)

> Last synced with implementation: 2026-02-17 (commit db40591)
> Document Role: 검증 절차/운영 증빙 문서(정본 스펙 아님)
> Canonical Specs: [PRD_MVP_v1.0.md](../PRD_MVP_v1.0.md), [DESIGN_GUIDE_MVP_v1.0.md](../DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE_MVP_v1.0.md](../USE_CASE_MVP_v1.0.md), [IA_MVP_v1.0.md](../IA_MVP_v1.0.md)

## 1) 목적
이 앱은 OS 종료를 트리거할 수 있는 안전 민감(Safety-Critical) 앱이다.  
검증 프로토콜의 목적은 다음 3가지를 동시에 만족하는 것이다.

1. 30초 룰/3초 스캔 품질 보장
2. 안전 UX 비회귀(Arm 확인, Final Grace, Cancel/Snooze 접근성)
3. 재현 가능한 handoff(Traceability/Auditability)

## 2) 적용 범위
- 문서 싱크 작업(PRD/Design/Use Case/IA)
- UI/UX 변경 또는 마이크로카피 변경
- 상태 전이/종료 로직/알림/트레이 관련 변경
- 릴리즈 전 수동 QA 및 CI 파이프라인

## 3) Pre-flight (Teleport 스타일 로컬 적용)
`npm run verify`는 아래 pre-flight를 먼저 수행한다.

### 3.1 Git Dirty 체크
- 체크: `git status --porcelain`
- 기록: dirty 여부와 변경 파일 수를 manifest에 남긴다.
- 판정:
  - 코드 검증 자체는 계속 진행 가능
  - handoff에는 `dirty=true`를 명시한다.

### 3.2 올바른 리포지토리 체크
- 체크:
  - `git rev-parse --show-toplevel`
  - `git remote get-url origin`
- 목적: 다른 디렉터리/다른 원격에서 잘못 검증하는 사고 방지
- 실패 시: verify 즉시 실패

### 3.3 작업 브랜치/원격 브랜치 체크
- 체크:
  - `git branch --show-current`
  - `git ls-remote --heads origin <branch>`
- 목적: handoff 기준 브랜치의 추적 가능성 확보
- 원격 브랜치 미존재 시: 경고(warn) 기록, 검증은 계속 진행

### 3.4 계정 동일성 대체 설계
Codex 환경에서는 Claude teleport의 계정 동일성 체크를 1:1로 복제하기 어렵다.  
대신 다음 조합으로 `identity_hash`를 생성/기록한다.

- 입력 후보:
  - `GITHUB_ACTOR`
  - `OPENAI_ORG_ID`
  - `CODEX_ORG_ID`
  - `USERNAME` + `USERDOMAIN`
- 산출:
  - SHA-256 해시(원문 미보관)
- 목적:
  - 누가/어떤 환경에서 검증했는지 추적
  - 비밀값 원문 노출 방지

## 4) 실행 중 검증 (Hooks를 로컬 스크립트/CI로 대체)
필수 실행 순서:
1. `verify:preflight`
2. `lint`
3. `typecheck`
4. `test`
5. `test:e2e` (가능하면, 환경 미충족 시 skip 가능)

실행 흔적 규칙:
- 각 단계에 대해 시작/종료 시각, 결과(pass/fail/skipped), 명령어를 기록
- 결과는 `docs/handoff/handoff-manifest.json`에 저장
- 선택 옵션으로 `/mnt/data`에도 복사 저장 가능

## 5) 산출물 규칙
검증 완료 시 아래 산출물이 존재해야 한다.

1. 문서:
   - `docs/PRD_MVP_v1.0.md`
   - `docs/DESIGN_GUIDE_MVP_v1.0.md`
   - `docs/USE_CASE_MVP_v1.0.md`
   - `docs/IA_MVP_v1.0.md`
2. QA:
   - `docs/deprecated/UI_QA_CHECKLIST.md`
3. handoff:
   - `docs/handoff/HANDOFF.md`
   - `docs/handoff/handoff-manifest.json`

## 6) 불명확 항목 표기 원칙
내부 판정 로직이 문서/코드에서 명확하지 않으면 반드시 `불명확`으로 표기한다.

표기 규칙:
- 문서 내 표기: `상태: 불명확 (추가 확인 필요)`
- handoff 내 표기: `result=warn`, `reason=ambiguous`
- 금지:
  - 근거 없는 pass 선언
  - 추정 사실을 확정 문장으로 기록

## 7) 실패 시 조치 원칙
- `lint/typecheck/test` 실패:
  - verify 전체 실패 처리
  - 어떤 단계에서 실패했는지와 조치 명령을 출력
- `test:e2e` 실패:
  - 기본은 optional
  - 브라우저 미설치/GUI 미지원 등 환경 문제는 `skipped`로 기록 가능
  - 회귀성 실패는 `fail`로 처리

## 8) CI 적용 가이드
- CI는 `npm run verify`를 단일 엔트리로 실행한다.
- 아티팩트 업로드:
  - `docs/handoff/handoff-manifest.json`
  - 필요 시 `docs/handoff/HANDOFF.md`
- 보호 규칙:
  - manifest가 없거나 schema 불일치면 실패

## 9) 운영 메모
- 이 프로토콜은 기능 구현 문서가 아니라 검증 절차 문서다.
- 안전 정책 자체를 변경하는 경우, PRD/Use Case 변경과 함께 Decision 로그를 남긴다.

