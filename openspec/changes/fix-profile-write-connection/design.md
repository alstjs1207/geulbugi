# 설계

## Context
실제 내 블로그에서 상단 링크는 `/<blogId>?Redirect=Write`와 `_top`, 프로필 링크는 `/<blogId>/postwrite`와 `mainFrame`이었다. 프로필 진입 후 상단 URL은 Redirect=Write로 바뀌지만 내부 편집기 주소는 postwrite로 유지됐다. 본문 se-components-wrap에는 contenteditable이 없고 input_buffer iframe의 body에만 있었다.

## Decisions
- 기존 편집기 루트와 contenteditable/레거시 경로 판정은 유지하고, 정확한 `/<blogId>/postwrite` 경로(선택적 끝 슬래시)를 추가한다.
- 단순 postwrite 문자열 포함 검사로 확대하지 않는다. 루트 없는 로딩 화면과 공개 글은 계속 읽기 전용이다.
- 등록된 프레임을 session 저장소에 반영한 다음 PANEL_REFRESH를 전송해 기존 80ms 갱신 합치기를 사용한다. 알림 수신자가 없어도 등록 성공을 보존한다.
- 기존 작업 실행·중복 실행 방지·원고 및 사용자 입력 보존 정책을 유지한다.

## Validation
실제 관측한 DOM 구조의 회귀 검사를 수정 전에 실행해 postwrite 한 건이 실패함을 확인했다. 수정 후 기존 편집기 경로 및 공개 조회 음성 사례와 함께 재검증한다. 실제 설치본 검수는 자동 테스트와 별도로 기록한다.
