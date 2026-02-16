# Auto Shutdown Scheduler (Desktop)

Tauri + React 기반의 크로스플랫폼(Windows/macOS) 자동 종료 스케줄러 MVP입니다.

## 구현 범위 (MVP)
- GUI 예약 생성
  - 카운트다운 종료
  - 특정 시각 종료
  - 프로세스 종료 감지 기반 종료
- 최종 확인 단계 후 Arm
- 사전 알림(기본 10/5/1분, 사용자 수정 가능)
- 종료 직전 최종 경고(취소/연기 가능)
- 트레이 메뉴 퀵 액션
  - 창 열기
  - 예약 취소
  - 10분 연기
- 로컬 저장
  - 설정 + 실행 이력 + 활성 예약 상태(`app_data_dir/scheduler-state.json`)
- 시뮬레이션 모드
  - 개발/테스트 시 실제 종료 명령 대신 실행 이벤트만 기록

## 기술 스택
- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Backend: Rust
- Process monitoring: `sysinfo`
- Notification: `tauri-plugin-notification`

## 실행 방법
```bash
npm install
npm run tauri dev
```

## 빌드
```bash
npm run build
cd src-tauri
cargo check
```

## 안전 주의사항
- 시뮬레이션 모드를 끄면 실제 시스템 종료 명령이 실행됩니다.
- 프로세스 기반 종료는 앱의 자식 프로세스 분기/재시작 패턴에 따라 100% 보장되지 않습니다.
- “종료 후 이메일 발송”은 로컬 전용 구조에서는 불가능하며, 백엔드가 필요합니다.

## 구조
- `src/App.tsx`: 예약 UI, 최종 확인, 경고 오버레이, 이력 표시
- `src/api.ts`: Tauri invoke 래퍼
- `src/types.ts`: 프런트 타입 계약
- `src-tauri/src/lib.rs`: 스케줄러 상태머신, 프로세스 감시, 종료 실행, 트레이/알림, 로컬 저장
