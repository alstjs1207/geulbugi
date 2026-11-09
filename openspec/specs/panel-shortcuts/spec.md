# Panel and Shortcuts Specification

## Purpose
사이드 패널의 연결 상태와 사용자가 지정한 서식 단축키를 일관되게 제공한다. 비동기 조회 또는 창 전환 때문에 완료된 편집 결과가 오래된 상태로 교체되거나 다른 글에 변경이 적용되는 것을 방지한다.

## Requirements

### Requirement: PANEL-001 단축키 슬롯과 실행 대상
시스템은 최대 8개 슬롯의 저장된 프리셋 연결을 매 실행 시 읽고, 사용자가 Chrome에서 지정한 단축키를 입력한 원래 탭에만 변경을 전달해야 한다(SHALL).

#### Scenario: 저장 조회 중 활성 창 전환
- **WHEN** 단축키 입력 뒤 설정을 읽는 동안 다른 탭이나 창이 활성화된다
- **THEN** 원래 입력 탭을 유지하며 해당 탭이 편집 가능한 네이버 블로그가 아니면 다른 편집기로 우회하지 않는다

### Requirement: PANEL-002 최신 연결 상태 보존
시스템은 최신 연결 조회·편집 완료 결과보다 먼저 시작된 스냅샷 응답으로 패널 상태를 덮어쓰지 않고, 창 정보가 있는 단축키 결과는 해당 창의 패널에만 반영해야 한다(SHALL).

#### Scenario: 단축키 성공 뒤 오래된 연결 실패
- **WHEN** 단축키 성공 결과를 표시한 후 이전 조회의 실패 응답이 도착한다
- **THEN** 성공한 연결 상태를 유지한다. 이후 시작한 새 조회의 실제 실패는 정상적으로 표시한다

### Requirement: PANEL-003 보조키와 실제 편집 구분
시스템은 서식 반영 중 Control·Shift·Alt·Meta·AltGraph만 누른 동작을 직접 편집으로 판정하지 않아야 한다(SHALL). 실제 글자 입력·이동 키·붙여넣기·잘라내기·입력 조합은 보호 대상으로 유지해야 한다(MUST).

#### Scenario: 빠른 단축키 연속 입력
- **WHEN** 이전 서식 반영 중 다음 단축키의 보조키만 먼저 입력된다
- **THEN** 그 이벤트만으로 복구를 요구하지 않으며 실제 입력 중단 보호는 유지한다

### Requirement: PANEL-004 기능 탭 스크롤 초기화
패널은 기능 탭이 바뀔 때 내용 스크롤을 상단으로 이동해야 한다(SHALL).

#### Scenario: 긴 사진 목록에서 다른 기능으로 이동
- **WHEN** 사용자가 목록 아래로 스크롤한 뒤 다른 기능 탭을 선택한다
- **THEN** 새 기능의 상단 안내와 조작부부터 표시한다

## Evidence
- 구현: `src/background.ts`, `src/ui/App.tsx`, `src/ui/ShortcutPresets.tsx`, `src/editor/native-adapter.ts`.
- 자동 검사: `tests/shortcut-routing.test.ts`, `tests/shortcut-connection.test.tsx`, `tests/shortcut-presets.test.tsx`, `tests/reliability-fixes.test.ts`.
- PANEL-004는 소스 검토 근거다. 무시되는 로컬 `artifacts/`의 과거 브라우저 기록을 재현 가능한 필수 테스트로 사용하지 않는다.
