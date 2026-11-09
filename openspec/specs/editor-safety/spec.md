# Editor Safety Specification

## Purpose
네이버 블로그의 선택 영역에 서식·인용구·링크·사진·줄바꿈을 적용할 때 원문, 사진, 직접 입력과 되돌리기 범위를 보존한다. 완료된 서식 뒤의 단순 커서 이동과 실제 편집 중단을 구분한다.

## Requirements

### Requirement: EDIT-001 원문과 네이버 편집 경로 보존
편집 도구는 사용자가 선택한 대상에 네이버 기본 편집 동작을 수행하고, 대상 밖 원문·서식·사진을 보존해야 한다(SHALL).

#### Scenario: 서식과 줄바꿈 적용
- **WHEN** 사용자가 서식 또는 줄바꿈 계획을 적용한다
- **THEN** 결과의 원문·대상·사진 보존을 검사하고 결과가 불확실하면 성공으로 표시하지 않는다

### Requirement: EDIT-002 서식 완료 후 커서 이동
시스템은 포인터 이동만 감지된 경우 원래 선택 영역의 전체 서식 적용과 원문·사진 보존을 확인했을 때만 정상 완료로 처리하고, 새 커서 위치와 직전 작업 되돌리기를 유지해야 한다(SHALL).

#### Scenario: 완료 직후 본문 클릭
- **WHEN** 마지막 서식이 반영된 후 안정화 대기 중 사용자가 다른 본문 위치를 클릭한다
- **THEN** 원래 선택 영역의 전체 결과를 확인하고 새 커서에서 나머지 도구를 실행하지 않으며 불필요한 복구 안내를 표시하지 않는다

#### Scenario: 부분 적용 또는 직접 입력
- **WHEN** 여러 서식 중 일부만 반영되거나 커서 이동 뒤 실제 입력·제목·사진·선택 밖 서식 변경이 발생한다
- **THEN** 정상 완료로 인정하지 않고 사용자 내용을 자동 undo로 지우지 않으며 복구 안내를 유지한다

### Requirement: EDIT-003 미확정 작업과 되돌리기 경계
시스템은 결과를 확인할 수 없는 변경 요청을 다른 프레임에 재전송하지 않고, 동일 편집 세션의 추가 변경을 보호하며 직전 작업 범위 밖 사용자 편집을 되돌리지 않아야 한다(MUST).

#### Scenario: 변경 응답 유실
- **WHEN** 변경을 보낸 뒤 응답을 잃고 정상 스냅샷만 다시 읽힌다
- **THEN** 같은 세션에서 중복 변경을 차단하고 본문 확인·네이버 임시저장·저장 확인 후 새로고침 절차를 제공한다

## Evidence
- 구현: `src/editor/native-adapter.ts`, `src/editor/postconditions.ts`, `src/editor/undo-boundary.ts`, `src/platform/editor-recovery.ts`, `src/background.ts`.
- 자동 검사: `tests/format-cursor-interruption.test.ts`, `tests/reliability-fixes.test.ts`, `tests/native-journal.test.ts`, `tests/editor-routing.test.ts`, `tests/editor-recovery.test.ts`.
- 전체 사진·줄바꿈·서식 정책의 세부 실행 절차는 `docs/통합-검증-절차.md`를 참고한다. 이번 도입에서 실제 네이버 원고 작업을 재실행한 것은 아니다.
