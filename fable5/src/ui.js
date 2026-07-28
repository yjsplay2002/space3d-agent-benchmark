/**
 * ui.js — HUD, 시간/날짜 컨트롤, 정보 패널(글래스), 로딩 화면
 */
import { BODY_DATA, moonPhaseExplanation } from "./data/bodies.js";
import { dateFromJD } from "./ephemeris.js";

export function createUI(callbacks) {
  const {
    onPlayToggle,
    onSpeedChange,
    onDateStep, // (deltaDays) => void
    onToday,
    onOverview,
  } = callbacks;

  const root = document.createElement("div");
  root.id = "hud";
  root.innerHTML = `
    <div id="loading">
      <div class="loading-inner">
        <div class="loading-title">우리 태양계 탐험</div>
        <div class="loading-sub">우주선 시동 거는 중…</div>
        <div class="loading-bar"><div class="loading-fill"></div></div>
        <div class="loading-pct">0%</div>
      </div>
    </div>

    <div class="hud-topleft">
      <h1 class="hud-title">우리 태양계 탐험</h1>
      <p class="hud-hint">행성을 클릭해 보세요 · 휠로 확대/축소</p>
    </div>

    <div class="hud-topcenter">
      <span class="scale-badge">⚠ 크기·거리는 실제 비율이 아니에요 (교육용 압축 스케일 · 배치 각도는 실제)</span>
    </div>

    <button id="btn-overview" class="hud-btn hidden">✕ 전체 보기 <span class="kbd">ESC</span></button>

    <aside id="info-panel" class="hidden"></aside>

    <div id="time-bar">
      <div class="tb-group tb-play">
        <button id="btn-play" class="tb-btn" title="일시정지/재생">⏸</button>
        <div class="tb-speed">
          <input id="speed-slider" type="range" min="-1" max="3" step="0.01" value="0" />
          <div class="tb-speed-label"><span id="speed-value">1×</span><span class="tb-speed-note">1× = 1초에 하루</span></div>
        </div>
      </div>
      <div class="tb-divider"></div>
      <div class="tb-group tb-date">
        <button id="btn-prev-day" class="tb-btn tb-daybtn" title="하루 전 (←)">◀ 하루 전</button>
        <div class="tb-date-display">
          <div id="date-main">—</div>
          <button id="btn-today" class="tb-today">오늘</button>
        </div>
        <button id="btn-next-day" class="tb-btn tb-daybtn" title="하루 후 (→)">하루 후 ▶</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const els = {
    loading: root.querySelector("#loading"),
    loadingFill: root.querySelector(".loading-fill"),
    loadingPct: root.querySelector(".loading-pct"),
    panel: root.querySelector("#info-panel"),
    btnOverview: root.querySelector("#btn-overview"),
    btnPlay: root.querySelector("#btn-play"),
    slider: root.querySelector("#speed-slider"),
    speedValue: root.querySelector("#speed-value"),
    dateMain: root.querySelector("#date-main"),
  };

  /* ----- 이벤트 ----- */
  els.btnPlay.addEventListener("click", () => onPlayToggle());
  els.slider.addEventListener("input", () => {
    const speed = Math.pow(10, parseFloat(els.slider.value)); // 0.1x ~ 1000x (로그)
    onSpeedChange(speed);
  });
  root.querySelector("#btn-prev-day").addEventListener("click", () => onDateStep(-1));
  root.querySelector("#btn-next-day").addEventListener("click", () => onDateStep(1));
  root.querySelector("#btn-today").addEventListener("click", () => onToday());
  els.btnOverview.addEventListener("click", () => onOverview());

  /* ----- 로딩 ----- */
  function setLoadingProgress(loaded, total) {
    const pct = Math.round((loaded / total) * 100);
    els.loadingFill.style.width = `${pct}%`;
    els.loadingPct.textContent = `텍스처 로딩 중 ${pct}%`;
  }
  function hideLoading() {
    els.loading.classList.add("fade-out");
    setTimeout(() => els.loading.remove(), 900);
  }

  /* ----- 시간/날짜 표시 ----- */
  const dateFmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  let lastDateStr = "";
  function setJD(jd) {
    const str = dateFmt.format(dateFromJD(jd));
    if (str !== lastDateStr) {
      lastDateStr = str;
      els.dateMain.textContent = str;
    }
  }
  function setPlaying(playing) {
    els.btnPlay.textContent = playing ? "⏸" : "▶";
  }
  function setSpeedDisplay(speed) {
    els.speedValue.textContent =
      speed >= 100 ? `${Math.round(speed)}×` : speed >= 10 ? `${speed.toFixed(0)}×` : `${speed.toFixed(1)}×`;
  }

  /* ----- 정보 패널 ----- */

  function countUp(el, target, decimals = 0, suffix = "") {
    const dur = 900;
    const t0 = performance.now();
    function tick(t) {
      const f = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - f, 3);
      const v = target * eased;
      el.textContent =
        (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("ko-KR")) + suffix;
      if (f < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  let selectedKey = null;

  function showPanel(key, phase) {
    selectedKey = key;
    const d = BODY_DATA[key];
    if (!d) return;
    const isMoon = key === "moon";

    const rows = [
      ["지름", { num: d.stats.diameterKm, suffix: " km" }],
      ["질량", d.stats.mass],
      [isMoon ? "지구까지 거리" : "태양까지 거리", d.stats.distanceText],
      ["공전 주기", d.stats.orbitalPeriodText],
      ["자전 주기", d.stats.rotationPeriodText],
      ["평균 온도", d.stats.tempText],
      ["위성 수", { num: d.stats.moons, suffix: "개" }],
      ["중력 (지구=1)", { num: d.stats.gravity, suffix: "", decimals: 2 }],
    ];

    els.panel.innerHTML = `
      <div class="ip-header stagger" style="--i:0">
        <span class="ip-emoji">${d.emoji}</span>
        <div>
          <div class="ip-name">${d.nameKo} <span class="ip-name-en">${d.nameEn}</span></div>
          <div class="ip-type">${d.type}</div>
        </div>
      </div>
      ${
        isMoon
          ? `<div class="ip-moon-why stagger" style="--i:1">
               <div class="ip-sec-title">🌗 지금 달이 이렇게 보이는 이유</div>
               <p id="moon-why-text"></p>
             </div>`
          : ""
      }
      <table class="ip-table">
        ${rows
          .map(
            ([k, v], i) => `
          <tr class="stagger" style="--i:${i + 2}">
            <th>${k}</th>
            <td>${
              typeof v === "object"
                ? `<span class="countup" data-num="${v.num}" data-dec="${v.decimals ?? 0}" data-suffix="${v.suffix}">0</span>`
                : v
            }</td>
          </tr>`
          )
          .join("")}
      </table>
      <div class="ip-facts stagger" style="--i:11">
        <div class="ip-sec-title">✨ 재미있는 사실</div>
        <ul>${d.facts.map((f) => `<li>${f}</li>`).join("")}</ul>
      </div>
      <div class="ip-spin stagger" style="--i:12">🔄 ${d.spinNote}</div>
    `;

    els.panel.classList.remove("hidden");
    els.panel.classList.remove("slide-in");
    void els.panel.offsetWidth; // 재시작 트릭
    els.panel.classList.add("slide-in");
    els.btnOverview.classList.remove("hidden");

    // 숫자 카운트업 (데이터 "물질화")
    els.panel.querySelectorAll(".countup").forEach((el) => {
      countUp(el, parseFloat(el.dataset.num), parseInt(el.dataset.dec), el.dataset.suffix);
    });

    if (isMoon && phase) updateMoonExplanation(phase);
  }

  /** 달 패널의 동적 설명 갱신 (날짜 변경 시 즉시 반영) */
  function updateMoonExplanation(phase) {
    const el = els.panel.querySelector("#moon-why-text");
    if (el) el.textContent = moonPhaseExplanation(phase);
  }

  function hidePanel() {
    selectedKey = null;
    els.panel.classList.add("hidden");
    els.btnOverview.classList.add("hidden");
  }

  return {
    setLoadingProgress,
    hideLoading,
    setJD,
    setPlaying,
    setSpeedDisplay,
    showPanel,
    hidePanel,
    updateMoonExplanation,
    get selectedKey() {
      return selectedKey;
    },
  };
}
