# 프로필 글쓰기 자동 연결

## Why
프로필의 글쓰기는 `/<blogId>/postwrite`를 mainFrame에 연다. 현재 편집기는 본문 대신 별도의 input_buffer iframe을 contenteditable로 사용하므로, 기존 PostWriteForm/PostUpdateForm 경로 검사에 빠져 읽기 전용으로 판정된다.

## What Changes
- 실제 편집기 루트가 있을 때 프로필 postwrite 경로를 인식한다.
- 프레임 등록을 저장한 뒤 패널 갱신을 알린다.
- 공개 글·부분 일치 URL·로딩 화면의 읽기 전용 판정을 회귀 검사한다.

## Capabilities
### Modified Capabilities
- `panel-shortcuts`: 프로필 글쓰기 진입 후 자동 연결.

## Impact
`src/editor/reader.ts`, `src/background.ts`, 관련 자동 테스트와 명세. 권한·저장 형식·발행 동작·스토어 심사 패키지를 변경하지 않는다.
