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

### Requirement: PANEL-005 수신 순서와 편집 세션 보존
패널은 비동기 창 확인이 늦은 단축키 결과와 이전 문서의 작업 응답으로 더 최신 문서/작업 상태를 덮어쓰지 않아야 한다(MUST).

#### Scenario: 이전 문서의 성공 응답
- **WHEN** A 문서 작업이 완료되기 전에 B 문서 연결을 확인하고 A 응답이 나중에 도착한다
- **THEN** B의 선택·연결·되돌리기 상태를 유지한다

#### Scenario: 단축키 창 확인의 순서 역전
- **WHEN** 이전 단축키 결과의 창 확인이 최신 결과 또는 새 연결 조회보다 늦게 끝난다
- **THEN** 이전 결과를 반영하지 않는다

### Requirement: PANEL-006 연속 입력 중 선택 표시 갱신
패널은 연속 입력 알림 때문에 선택 표시 갱신을 무기한 미루지 않아야 하며(SHALL), 단축키는 표시 갱신을 기다리지 않고 원래 입력 탭의 최신 설정·선택을 확인해야 한다(MUST).

#### Scenario: 알림이 계속 도착하는 경우
- **WHEN** 100ms 간격으로 편집 변경 알림이 계속 도착한다
- **THEN** 마지막 알림 뒤 500ms가 되기를 기다리지 않고 제한된 주기로 새 상태를 조회하며 조회가 겹쳐 계속 증가하지 않는다

### Requirement: PANEL-007 프로필 글쓰기 자동 연결
시스템은 네이버 프로필의 글쓰기 버튼이 `mainFrame`에 여는 `/<blogId>/postwrite`의 실제 편집기 루트를 인식해야 하며(SHALL), 프레임 등록을 저장한 뒤 패널 갱신을 알려야 한다(MUST). 본문에 직접 `contenteditable`이 없어도 이 글쓰기 경로를 인식하며 공개 글 조회 화면과 편집기 루트가 없는 로딩 화면은 편집 가능으로 판정하지 않아야 한다(MUST).

#### Scenario: 프로필 글쓰기로 진입
- **WHEN** 프로필 글쓰기가 `/<blogId>/postwrite`를 열고 네이티브 입력 프레임을 사용하는 본문 캔버스가 준비된다
- **THEN** 편집 가능한 프레임으로 등록하고 패널이 연결 상태를 자동 갱신한다

#### Scenario: 공개 글 또는 로딩 화면
- **WHEN** 공개 글의 읽기 전용 본문을 조회하거나 글쓰기 루트가 아직 생성되지 않았다
- **THEN** URL 일부나 읽기 전용 본문만으로 편집 가능으로 판정하지 않는다

## Evidence
- 구현: `src/background.ts`, `src/ui/App.tsx`, `src/ui/ShortcutPresets.tsx`, `src/editor/native-adapter.ts`.
- 자동 검사: `tests/shortcut-routing.test.ts`, `tests/shortcut-connection.test.tsx`, `tests/shortcut-presets.test.tsx`, `tests/reliability-fixes.test.ts`.
- PANEL-004는 소스 검토 근거다. 무시되는 로컬 `artifacts/`의 과거 브라우저 기록을 재현 가능한 필수 테스트로 사용하지 않는다.

- 2026-11-10 로컬 수정본 검증: `tests/fast-editing-state.test.tsx`, `tests/fast-format-input.test.ts`, `tests/fast-settings-save.test.tsx`, `tests/selection-performance.test.ts`, `tests/panel-refresh-performance.test.tsx`. 공개 스토어 반영과 구분한다.
- PANEL-007: `src/editor/reader.ts`, `src/background.ts`, `tests/reader.test.ts`, `tests/editor-routing.test.ts`, `docs/수정-프로필-글쓰기-자동연결-20261111.md`.
