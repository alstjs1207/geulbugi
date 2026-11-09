# Blog Discovery Specification

## Purpose
설정한 내 블로그의 최근 공개 글, 실제 카테고리와 키워드 검색을 제공한다. 공개 목록을 로컬 저장 글과 구분하고, 페이지 오류나 변경된 네이버 마크업을 빈 결과로 오인하지 않도록 한다.

## Requirements

### Requirement: BLOG-001 최근 공개 글과 조회 한도
시스템은 내 글 탭 진입·블로그 변경·카테고리 선택·새로고침에 따라 공개 글을 조회하고, 최대 10페이지에서 중복을 제거한 최근 공개 글 최대 10개를 네이버 순서대로 표시해야 한다(SHALL). 주기적 수집과 결과 자동 영구 저장을 하지 않아야 한다(MUST).

#### Scenario: 한 페이지에 한 글인 블로그
- **WHEN** 네이버가 페이지당 한 글과 공개 글 수·페이지 크기 근거를 반환한다
- **THEN** 스크립트를 실행하지 않고 다음 페이지 존재를 판정하며 10개 또는 실제 마지막 페이지에서 중단한다

#### Scenario: 오류와 오래된 응답
- **WHEN** 요청한 다음 페이지 대신 첫 페이지가 반환되거나 블로그·탭·분류 전환 뒤 이전 응답이 도착한다
- **THEN** 잘못된 결과를 섞지 않고 이전 백그라운드 갱신 안내 또는 해당 요청의 오류를 표시한다

### Requirement: BLOG-002 실제 카테고리별 목록
시스템은 열린 네이버 블로그 탭을 통해 설정한 블로그의 실제 카테고리 이름·순서·하위 분류를 읽고 선택한 분류의 최근 글을 조회해야 한다(SHALL).

#### Scenario: 분류 선택과 앨범형 목록
- **WHEN** 사용자가 하위 분류를 선택하고 네이버가 글 본문형 또는 기본 앨범형 목록을 반환한다
- **THEN** 동일 블로그·카테고리·페이지를 검증한 뒤 해당 목록만 표시하고 본문 속 관련 링크나 다른 블로그를 포함하지 않는다

### Requirement: BLOG-003 전체 카테고리 최신순 검색과 카드
시스템은 키워드 검색을 전체 카테고리의 최근 작성일순으로 요청하고, 공개 검색과 저장한 글 검색을 구분하며, 사용자가 선택한 글을 커서 위치에 링크 카드로 삽입할 수 있어야 한다(SHALL).

#### Scenario: 분류 선택 후 검색과 최근 글 복귀
- **WHEN** 분류가 선택된 상태에서 키워드 검색 후 '최근 글 보기'를 누른다
- **THEN** 검색은 전체 카테고리를 대상으로 하고 복귀 시 검색어를 비워 최근 목록을 표시한다

#### Scenario: 연속 카드 삽입
- **WHEN** 사용자가 카드 삽입 후 본문을 다시 클릭하지 않고 다른 카드를 삽입한다
- **THEN** 앞선 카드 뒤에 이어 넣고 기존 원문·순서·서식을 보존하며 마지막 카드만 되돌릴 수 있다

### Requirement: BLOG-004 공개 응답의 데이터 전용 해석
시스템은 설정한 내 블로그와 검증한 네이버 목적지로 조회를 제한하고, 최근 글·검색·카테고리 요청에는 인증 정보를 첨부하지 않으며 12초·2MiB 한도와 리디렉션 거부를 적용해야 한다(MUST). 원격 위젯과 HTML은 실행하지 않아야 한다(MUST).

#### Scenario: 실행 가능한 위젯 또는 외부 주소
- **WHEN** 위젯이 실행 토큰을 포함하거나 응답 URL이 다른 블로그·호스트·카테고리를 가리킨다
- **THEN** 응답을 거절하고 원격 코드를 실행하거나 편집 변경을 보내지 않는다

## Evidence
- 구현: `src/core/blog-recent.ts`, `src/core/blog-categories.ts`, `src/core/blog-search.ts`, `src/platform/blog-search-fetch.ts`, `src/platform/bridge.ts`, `src/background.ts`, `src/content.ts`, `src/ui/OwnPostsPanel.tsx`.
- 자동 검사: `tests/blog-recent.test.ts`, `tests/blog-categories.test.ts`, `tests/blog-search-fetch.test.ts`, `tests/blog-search-routing.test.ts`, `tests/blog-search.test.ts`, `tests/category-content.test.ts`, `tests/own-posts-panel.test.tsx`, `tests/link-card.test.ts`.
