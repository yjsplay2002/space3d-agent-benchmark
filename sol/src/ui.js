import BODY_DATA from './data/bodies.js';
import { moonPhaseExplanation } from './moonview.js';

const numberFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

export function formatKoreanDate(date) {
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

function animateTextNumber(element, target) {
  const match = target.match(/[\d,.]+/);
  if (!match) {
    element.textContent = target;
    return;
  }
  const value = Number(match[0].replaceAll(',', ''));
  if (!Number.isFinite(value)) {
    element.textContent = target;
    return;
  }
  const before = target.slice(0, match.index);
  const after = target.slice(match.index + match[0].length);
  const decimals = (match[0].split('.')[1] || '').length;
  const start = performance.now();
  const duration = 680;
  const frame = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = value * eased;
    element.textContent = `${before}${numberFormatter.format(Number(current.toFixed(decimals)))}${after}`;
    if (p < 1) requestAnimationFrame(frame);
    else element.textContent = target;
  };
  requestAnimationFrame(frame);
}

export class SpaceUI {
  constructor(app, callbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.selectedId = null;
    this.playing = true;
    this.speed = 1;
    this.build();
    this.bind();
  }

  build() {
    this.app.insertAdjacentHTML('beforeend', `
      <div class="loading-screen" data-loading>
        <div class="loading-orbit"><i></i><span>SPACE3D</span></div>
        <p>태양계 항법 데이터를 불러오는 중</p>
        <div class="loading-track"><b data-loading-bar></b></div>
        <strong data-loading-text>0%</strong>
      </div>

      <header class="mission-header hud-corners">
        <p class="eyebrow"><span></span> LIVE ORBITAL LAB</p>
        <h1>우리 태양계 <em>탐험</em></h1>
        <p class="mission-hint">행성이나 이름을 클릭해 보세요</p>
      </header>

      <div class="scale-notice"><i>i</i> 교육용 압축 축척 · 실제 크기와 거리 비율이 아닙니다</div>
      <div class="orientation-gizmo" aria-hidden="true">
        <span class="axis axis-x">X</span><span class="axis axis-y">Y</span>
        <i></i><small>황도면 · 실제 UTC 위치</small>
      </div>

      <section class="moon-observatory hud-corners" data-moon-root aria-label="지구에서 보는 오늘의 달">
        <header>
          <div>
            <span class="eyebrow"><b></b> EARTH OBSERVATORY</span>
            <h2>지구에서 보는 달</h2>
          </div>
          <div class="live-badge">LIVE</div>
        </header>
        <div class="moon-visual">
          <canvas aria-label="달 위상 렌더"></canvas>
          <span class="sun-direction">☀ 태양 방향</span>
        </div>
        <div class="moon-phase-title">
          <strong data-moon-phase>—</strong>
          <span data-full-date>다음 보름 · —</span>
        </div>
        <dl class="moon-metrics">
          <div><dt>조명률</dt><dd data-illumination>—</dd></div>
          <div><dt>월령</dt><dd data-age>—</dd></div>
          <div><dt>보름까지</dt><dd data-full>—</dd></div>
        </dl>
        <button class="moon-focus" data-select-moon><span>달의 위상 원리 탐험</span><b>↗</b></button>
      </section>

      <button class="overview-button" data-overview><span>◎</span> 전체 보기 <kbd>ESC</kbd></button>

      <aside class="body-panel hud-corners" data-body-panel aria-live="polite">
        <button class="panel-close" data-close-panel aria-label="정보 패널 닫기">×</button>
        <div class="panel-scan"></div>
        <header>
          <span class="body-icon" data-body-icon>🌍</span>
          <div>
            <p class="eyebrow">CELESTIAL OBJECT / <b data-body-type>행성</b></p>
            <h2><span data-body-ko>지구</span><small data-body-en>EARTH</small></h2>
          </div>
        </header>
        <div class="panel-divider"><i></i><span>LIVE DATA</span></div>
        <div class="body-stats" data-body-stats></div>
        <section class="direction-note">
          <span>↻</span><div><b>움직임의 방향</b><p data-direction></p></div>
        </section>
        <section class="phase-reason" data-phase-reason>
          <b>◐ 지금 달이 이렇게 보이는 이유</b>
          <p data-phase-explanation></p>
        </section>
        <section class="facts">
          <h3><span>✦</span> 재미있는 사실</h3>
          <ul data-facts></ul>
        </section>
      </aside>

      <footer class="time-console hud-corners">
        <div class="date-jump">
          <button data-day="-1" title="하루 전 (←)">‹ <span>하루 전</span></button>
          <button class="today-button" data-today>오늘</button>
          <button data-day="1" title="하루 후 (→)"><span>하루 후</span> ›</button>
        </div>
        <div class="current-date">
          <small>SIMULATION DATE · UTC</small>
          <strong data-current-date>—</strong>
        </div>
        <div class="playback">
          <button class="play-button" data-play aria-label="일시정지">Ⅱ</button>
          <div class="speed-control">
            <div><span>시간 속도</span><output data-speed-output>1×</output></div>
            <input data-speed type="range" min="0" max="100" value="25" aria-label="시뮬레이션 속도" />
            <div class="speed-scale"><span>0.1×</span><span>1×</span><span>1,000×</span></div>
          </div>
        </div>
      </footer>

      <div class="key-hint">
        <kbd>←</kbd><kbd>→</kbd><span>날짜 이동</span><i></i><span>휠로 줌</span><i></i>
        <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Textures · Solar System Scope · CC BY 4.0</a>
      </div>
    `);
    this.elements = {
      loading: this.app.querySelector('[data-loading]'),
      loadingBar: this.app.querySelector('[data-loading-bar]'),
      loadingText: this.app.querySelector('[data-loading-text]'),
      date: this.app.querySelector('[data-current-date]'),
      panel: this.app.querySelector('[data-body-panel]'),
      speed: this.app.querySelector('[data-speed]'),
      speedOutput: this.app.querySelector('[data-speed-output]'),
      play: this.app.querySelector('[data-play]'),
    };
  }

  bind() {
    this.app.querySelectorAll('[data-day]').forEach((button) => {
      button.addEventListener('click', () => this.callbacks.changeDay(Number(button.dataset.day)));
    });
    this.app.querySelector('[data-today]').addEventListener('click', this.callbacks.today);
    this.app.querySelector('[data-overview]').addEventListener('click', this.callbacks.overview);
    this.app.querySelector('[data-close-panel]').addEventListener('click', this.callbacks.overview);
    this.app.querySelector('[data-select-moon]').addEventListener('click', () => this.callbacks.select('moon'));
    this.elements.play.addEventListener('click', () => {
      this.playing = !this.playing;
      this.elements.play.textContent = this.playing ? 'Ⅱ' : '▶';
      this.elements.play.setAttribute('aria-label', this.playing ? '일시정지' : '재생');
      this.callbacks.play(this.playing);
    });
    this.elements.speed.addEventListener('input', () => {
      this.speed = 10 ** (Number(this.elements.speed.value) / 25 - 1);
      const precision = this.speed < 1 ? 1 : this.speed < 10 ? 1 : 0;
      this.elements.speedOutput.value = `${this.speed.toFixed(precision)}×`;
      this.callbacks.speed(this.speed);
    });
  }

  setLoading(progress) {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    this.elements.loadingBar.style.width = `${percent}%`;
    this.elements.loadingText.textContent = `${percent}%`;
  }

  finishLoading() {
    this.setLoading(1);
    setTimeout(() => this.elements.loading.classList.add('is-done'), 260);
  }

  setDate(date) {
    this.elements.date.textContent = formatKoreanDate(date);
    this.elements.date.classList.remove('pulse');
    requestAnimationFrame(() => this.elements.date.classList.add('pulse'));
  }

  select(id, phase) {
    const body = BODY_DATA[id];
    if (!body) return;
    this.selectedId = id;
    const panel = this.elements.panel;
    panel.querySelector('[data-body-icon]').textContent = body.icon;
    panel.querySelector('[data-body-type]').textContent = body.type;
    panel.querySelector('[data-body-ko]').textContent = body.ko;
    panel.querySelector('[data-body-en]').textContent = body.en.toUpperCase();
    panel.querySelector('[data-direction]').textContent = body.direction;
    const stats = [
      ['지름', body.diameter], ['질량', body.mass], ['태양까지 거리', body.distance],
      ['공전 주기', body.orbit], ['자전 주기', body.rotation],
      ['평균 온도', body.temperature], ['위성 수', body.moons], ['중력', `${body.gravity} G⊕`],
    ];
    const statsRoot = panel.querySelector('[data-body-stats]');
    statsRoot.innerHTML = stats.map(([label, value], index) => `
      <div class="stat-row materialize" style="--delay:${index * 44}ms">
        <span>${label}</span><strong data-target="${value.replaceAll('"', '&quot;')}"></strong>
      </div>
    `).join('');
    statsRoot.querySelectorAll('strong').forEach((element) => {
      setTimeout(() => animateTextNumber(element, element.dataset.target), 180);
    });
    panel.querySelector('[data-facts]').innerHTML = body.facts.map((fact, index) => (
      `<li class="materialize" style="--delay:${410 + index * 70}ms"><i>${index + 1}</i><span>${fact}</span></li>`
    )).join('');
    const phaseReason = panel.querySelector('[data-phase-reason]');
    phaseReason.hidden = id !== 'moon';
    if (id === 'moon' && phase) {
      panel.querySelector('[data-phase-explanation]').textContent = moonPhaseExplanation(phase);
    }
    panel.classList.add('is-open');
  }

  updateSelectedPhase(phase) {
    if (this.selectedId === 'moon') {
      this.elements.panel.querySelector('[data-phase-explanation]').textContent = moonPhaseExplanation(phase);
    }
  }

  clearSelection() {
    this.selectedId = null;
    this.elements.panel.classList.remove('is-open');
  }
}
