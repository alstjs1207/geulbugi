# 글부기 출시 사이트

승인된 아이보리·그린 시안을 구현한 반응형 정적 사이트입니다. Node.js 22 이상을 사용하며 외부 패키지를 설치할 필요가 없습니다.

## 실행과 확인

저장소 루트에서는 `npm --prefix website run dev`로 실행합니다. 아래 명령은 `website/` 안에서 실행하는 기준입니다.

```sh
npm run dev
npm run check
npm run build
npm run preview
```

개발·빌드 미리보기 기본 주소는 `http://127.0.0.1:5187/`입니다. 두 서버를 동시에 실행하려면 한쪽에 `PORT`를 다르게 지정하세요.

## 구성

- `/`: 랜딩 페이지. 기능별 실제 캡처 5개 탭, 이미지 확대, 단축키 소개, 사용 순서, FAQ.
- 애니메이션: 첫 화면 순차 등장, 한 번만 재생하는 스크롤 등장, 짧은 거북이 인사, 기능 탭 이미지 전환, FAQ 답변 등장. 기기의 ‘동작 줄이기’를 실시간으로 반영하며 JS가 없어도 본문은 표시됩니다.
- `/guide/`: 설치 안내, 서식·인용구, 최대 8개 단축키 슬롯과 Chrome 키 조합 지정 방법, 기능별 안내.
- `/privacy/`: 기존 프로그램에 포함된 개인정보처리방침의 본문을 유지한 페이지.
- `site.config.js`: 정식 출시 후 공개 Chrome 웹 스토어 URL을 연결하는 설정.
- `docs/captures.json`: 제품 캡처의 출처·원본 해시·크기 기록.
- `docs/verification.json`: 실제 브라우저 검수 결과.

비공개 저장소 https://github.com/alstjs1207/geulbugi 에서 확장 프로그램과 사이트를 함께 관리합니다. 로컬 경로는 `/Users/msyu/study/geulbugi`, 사이트 경로는 `/Users/msyu/study/geulbugi/website`입니다. 기존 사이트 커밋 이력은 유지하며 별도의 clone이나 worktree는 만들지 않았습니다.

## Vercel 배포

GitHub 저장소 `alstjs1207/geulbugi`를 연결하고 Vercel 프로젝트의 **Root Directory를 `website`**로 선택합니다. Framework Preset은 **Other**입니다. 사이트의 `dist/`만 배포하며 확장 프로그램 소스·개인 설정 백업은 배포 산출물에 포함하지 않습니다.

`vercel.json`에 다음 설정이 포함돼 있습니다.

- Build Command: `npm run build`
- Output Directory: `dist`
- HTTPS 사이트용 보안 헤더, clean URL, trailing slash.

Vercel에서는 시스템 환경 변수 `VERCEL_PROJECT_PRODUCTION_URL`을 사용해 실제 프로덕션 도메인을 canonical, 절대 Open Graph 이미지 URL, sitemap과 robots.txt에 자동 반영합니다. 다른 호스팅이나 도메인을 명시하려면 `SITE_URL`에 `https://도메인` 형식으로 입력하세요. 로컬에서 두 값이 없으면 임의의 도메인을 넣지 않습니다.

공식 참고: [Vercel 프로젝트 설정](https://vercel.com/docs/project-configuration), [빌드 설정](https://vercel.com/docs/builds/configure-a-build), [시스템 환경 변수](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_production_url).

## 스토어 출시 후

`site.config.js`의 `chromeWebStoreUrl`에 검증한 실제 공개 스토어 URL을 넣고 다시 배포하면 설치 링크와 버튼 문구가 연결됩니다. 빈 상태에서는 미공개 스토어로 연결하지 않고 출시·설치 안내를 보여 줍니다. 프로그램 심사 제출·공개 출시를 실행하는 기능은 없습니다.

## 이미지와 데이터 처리

제품 이미지는 **v0.1.29를 직접 실행해 찍은 로컬 예시 문서 캡처**입니다. 실제 네이버 사이트나 개인 원고를 촬영한 이미지가 아닙니다. AI 생성 UI는 사이트에 사용하지 않습니다. 원본 PNG는 `assets/screenshots/`에 보존하며 크롭 이외의 재구성·보정은 하지 않았습니다.

거북이 이미지는 승인된 기존 원본과 제품 아이콘을 사용합니다. 페이지는 외부 분석·광고·쿠키 도구나 원격 폰트 요청 없이 작동합니다. 문의 링크는 메일 앱을 열며, 사이트에서 문의 내용을 수집하지 않습니다. Vercel 등 호스팅 제공자의 접속 로그 처리는 해당 제공자의 정책에 따릅니다.
