# Space3D 코딩 에이전트 벤치마크

같은 스펙 하나를 **Claude Opus 5 · Claude Fable 5 · GPT-5.6-Sol · Grok 4.5** 에
각각 시켜 만들게 하고, 시간 · 토큰 · 버그 · 품질을 계측한 기록. 4개 모델 · 5회 실행
+ 추가 실행 1회 (**Claude Fable 5.1**, 2026-09-02, 재구성 하네스 — 아래 참조).

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
| `claude-fable-5.1` | [space3d-fable51-bench](https://space3d-fable51-bench.vercel.app) | ✅ 정상 (2026-09-02 추가 실행) |
| `claude-opus-5` 1회차 | [space3d-opus5](https://space3d-opus5.vercel.app) | ❌ 창 높이 따라 3D 씬 소실 |
| `claude-opus-5` 2회차 | [space3d-opus5-run2](https://space3d-opus5-run2.vercel.app) | ❌ 태양 블룸 폭주 |
| `grok-4.5` | [space3d-grok45](https://space3d-grok45.vercel.app) | ❌ 렌즈플레어 고스트 |

## 결과

| 모델 | 시간 | 시도 | 턴 | 비캐시 토큰 | 총 토큰 | 비용(API 환산) | 자동검증 | 코드 |
|---|---|---|---|---|---|---|---|---|
| `grok-4.5` | 10.3분 | 1 | 17 | 131,492 | 1,039,396 | $0.73 | 10/10 | 5,078줄 |
| `gpt-5.6-sol` | 26.8분 | 1 | N/A | 256,181 | 4,554,421 | $5.00 | 10/10 | 4,173줄 |
| `claude-fable-5` | 32.9분 | 1 | 82 | 301,485 | 7,531,034 | $17.18 | 10/10 | 4,416줄 |
| `claude-opus-5 · claude-opus5-high-run2` | 35.7분 | 1 | 55 | 366,268 | 6,839,478 | $9.56 | 10/10 | 7,578줄 |
| `claude-fable-5.1` ¹ | 51.2분 | 1 | 94 | 404,331 | 7,729,714 | $18.33 | 10/10 | 3,721줄 |
| `claude-opus-5 · claude-opus5-high` | 120.0분 | 2 | 153 | 611,136 | 32,150,726 | $25.52 | 10/10 | 8,293줄 |

### 캐시 / 비캐시 분리

| 모델 | 신규 입력 | 캐시 쓰기 | 출력 | **비캐시 합** | 캐시 읽기 | 총계 | 비캐시 비율 |
|---|---|---|---|---|---|---|---|
| `grok-4.5` | 82,465 | 0 | 49,027 | **131,492** | 907,904 | 1,039,396 | 12.7% |
| `gpt-5.6-sol` | 193,393 | 0 | 62,788 | **256,181** | 4,298,240 | 4,554,421 | 5.6% |
| `claude-fable-5` | 110 | 170,675 | 130,700 | **301,485** | 7,229,549 | 7,531,034 | 4.0% |
| `claude-opus-5 · claude-opus5-high-run2` | 102 | 188,865 | 177,301 | **366,268** | 6,473,210 | 6,839,478 | 5.4% |
| `claude-fable-5.1` ¹ | 5,114 | 245,193 | 154,024 | **404,331** | 7,325,383 | 7,729,714 | 5.2% |
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
| `claude-fable-5.1` ¹ | 154,024 | 3,721줄 | **41.4** | 94 | 1 |

¹ 2026-09-02 추가 실행. 다른 PC(Windows) · 재구성 하네스 · claude CLI 2.1.258. 자세한 조건은 아래 "추가 실행" 참조.


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
fable51/   claude-fable-5.1 결과물 (2026-09-02 추가 실행)
fable51-v1spec/  claude-fable-5.1 이 v1 스펙(역법·달 관측 없는 초기 스펙)으로 만든 별도 결과물 — 순위 무관
harness/   run_benchmark.py — 원본 하네스 재구성본 (fable51 실행에 사용)
docs/bench/claude-fable51-high/  fable51 실행 원본 계측 (summary · metrics · verify · harness.log)
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
cd sol   # 또는 fable5, fable51, opus5, opus5r2, grok45
npm install && npm run build && npm run selftest
```

## 추가 실행: claude-fable-5.1 (2026-09-02)

Fable 5.1 출시 후 같은 `PROMPT.md`(확장 스펙 전문 포함)로 한 번 더 돌렸다.
표에는 ¹ 표시로 들어가 있다. **원래 5회와 같은 조건이 아닌 점**:

- 원본 하네스 스크립트가 없는 PC라 `harness/run_benchmark.py` 로 재구성했다. bench.json 의미론은 같다
  (빈 디렉토리 · `claude -p --safe-mode --effort high` · verify 10항목 · critical 실패 시 resume 재시도 최대 6회 ·
  실패 출력 되먹임 · 시도 합산). 원본과 완전히 동일함은 보장 못 한다.
- 실행 환경: Windows 11 · claude CLI 2.1.258 · node 22.22.3. 원래 5회는 claude 2.1.220.
- 첫 실행은 20분·20턴 만에 claude.ai 월 지출 한도(HTTP 429)로 중단됐다. 그 실행은 폐기하고 한도 상향 후
  처음부터 다시 돌린 결과가 표의 값이다. 폐기분(약 $7)은 표에 포함하지 않았다.
- 시각 검증: 1440×980 · 1456×816 두 뷰포트 헤드리스(SwiftShader) 스크린샷 `docs/screenshots/fable51-{980,816}.jpg`.
  둘 다 정상 렌더링, 콘솔 에러 0. 달 인셋(2026-09-02 기우는 볼록달, 조명률 72%) 표시.
  품질 점수(블라인드 심사)는 매기지 않았다.
- 원본 계측: `docs/bench/claude-fable51-high/`.

별개로 `fable51-v1spec/` 은 Fable 5.1 이 **v1 스펙**(실시간 역법·날짜 컨트롤·달 관측·selftest 가 없는 초기
`space3d/SPEC.md`)으로 만든 결과물이다. 순위와 무관하며 [space3d-fable51](https://space3d-fable51.vercel.app) 에 배포되어 있다.

```bash
cd fable51 && npm install && npm run build && npm run selftest
python harness/run_benchmark.py --config bench.json --contestant claude-fable51-high
```

## 라이선스

텍스처: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0)
