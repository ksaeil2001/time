> STATUS: ARCHIVED
> Snapshot date: 2026-02-17
> 원본 출처: C:\Users\ksaei\workspace\time\docs\archive\2026-02-17_pre-runbook-consolidation\DOC_SYNC_GAP_CHECKLIST.md
# Doc Sync Gap Checklist (Step 3)

> Document Role: 문서 싱크 작업용 체크리스트(정본 스펙 아님)
> Canonical Specs: [PRD_MVP_v1.0.md](../PRD_MVP_v1.0.md), [DESIGN_GUIDE_MVP_v1.0.md](../DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE_MVP_v1.0.md](../USE_CASE_MVP_v1.0.md), [IA_MVP_v1.0.md](../IA_MVP_v1.0.md)
> 작성 기준: 코드(`src/App.tsx`, `src/components/layout/AppShellV2.tsx`, `src-tauri/src/lib.rs`)를 정본으로 대조

## 사전 불일치 목록
- [x] 라우트/라벨 혼선 정리 필요 (`/schedule` 내부 경로 vs 사용자 라벨 `예약`)
- [x] 화면별 명세 형식이 문서마다 달라 8개 화면을 동일 항목으로 재정렬 필요
- [x] 이벤트 카드 스캔성 규칙(중복 제거, 메타칩, 시간 표기 단일화) 문서 표준 부재
- [x] PRD 수용 기준에 30초 룰/3초 스캔 체크리스트 구조 부족
- [x] 권한 거부/절전 복귀/타임존 변경 테스트 문구가 현재 UI 문구와 일부 불일치
- [x] Codex용 pre-flight/handoff/traceability 프로토콜 부재
- [x] `npm run verify` 단일 검증 엔트리 부재

## 사후 확인
- [x] 문서 4종 동기화 완료
- [x] verification/handoff 문서/스키마 추가 완료
- [x] 자동 검증 스크립트 추가 완료
- [x] verify 실행 결과 반영 완료

