# 글부기 OpenSpec

기준일: 2026-11-11. 원본 `/Users/msyu/study/geulbugi`, 브랜치 `main`.
현재 package·manifest·로컬 자료는 **1.2.1**이다. 프로필 글쓰기 자동 연결 수정본이며 1.2.1의 스토어 업로드·제출은 실행하지 않았다. 아래 대시보드 기록은 기존 1.2.0에 대한 이력이다. 2026-11-11 실제 대시보드에서 문구 저장·검토 제출을 완료했고 승인 후 자동 게시 설정을 확인했다. 현재 검토 대기 중이며 실제 공개 버전은 **1.1.2**다. 사용자 확인에 따른 공개 버전 기록과 실제 대시보드 확인을 구분한다.

## 읽는 순서

루트 `AGENTS.md` → 관련 현재 명세 → active change의 tasks → `known-gaps.md` → 필요한 과거 `docs/` 기록 순서로 읽는다.

| 영역 | 현재 명세 | 주요 보존 사항 |
| --- | --- | --- |
| 편집·되돌리기·복구 | [editor-safety](specs/editor-safety/spec.md) | 원문·사진·직접 입력 보존, 커서 이동과 부분 적용 구분 |
| 최근 글·카테고리·검색 | [blog-discovery](specs/blog-discovery/spec.md) | 최대 10개·10페이지, 실제 분류, 전체 검색 최신순, 데이터 전용 해석 |
| 패널·단축키·연결 | [panel-shortcuts](specs/panel-shortcuts/spec.md) | 8개 슬롯, 원래 입력 탭, 오래된 응답 차단, 창별 결과 |
| 권한·로컬 저장·백업 | [privacy-storage](specs/privacy-storage/spec.md) | 네이버 두 호스트, 원고 기기 처리, 기존 저장 호환 |
| 버전·출시·운영 | [release-operations](specs/release-operations/spec.md) | 로컬 준비와 외부 반영 구분, 게시 확인 후 문구 반영 |

`specs/`는 현재 구현 또는 사용자가 정한 운영 정책이다. 각 문서의 Evidence가 구현·검증 경로를 연결한다. 이 도입은 기존 기능의 소급 명세이며 새로운 기능을 구현했다는 의미가 아니다. 연결된 테스트가 있다고 모든 시나리오가 실제 브라우저에서 검증된 것은 아니다.

## 예정 작업

- [프로필 글쓰기 자동 연결](changes/fix-profile-write-connection/proposal.md): `/<blogId>/postwrite` 경로 인식과 등록 후 패널 갱신. [로컬 검증 기록](../docs/수정-프로필-글쓰기-자동연결-20261111.md). 기존 심사 패키지와 구분한다.
- [스토어 문구 반영·게시 진행](changes/sync-store-materials-after-publication/proposal.md) · [진행 목록](changes/sync-store-materials-after-publication/tasks.md): 2026-11-11 최신 승인에 따라 1.2.0 문구 저장·검토 제출을 완료했다. 승인 후 자동 게시되며 실제 공개 확인이 남았다.
- [확인 공백과 유지보수](known-gaps.md): 실제 환경 검증, 개발 도구 보안 업데이트, 배지 운영 기준을 관리한다. 검토만 한 항목을 구현 완료로 취급하지 않는다.
- [개발 의존성 보안 업데이트 완료](../docs/보안-개발의존성-20261111.md): 2026-11-11 audit 0건·739개 테스트·기존 1.2.0 빌드 내용 동일 확인.
- [이번 도입 근거](baseline-audit.md): Git 기준, 포함한 변경과 실행한 검사·한계.

## 일상 작업

OpenSpec **1.15.0**을 devDependency로 고정했다. `npm ci` 후 이 저장소의 CLI를 사용하며 다른 프로젝트나 전역 설치에 의존하지 않는다.

```sh
npm run spec -- list --specs
npm run spec -- show blog-discovery --type spec
npm run spec -- list
npm run spec -- new change describe-the-change
npm run spec -- status --change describe-the-change
npm run spec -- instructions proposal --change describe-the-change
npm run spec:check
```

Codex용 `.agents/skills/openspec-*`에는 explore/propose/apply/update/sync/archive 절차가 있다. 사용자 요청에 이미 구현·검증·커밋이 포함되면 그 범위를 다시 승인받지 않는다. change는 proposal → specs/design → tasks로 관리하고 `#### Scenario:`의 WHEN/THEN과 SHALL/MUST를 사용한다.

순수 문서·운영 작업처럼 기존 계약이 바뀌지 않는 change는 `.openspec.yaml`에 `skip_specs: true`를 명시하고 불필요한 delta를 만들지 않는다. 실제 동작 변경은 ADDED/MODIFIED/REMOVED delta로 현재 명세와 연결한다. 완료한 change만 archive하며 실제 게시·대시보드 저장을 수행하지 않았다면 해당 task를 열어 둔다.

```sh
npm run check
npm test
npm run build
npm run verify
npm run store:verify
npm run spec:check
```

`store:verify`는 공개 처리방침에 익명 HTTPS 요청을 보낸다. 전체 로컬 검증과 실제 네이버 편집·OS 단축키·스토어 운영 확인은 별도다. 기존 설치 ZIP을 재생성하면 해시·자료 링크도 함께 갱신한다.

형식 근거: [OpenSpec 1.15.0](https://github.com/Fission-AI/OpenSpec/blob/v1.15.0/docs/getting-started.md). CLI 검증은 문서 형식을 확인하며 코드의 정책 일치나 원격 게시 성공을 보증하지 않는다.
