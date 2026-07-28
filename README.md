# Space3D 코딩 에이전트 벤치마크

같은 스펙 하나를 **Claude Opus 5 · GPT-5.6-Sol · Grok 4.5** 세 에이전트 CLI에
각각 시켜 만들게 하고, 소요 시간 · 토큰 · 버그 · 품질을 계측한 기록.

과제는 **어린이 교육용 3D 태양계 시뮬레이터** — Three.js, 실제 천체 위치 계산,
하루 단위 날짜 이동, 지구에서 보는 달의 위상 표시.

📊 **[전체 리포트 보기 → REPORT.md](REPORT.md)**

## 🚀 배포된 결과물

각 모델이 만든 앱을 직접 열어볼 수 있습니다.

| 모델 | 배포 URL | 상태 |
|---|---|---|
| `gpt-5.6-sol` | **https://space3d-sol.vercel.app** | ✅ 정상 |
| `claude-opus-5` | https://space3d-opus5.vercel.app | ⚠️ 창 높이에 따라 3D 씬 소실 (창을 세로로 키우면 정상) |
| `grok-4.5` | https://space3d-grok45.vercel.app | ⚠️ 렌즈플레어 고스트로 화면 대부분 가려짐 |

## 결과 요약

| 모델 | 시간 | 총 토큰 | 자동검증 | 실제 렌더링 | 품질 |
|---|---|---|---|---|---|
| 🥇 `gpt-5.6-sol` | 26.8분 | 4.55M | 10/10 | ✅ 정상 | 43/50 |
| 🥈 `claude-opus-5` | 120분 | 32.2M | 10/10 | ❌ 특정 창 크기에서 3D 씬 소실 | 36/50 |
| 🥉 `grok-4.5` | 10.3분 | 1.04M | 10/10 | ❌ 렌즈플레어 고스트 · 달 명암 반전 | 31/50 |

**핵심**: 세 결과물 모두 자동 검증(빌드 · 역법 자체테스트 · 프리뷰 응답)에서
**10/10 만점**을 받았다. 그런데 브라우저에서 열어보면 둘은 망가져 있다.
셸 명령으로 짤 수 있는 검증만으로는 이 차이를 잡을 수 없었다.

역법 정확도는 셋이 사실상 동일했다 — 행성 황경 상호 편차 **0.0000°**,
삭망월 오차 모두 4.5분 수준. 변별력은 렌더링 품질에서 나왔다.

## 디렉토리

```
sol/      gpt-5.6-sol 결과물     (Vite + Three.js)
opus5/    claude-opus-5 결과물
grok45/   grok-4.5 결과물
SPEC.md   과제 스펙
PROMPT.md 에이전트에 전달된 프롬프트 전문
bench.json 벤치마크 설정 (모델 · effort · 검증 체크)
docs/screenshots/  시각 검증 증거
```

## 각 결과물 실행

```bash
cd sol   # 또는 opus5, grok45
npm install
npm run dev       # 개발 서버
npm run build     # 프로덕션 빌드
npm run selftest  # 역법 자체 검증
```

## 재현

벤치마크는 [`coding-benchmark`](https://github.com/) 스킬로 실행했다.

```bash
python3 scripts/doctor.py                              # CLI 설치·인증 점검
python3 scripts/run_benchmark.py --config bench.json   # 순차 실행 (재시도 포함)
python3 scripts/verify.py --config bench.json          # 자동 검증
```

## 라이선스

텍스처: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0)
