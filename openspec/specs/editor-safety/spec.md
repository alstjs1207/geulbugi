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

#### Scenario: 부분 적용 또는 완료 확인 전 직접 입력
- **WHEN** 여러 서식 중 일부만 반영되거나 전체 적용·보존 검증을 마치기 전에 실제 입력·제목·사진·선택 밖 서식 변경이 발생한다
- **THEN** 정상 완료로 인정하지 않고 사용자 내용을 자동 undo로 지우지 않으며 복구 안내를 유지한다

### Requirement: EDIT-003 미확정 작업과 되돌리기 경계
시스템은 결과를 확인할 수 없는 변경 요청을 다른 프레임에 재전송하지 않고, 동일 편집 세션의 추가 변경을 보호하며 직전 작업 범위 밖 사용자 편집을 되돌리지 않아야 한다(MUST).

#### Scenario: 변경 응답 유실
- **WHEN** 변경을 보낸 뒤 응답을 잃고 정상 스냅샷만 다시 읽힌다
- **THEN** 같은 세션에서 중복 변경을 차단하고 본문 확인·네이버 임시저장·저장 확인 후 새로고침 절차를 제공한다

### Requirement: EDIT-004 검증된 서식 완료 후 즉시 작성
시스템은 원래 선택 범위의 모든 요청 서식·원문·사진·선택 밖 서식 보존을 확인한 네이티브 작업에 한해서 추가 고정 대기 없이 직접 입력 또는 다음 서식에 제어를 넘겨야 한다(SHALL). 직접 입력이 추가되면 그 입력을 이전 작업의 undo로 지우지 않아야 한다(MUST).

#### Scenario: 전체 적용 후 입력
- **WHEN** 네이티브 서식 도구를 실행한 뒤 모든 후조건을 충족한 상태에서 사용자가 입력을 시작한다
- **THEN** 더 이상 서식 도구를 실행하지 않고 입력을 보존하며 불필요한 복구 잠금을 만들지 않는다. 입력으로 revision이 바뀌면 이전 작업의 undo를 비활성화한다

#### Scenario: 전체 적용 후 다음 서식
- **WHEN** 완료 대기 중 다음 서식 요청이 도착하고 첫 작업의 모든 후조건이 충족된다
- **THEN** 첫 작업의 완료를 확인한 뒤 다음 요청 당시 선택·세션·revision이 유지된 경우에만 다음 서식을 실행한다

#### Scenario: 부분 적용 또는 지연된 결과
- **WHEN** 요청 속성이 일부만 적용됐거나 네이티브 변경 결과를 확인할 수 없다
- **THEN** 추가 요청을 자동 재실행하거나 직접 입력을 undo하지 않고 기존 중단·복구 보호를 유지한다

### Requirement: EDIT-005 선택 추적의 내용 검증 보존
시스템은 변경 없는 선택의 중복 탐색·알림을 줄이되 실제 편집 실행 및 완료 검증에는 최신 본문을 사용해야 하며(MUST), 모호한 커서·바뀐 원문·사진·선택 밖 서식을 정상으로 인정하지 않아야 한다(MUST).

#### Scenario: 변경 없는 선택과 뒤이은 본문 변경
- **WHEN** 동일 선택을 반복 확인한 뒤 중간 문단·사진 또는 서식이 변경된다
- **THEN** 반복 선택 알림은 합치되 다음 검증에서 변경을 발견하고 이전 범위를 잘못 사용하지 않는다

#### Scenario: 오래된 렌더 선택과 모호한 시각 경계
- **WHEN** 네이티브 입력 버퍼의 선택은 있지만 렌더 DOM 앵커가 오래됐거나 양방향 텍스트의 서로 다른 오프셋이 같은 위치를 가리킨다
- **THEN** 원문과 유일한 본문 하이라이트의 기하 정보가 모두 일치할 때만 선택을 보완하고, 모호한 시각 경계는 전체 탐색으로 확인하거나 거부한다

## Evidence
- 구현: `src/editor/native-adapter.ts`, `src/editor/postconditions.ts`, `src/editor/undo-boundary.ts`, `src/platform/editor-recovery.ts`, `src/background.ts`.
- 자동 검사: `tests/format-cursor-interruption.test.ts`, `tests/reliability-fixes.test.ts`, `tests/native-journal.test.ts`, `tests/editor-routing.test.ts`, `tests/editor-recovery.test.ts`.
- 전체 사진·줄바꿈·서식 정책의 세부 실행 절차는 `docs/통합-검증-절차.md`를 참고한다. 초기 OpenSpec 도입 당시의 이력과 아래 로컬 수정본의 실제 검수를 구분한다.

- 2026-11-10 로컬 수정본 검증: `tests/fast-editing-state.test.tsx`, `tests/fast-format-input.test.ts`, `tests/fast-settings-save.test.tsx`, `tests/selection-performance.test.ts`, `tests/panel-refresh-performance.test.tsx`. 공개 스토어 반영과 구분한다.

- 선택 버퍼·양방향 모호성: `tests/input-buffer-selection.test.ts`. 실제 드래그·즉시 작성·연속 카드·설정 보존과 OS 단축키 한계: `docs/수정-빠른편집-20261110.md`.
