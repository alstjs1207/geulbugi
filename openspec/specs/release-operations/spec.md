# Release Operations Specification

## Purpose
로컬 자료·Git 커밋·스토어 심사·공개 게시의 서로 다른 상태를 구분하고 사용자가 정한 공개 시점과 검증 증거를 보존한다. 버전과 과거 이력이 뒤섞여 잘못된 배포 판단으로 이어지지 않도록 한다.

## Requirements

### Requirement: RELEASE-001 버전과 공개 근거
출시 자료는 package·manifest·설치 ZIP·제출 자료의 버전을 일치시켜야 한다(SHALL). 공개 버전은 사용자 확인 또는 실제 대시보드 확인의 출처·날짜를 기록하고, 자료 정리일을 출시일로 쓰지 않아야 한다(MUST).

#### Scenario: 사용자 확인을 기준으로 자료 정리
- **WHEN** 사용자가 현재 버전을 1.1.2라고 확인하지만 별도 출시일은 알려주지 않는다
- **THEN** 해당 확인을 출처로 남기고 게시일·제출일·대시보드 저장 성공을 만들어 쓰지 않는다

### Requirement: RELEASE-002 게시 후 스토어 문구 반영
운영 작업은 2026-11-10 사용자 지시에 따라 대상 버전의 게시 확인 후 준비된 문구를 대시보드에 반영해야 한다(SHALL). 게시 확인 전에는 해당 후속 작업을 미완료로 유지하고 Git 커밋·푸시를 스토어 작업 완료로 취급하지 않아야 한다(MUST).

#### Scenario: 로컬 자료만 준비된 상태
- **WHEN** README·스토어 소개·개인정보 입력안·심사 안내가 로컬에서 갱신된다
- **THEN** 로컬 준비 완료만 기록하고 대시보드 저장·패키지 업로드·심사 제출은 수행 또는 완료 처리하지 않는다

### Requirement: RELEASE-003 최종 저장과 발행 주체
확장은 예약 날짜·시간을 설정할 수 있으나 네이버의 최종 저장·발행은 사용자가 직접 실행해야 한다(MUST). 실제 검수에는 테스트 원고를 사용해야 한다(MUST).

#### Scenario: 예약 시간 설정 확인
- **WHEN** 날짜·시간 설정 동작을 검수한다
- **THEN** 네이버 기본 화면의 설정 결과를 확인하며 실제 공개 발행을 검수 완료 조건에 포함하지 않는다

### Requirement: RELEASE-004 증거와 이력 보존
운영 기록은 자동 검사·모의 편집기·실제 네이버 확인을 구분하고, 과거 제출·검증 이력을 현재 성공 기록으로 재사용하지 않아야 한다(MUST). 실행하지 않은 작업을 체크하거나 archive하지 않아야 한다(MUST).

#### Scenario: 과거 검토 대기 기록 갱신
- **WHEN** 현재 공개 버전 기준으로 제출 자료를 정리한다
- **THEN** 과거 버전의 pending 상태·해시·날짜는 이력으로 보존하고 새 버전의 검증 근거와 구분한다

## Evidence
- 사용자 결정: 2026-11-10 공개 버전 1.1.2 확인 및 스토어 문구는 게시되면 반영하도록 지시. 대상 버전 게시 확인이라는 실행 조건을 미래 작업에 유지한다.
- 자료: `README.md`, `store/submission.json`, `store/index.html`, `store/reviewer-dashboard-ko.txt`, `docs/통합-검증-절차.md`.
- 자동 검사: `scripts/verify-package.mjs`, `scripts/verify-store.mjs`, `tests/publish-time.test.ts`, `tests/schedule.test.ts`.
- Google 2026-08-20 공지는 Featured 자가 추천 종료와 2026년 내 제도 종료를 발표했다: https://developer.chrome.com/blog/cws-review-updates-2026 . 추천 배지 신청을 예정 작업으로 만들지 않는다.
- 우수 게시자는 신원 확인·정책 준수·지속적 이력의 자동 부여 기준이다: https://developer.chrome.com/docs/webstore/discovery#publisher-badge . 획득 날짜나 설치 수 기준을 임의로 약속하지 않는다.
