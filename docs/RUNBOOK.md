# RUNBOOK

> STATUS: RUNBOOK
> Role: 운영 단일 문서 (verification + handoff + doc-sync)
> Applies to: Auto Shutdown Scheduler (Safety-Critical)
> Canonical Docs: [PRD_MVP_v1.0.md](./PRD_MVP_v1.0.md), [DESIGN_GUIDE_MVP_v1.0.md](./DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE_MVP_v1.0.md](./USE_CASE_MVP_v1.0.md), [IA_MVP_v1.0.md](./IA_MVP_v1.0.md)
> Artifact Paths: [../artifacts/verification/](../artifacts/verification/), [../artifacts/handoff/](../artifacts/handoff/)
> Deprecated Stubs: [deprecated/](./deprecated/)
> Archive Snapshots: [archive/](./archive/)
> Last Updated: 2026-02-17

## 1) Quick Start (30초 스캔)
이 문서는 다음 상황에서 본다.
- 변경 후 검증 순서가 헷갈릴 때
- 문서/코드 불일치를 정리할 때
- 인수인계 템플릿과 산출물 위치를 확인할 때

가장 자주 쓰는 명령:
```bash
npm run verify
cargo test --manifest-path src-tauri/Cargo.toml
```

빠른 체크:
- Safety UX가 유지되는가: Arm 확인, Cancel/Snooze 경로, 절대시각+상대시간, Final Grace
- 단일 활성 예약 정책이 UI/트레이/이력에서 일관한가
- 결과 산출물이 `artifacts/verification/`에 기록되었는가

## 2) Verification
기본 파이프라인:
1. preflight
2. lint
3. typecheck
4. test
5. e2e/build

실행 엔트리:
```bash
npm run verify
```

참고 명령:
```bash
npm run verify:preflight
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Rust/Tauri 검증:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

실패 처리 원칙:
- `lint/typecheck/test` 실패 시 전체 검증 실패로 기록한다.
- `test:e2e`는 환경 이슈면 `skipped`, 회귀면 `fail`로 기록한다.
- 실패 사유는 재현 명령과 함께 handoff 보고서에 남긴다.

기록 위치:
- verification 결과(JSON/Schema): `artifacts/verification/`
- handoff 보고서(Markdown): `artifacts/handoff/`

필수 산출물:
- `artifacts/verification/handoff-manifest.schema.json`
- `artifacts/verification/handoff-manifest.json`
- `artifacts/verification/preflight.json`
- `artifacts/verification/verify-commands.json`

## 3) UI QA Checklist (핵심)
### 3초 스캔
- 상태 배지, 남은 시간, 종료 시각을 3초 내 읽을 수 있어야 한다.
- 활성 상태에서 `취소` 또는 `10분 미루기` 경로를 즉시 찾을 수 있어야 한다.

### 30초 룰
- 사용자 관점에서 현재 상태와 다음 행동을 30초 안에 설명할 수 있어야 한다.
- 새 예약 진입부터 Arm 확인까지 흐름이 혼동 없이 이어져야 한다.

### Safety UX
- Arm 확인 모달 없이 ARMED 진입 금지
- Cancel/Snooze 경로 상시 노출(메인/오버레이/트레이)
- 절대시각 + 상대시간 동시 표기 유지
- Final Grace 기본 60초(설정 15~300초) 동안 개입 가능
- 단일 활성 예약 정책 유지

### 접근성(WCAG 요약)
- 키보드: `Ctrl/Cmd+N`, `Esc`, 테이블 `Enter` 동작 확인
- 포커스: `focus-visible` 링, Final Warning 포커스 트랩/복귀 확인
- 대비/표현: 색상 단독 의존 금지, disabled 상태 명확, 시간 숫자 tabular 정렬

### 반응형
- breakpoints: 480 / 960 / 1200 / 1440
- compact 시뮬레이션에서도 안전 액션이 가려지지 않아야 한다.

## 4) Doc Sync (문서-코드 정합성)
업데이트 책임:
- 정책/범위/수용기준 변경: `PRD_MVP_v1.0.md`
- UI 카피/접근성/레이아웃 변경: `DESIGN_GUIDE_MVP_v1.0.md`
- 상태 전이/예외/테스트 관점 변경: `USE_CASE_MVP_v1.0.md`
- 라우트/내비/정보구조 변경: `IA_MVP_v1.0.md`

변경 규칙:
- 문서는 as-built 기준으로만 기록한다.
- planned 내용은 정본 본문에 넣지 않는다.
- 동일 변경을 여러 문서에 중복 서술하지 않는다.

갭 발생 시 규칙:
- 우선 코드/커밋을 사실 기준으로 확인한다.
- 불명확하면 handoff 보고서에 `상태: 불명확`으로 남긴다.
- 결정 전까지 정본 문서에 추정 문장을 넣지 않는다.

갭 기록 위치:
- 작업 보고: `artifacts/handoff/HANDOFF_YYYY-MM-DD.md`
- 실행 로그: `artifacts/verification/*.json`

## 5) Handoff
handoff는 작업 단위별로 새 파일을 만든다.
- 파일명: `artifacts/handoff/HANDOFF_YYYY-MM-DD.md`
- 한 작업에 하나의 보고서 원칙

템플릿:
```md
# HANDOFF_YYYY-MM-DD

## 1) 변경 요약
- 무엇을 바꿨는지
- 왜 바꿨는지

## 2) 영향 범위
- 사용자 영향
- 안전 정책 영향
- 문서/링크 영향

## 3) 검증 결과
- 실행 명령
- PASS/FAIL/SKIPPED
- 핵심 로그 경로

## 4) 남은 이슈
- 미해결 항목
- 리스크와 후속 제안
```

handoff 작성 시 포함 권장:
- 기준 커밋(`base/head`)
- preflight 결과 요약
- e2e 또는 수동 QA 특이사항

## 6) Deprecated/Archive 운영 규칙
Deprecated:
- `docs/deprecated/*.md`는 링크 스텁만 유지한다.
- 본문 정책/절차는 넣지 않는다.

Archive:
- 이전 원문은 `docs/archive/*`에 스냅샷으로 보관한다.
- archive 문서는 보존 목적이며 현재 정책의 진실 원천이 아니다.

Artifacts:
- 기계 산출물은 `artifacts/verification/`로만 저장한다.
- 인수인계 보고서는 `artifacts/handoff/`로만 저장한다.
