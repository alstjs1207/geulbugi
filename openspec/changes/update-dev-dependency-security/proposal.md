# Proposal

## Why
SEC-001의 개발 의존성 취약점 3개 패키지(moderate 2, high 1)를 2026-11-11 npm audit에서 재확인했다. 사용자가 개발 의존성 보안 업데이트를 요청했으며 1.2.0 패키지는 이미 스토어 업로드·임시저장했다고 알려 왔다.

## What Changes
- Vitest와 jsdom 경유 undici를 공식 수정 버전으로 업데이트하고 잠금 파일을 갱신한다.
- 깨끗한 npm ci 후 audit·전체 회귀 검사·타입·빌드·패키지를 검증한다.
- 현재 업로드용 ZIP과 자료 ZIP을 보존하고 재빌드의 파일별 해시를 비교한다.
- 업로드·임시저장은 사용자 확인 출처로 기록하며 심사 제출·공개 게시와 구분한다.

## Capabilities
### New Capabilities
없음.
### Modified Capabilities
없음. 개발 도구·기록만 변경하므로 skip_specs: true를 사용한다. 기존 release-operations 및 privacy-storage 계약을 유지한다.

## Impact
package.json, package-lock.json, 개발 설치 환경, SEC-001 및 검증 문서. 제품 기능·버전·권한·런타임 의존성은 유지한다. 강제 audit fix, 불필요한 전체 최신화, 스토어 재업로드·제출·게시·커밋·푸시는 하지 않는다.
