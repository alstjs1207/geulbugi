# Privacy and Storage Specification

## Purpose
블로그 편집과 공개 글 조회에 필요한 최소 권한과 로컬 저장 범위를 유지한다. 사용자가 원고와 백업의 처리 위치를 이해하고 기존 설정과 저장 자료를 업데이트 이후에도 사용할 수 있도록 한다.

## Requirements

### Requirement: DATA-001 최소 권한과 원고 처리
확장은 Manifest V3와 Chrome 116 이상을 지원하고 storage·sidePanel 및 blog.naver.com·m.blog.naver.com의 HTTPS 호스트 권한만 요청해야 한다(MUST). 원고를 운영자 서버·광고·분석 서비스·AI API로 전송하지 않아야 한다(MUST).

#### Scenario: 설치 패키지 검사
- **WHEN** 설치 패키지를 준비한다
- **THEN** 권한·실행 리소스·개인정보처리방침·저작권 고지와 개발용 파일 혼입을 검사한다

### Requirement: DATA-002 설정과 백업의 범위 및 호환성
시스템은 설정·프리셋·등록한 공개 글을 로컬에 보존하고, 백업에는 사용자 선택에 따른 설정·프리셋·등록 글만 포함해야 한다(SHALL). 본문 전체·쿠키·비밀번호·로그인 세션을 백업에 포함하지 않아야 한다(MUST).

#### Scenario: 업데이트와 백업 가져오기
- **WHEN** 기존 자료를 읽거나 백업을 가져온다
- **THEN** 기존 schemaVersion 1과 백업 version 1 호환성을 유지하고 지원하지 않는 값·손상된 JSON·범위 밖 자료를 거절한다

### Requirement: DATA-003 로컬 참조와 외부 기능 공개
시스템은 링크 카드 주소 참조를 최근 최대 1,000개로 제한하고, 네이버 조회·링크 카드·사진 업로드에 필요한 통신과 로컬 자료 삭제 방법을 개인정보처리방침에 공개해야 한다(SHALL).

#### Scenario: 스토어 자료 갱신
- **WHEN** 데이터 처리 설명을 수정한다
- **THEN** 구현·요청 권한·개인정보 입력안·패키지 및 공개 처리방침의 일치 여부를 확인하고 로컬 처리라고 해서 아무 데이터도 처리하지 않는 것으로 표시하지 않는다

## Evidence
- 구현: `public/manifest.json`, `public/privacy.html`, `src/platform/storage.ts`, `src/platform/link-card-cache.ts`, `src/core/backup.ts`, `src/core/merge-database.ts`.
- 등록 자료: `store/privacy-fields-ko.txt`, `store/site/privacy.html`, `website/privacy/index.html`.
- 자동 검사: `tests/backup-demo.test.ts`, `tests/postconditions-storage.test.ts`, `tests/link-card-cache.test.ts`, `tests/release-audit-backup.test.ts`, `scripts/verify-package.mjs`, `scripts/verify-store.mjs`.
