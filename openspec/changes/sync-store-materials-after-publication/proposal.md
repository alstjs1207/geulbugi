# Proposal: 게시 확인 후 스토어 문구 반영

## Why

1.1.2 기준 README와 스토어 자료를 로컬에서 정리했지만 외부 대시보드에는 옮기지 않았다. 2026-11-10 사용자가 "게시되면 그때 반영"하도록 지시했으므로 실행 조건과 남은 작업을 보존한다.

## What Changes

- 로컬 소개·개인정보 입력안·상세/요약 심사 안내를 반영 후보로 보존한다.
- 대상 버전의 실제 게시 확인 후 대시보드의 현재 문구와 비교해 필요한 내용만 저장한다.
- 저장 결과·검토 상태·공개 페이지를 구분해 기록하고 확인한 task만 완료 처리한다.
- 이번 회차에는 main 커밋·푸시와 계획 기록만 진행하고 외부 반영을 실행하지 않는다.

## Capabilities

### New Capabilities
없음. 기존 기능의 문서·운영 작업이며 `.openspec.yaml`의 `skip_specs: true`로 관리한다.

### Modified Capabilities
없음. `release-operations`의 RELEASE-001·RELEASE-002·RELEASE-004와 `privacy-storage`의 DATA-003을 그대로 따른다.

## Impact

`store/listing-ko.txt`, `store/privacy-fields-ko.txt`, `store/reviewer-instructions-ko.txt`, `store/reviewer-dashboard-ko.txt`, `store/submission.json` 및 대상 항목의 스토어 등록정보·개인정보 보호·테스트 안내가 관련된다. 코드·권한·설치 패키지를 바꾸지 않는다.
