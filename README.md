# Space3D 코딩 에이전트 벤치마크

같은 스펙 하나를 **Claude Opus 5 · Claude Fable 5 · GPT-5.6-Sol · Grok 4.5** 에
각각 시켜 만들게 하고, 시간 · 토큰 · 버그 · 품질을 계측한 기록. 4개 모델 · 5회 실행.

과제는 **어린이 교육용 3D 태양계 시뮬레이터** — Three.js, 실제 천체 위치 계산,
하루 단위 날짜 이동, 지구에서 보는 달의 위상.

🎬 **[촬영용 16:9 덱 → space3d-video-deck.vercel.app](https://space3d-video-deck.vercel.app)** · [대본](video/script.md)
🎞️ **[발표 덱 → space3d-benchmark-deck.vercel.app](https://space3d-benchmark-deck.vercel.app)**
📊 **[상세 리포트 → space3d-benchmark-report.vercel.app](https://space3d-benchmark-report.vercel.app)**

## 배포된 결과물

| 모델 | URL | 상태 |
|---|---|---|
| `gpt-5.6-sol` | [space3d-sol](https://space3d-sol.vercel.app) | ✅ 정상 |
| `claude-fable-5` | [space3d-fable5](https://space3d-fable5.vercel.app) | ✅ 정상 |
| `claude-opus-5` 1회차 | [space3d-opus5](https://space3d-opus5.vercel.app) | ❌ 창 높이 따라 3D 씬 소실 |
| `claude-opus-5` 2회차 | [space3d-opus5-run2](https://space3d-opus5-run2.vercel.app) | ❌ 태양 블룸 폭주 |
| `grok-4.5` | [space3d-grok45](https://space3d-grok45.vercel.app) | ❌ 렌즈플레어 고스트 |
| `claude-fable-5.1` (번외) | [space3d-fable51](https://space3d-fable51.vercel.app) | ✅ 정상 · 벤치마크 외 |

## 결과

| 모델 | 시간 | 시도 | 턴 | 비캐시 토큰 | 총 토큰 | 비용(API 환산) | 자동검증 | 코드 |
|---|---|---|---|---|---|---|---|---|
| `grok-4.5` | 10.3분 | 1 | 17 | 131,492 | 1,039,396 | $0.73 | 10/10 | 5,078줄 |
| `gpt-5.6-sol` | 26.8분 | 1 | N/A | 256,181 | 4,554,421 | $5.00 | 10/10 | 4,173줄 |
| `claude-fable-5` | 32.9분 | 1 | 82 | 301,485 | 7,531,034 | $17.18 | 10/10 | 4,416줄 |
| `claude-opus-5 · claude-opus5-high-run2` | 35.7분 | 1 | 55 | 366,268 | 6,839,478 | $9.56 | 10/10 | 7,578줄 |
| `claude-opus-5 · claude-opus5-high` | 120.0분 | 2 | 153 | 611,136 | 32,150,726 | $25.52 | 10/10 | 8,293줄 |

### 캐시 / 비캐시 분리

| 모델 | 신규 입력 | 캐시 쓰기 | 출력 | **비캐시 합** | 캐시 읽기 | 총계 | 비캐시 비율 |
|---|---|---|---|---|---|---|---|
| `grok-4.5` | 82,465 | 0 | 49,027 | **131,492** | 907,904 | 1,039,396 | 12.7% |
| `gpt-5.6-sol` | 193,393 | 0 | 62,788 | **256,181** | 4,298,240 | 4,554,421 | 5.6% |
| `claude-fable-5` | 110 | 170,675 | 130,700 | **301,485** | 7,229,549 | 7,531,034 | 4.0% |
| `claude-opus-5 · claude-opus5-high-run2` | 102 | 188,865 | 177,301 | **366,268** | 6,473,210 | 6,839,478 | 5.4% |
| `claude-opus-5 · claude-opus5-high` | 280 | 368,182 | 242,674 | **611,136** | 31,539,590 | 32,150,726 | 1.9% |

**비캐시 합**이 모델이 실제로 새로 처리한 양이다. 캐시 읽기는 같은 문맥을
매 턴 다시 읽은 누적치라 턴 수에 비례하며, 작업량과는 무관하다.

### 생성 효율

| 모델 | 출력 토큰 | 산출 코드 | 출력/줄 | 턴 | 시도 |
|---|---|---|---|---|---|
| `grok-4.5` | 49,027 | 5,078줄 | **9.7** | 17 | 1 |
| `gpt-5.6-sol` | 62,788 | 4,173줄 | **15.0** | N/A | 1 |
| `claude-opus-5 · claude-opus5-high-run2` | 177,301 | 7,578줄 | **23.4** | 55 | 1 |
| `claude-opus-5 · claude-opus5-high` | 242,674 | 8,293줄 | **29.3** | 153 | 2 |
| `claude-fable-5` | 130,700 | 4,416줄 | **29.6** | 82 | 1 |


## 핵심

**자동 검증은 아무것도 걸러내지 못했다.** 다섯 실행 전부 빌드 성공 · 역법
자체테스트 통과 · 프리뷰 200 응답으로 **10/10 만점**인데, 브라우저에서
열어보면 **2승 3패**다. 셸 명령으로 짤 수 있는 체크는 픽셀을 보지 못한다.

**역법 정확도는 다섯 구현이 동일했다.** 행성 일심황경 상호 편차 **0.0000°**,
삭망월 오차 4.44~4.56분. 가장 어려워 보였던 요소에 변별력이 없었다.

**총 토큰으로 순위를 매기면 안 된다.** opus-5 1회차는 총 32.15M 중 98.1%가
캐시 읽기다 — 턴 수의 함수이지 작업량이 아니다.

## 디렉토리

```
sol/       gpt-5.6-sol 결과물
fable5/    claude-fable-5 결과물
opus5/     claude-opus-5 1회차
opus5r2/   claude-opus-5 2회차
grok45/    grok-4.5 결과물
fable51/   claude-fable-5.1 번외 결과물 (v1 스펙, 벤치마크 미포함)
deck/      발표용 슬라이드 덱 (키보드 전환)
video/     촬영용 16:9 덱 + 나레이션 대본 + 썸네일
recording/ 촬영 세팅 (OBS 구성 · 원형 마스크)
report/    상세 HTML 리포트 (자체완결)
SPEC.md    과제 스펙
PROMPT.md  에이전트에 전달된 프롬프트 전문
bench.json 벤치마크 설정
```

## 각 결과물 실행

```bash
cd sol   # 또는 fable5, opus5, opus5r2, grok45
npm install && npm run build && npm run selftest
```

## 번외: claude-fable-5.1 (2026-09-02)

Fable 5.1 출시 후 같은 과제를 한 번 더 시켰다. **순위표에는 넣지 않는다.**

- 벤치마크 하네스가 아니라 대화형 Claude Code 세션에서 실행. 시간·토큰 계측 없음.
- 스펙이 다르다. 이 실행은 원본 v1 스펙(`space3d/SPEC.md`)을 썼다 — 실시간 역법,
  날짜 컨트롤, 달 관측 뷰, `selftest` 항목이 없는 버전. 그래서 `npm run selftest`도 없다.
- 결과: `npm run build` 성공, 배포 [space3d-fable51](https://space3d-fable51.vercel.app).
  헤드리스(SwiftShader)로 콘솔 에러 0 · 행성 클릭 fly-in · 패널 데이터 · 토성 고리 · 궤도 빛 흐름 확인.
  휠 줌·모바일·실 GPU 프레임레이트는 미확인.
- 개발 중 잡은 버그: 렌즈플레어 bright-pass 를 블룸 **뒤**에 두면 블룸 헤일로가 threshold 를 넘어
  화면 전체가 고스트로 덮인다(grok-4.5 실패 모드와 같은 계열). 플레어를 블룸 앞으로 옮겨 해결.
  `?flare=0&bloom=0&grain=0` 로 패스별 끄기 가능.
- 스크린샷: `docs/screenshots/fable51-*.jpg`

```bash
cd fable51 && npm install && npm run build
```

## 라이선스

텍스처: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0)
