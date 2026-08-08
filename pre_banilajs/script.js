const { useState, useEffect } = React;

/* ==================== 상수 / 설정 데이터 ==================== */

// 아산시 API 호출 제한 관리 (10분에 1회 호출: 일일 약 144회로 트래픽 500회 제한 방어)
const AIR_FETCH_INTERVAL = 10 * 60 * 1000;

// 센서별 최대값 (막대 그래프 높이 % 계산용)
const SENSOR_MAX = {
  pm10: 150, pm25: 150,
  asan_pm10: 150, asan_pm25: 150,
  co2: 2000, tvoc: 1000,
  temp: 50, humidity: 100,
};

// 예측 탭 데이터 설정
const PREDICT_IMAGES = {
  pm10: { title: '10월 PM10 예측', img: 'image/pm10_prediction_oct.png', content: 'PM10 예측 데이터가 여기에 표시됩니다.' },
  pm25: { title: '10월 PM25 예측', img: 'image/pm25_prediction_oct.png', content: 'PM25 예측 데이터가 여기에 표시됩니다.' },
  co2: { title: '10월 CO2 예측', img: 'image/co2_prediction_oct.png', content: 'CO2 예측 데이터가 여기에 표시됩니다.' },
  tvoc: { title: '10월 TVOC 예측', img: 'image/tvoc_prediction_oct.png', content: 'TVOC 예측 데이터가 여기에 표시됩니다.' },
  temp: { title: '10월 Temperature 예측', img: 'image/temperature_prediction_oct.png', content: '온도 예측 데이터가 여기에 표시됩니다.' },
  humidity: { title: '10월 Humidity 예측', img: 'image/humidity_prediction_oct.png', content: '습도 예측 데이터가 여기에 표시됩니다.' },
};
const PREDICT_LABELS = { pm10: 'PM10', pm25: 'PM25', co2: 'CO2', tvoc: 'TVOC', temp: '온도', humidity: '습도' };

// 데이터 분석 탭 옵션
const ANALYSIS_OPTIONS = [
  { label: '학기 별 CO2 분석', file: 'page/co2_by_weekday.html' },
  { label: '학기 별 전체 값 분석', file: 'page/term_indoor_conditions.html' },
  { label: '온도/습도 분석', file: 'page/temperature_vs_co2.html' },
  { label: '내부/외부 미세먼지 분석', file: 'page/indoor_vs_outdoor_pm10.html' },
];

// 사이드바 강의실 목록
const LOCATION_GROUPS = [
  {
    title: '멀티미디어',
    items: [
      { label: 'M501', location: 'M501' },
      { label: 'M502', location: 'M502' },
      { label: 'M507', location: 'M507' },
      { label: 'M520', location: 'M520' },
    ],
  },
  {
    title: '의료과학관',
    items: [
      { label: '1502', soon: true },
      { label: '1504', soon: true },
      { label: '1506', soon: true },
    ],
  },
  {
    title: '미디어랩스',
    items: [
      { label: 'ML416', soon: true },
      { label: 'ML417', soon: true },
      { label: 'ML418', soon: true },
    ],
  },
];

/* ==================== 아이콘 컴포넌트 ==================== */

function IconPm10() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="7" cy="8" r="1.6" /><circle cx="13" cy="6" r="1.2" /><circle cx="17" cy="10" r="2" />
      <circle cx="9" cy="15" r="2.2" /><circle cx="16" cy="17" r="1.4" />
    </svg>
  );
}
function IconPm25() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8" cy="9" r="1" /><circle cx="13" cy="7" r="0.8" /><circle cx="16" cy="11" r="1.2" />
      <circle cx="10" cy="14" r="1.3" /><circle cx="15" cy="16" r="0.9" /><circle cx="6" cy="15" r="0.7" />
    </svg>
  );
}
function IconCo2() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 17a4 4 0 1 1 1.2-7.8A5 5 0 0 1 17 11a3.5 3.5 0 0 1-.5 6.9H6Z" />
    </svg>
  );
}
function IconTvoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12c2-4 4 4 6 0s4 4 6 0s4 4 6 0" />
    </svg>
  );
}
function IconTemp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z" />
    </svg>
  );
}
function IconHumidity() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  );
}

/* ==================== 데이터 훅 ====================
   기존 코드의 fetchAndDisplaySensorData + updateChartBars 역할을
   하나의 커스텀 훅으로 옮겼습니다. location이 바뀌면 자동으로
   이전 인터벌을 정리하고 새 인터벌을 시작합니다(useEffect cleanup). */

// 아산시(외부) 데이터는 강의실과 무관한 공용 데이터라 모듈 스코프에서 쓰로틀링합니다.
let lastAirFetchTime = 0;
let cachedAirData = null;

function useLiveSensorData(location) {
  const [sensor, setSensor] = useState({ pm10: null, co2: null, temperature: null, pm25: null, tvoc: null, humidity: null });
  const [air, setAir] = useState(cachedAirData || { asan_pm10: null, asan_pm25: null });
  const [iaq, setIaq] = useState({ co2Status: '--', tempStatus: '--', recommendation: '분석 불가' });

  useEffect(() => {
    let cancelled = false;

    async function fetchSensor() {
      try {
        // 현재 선택된 방(location)에 따라 다른 PHP 엔드포인트 호출
        let apiPath = 'CSV/sensor.php'; // 기본 M502
        if (location === 'M501') apiPath = 'CSV/sensor501.php';
        if (location === 'M507') apiPath = 'CSV/sensor507.php';
        if (location === 'M520') apiPath = 'CSV/sensor520.php';

        const res = await fetch(apiPath);
        const result = await res.json();
        if (cancelled) return;

        if (result.success && result.data) {
          const data = result.data;
          setSensor({
            pm10: data.pm10 ?? null,
            co2: data.co2 ?? null,
            temperature: data.temperature ?? null,
            pm25: data.pm25 ?? null,
            tvoc: data.tvoc ?? null,
            humidity: data.humidity ?? null,
          });

          // IAQ 및 추천 로직 계산 (기존과 동일한 규칙)
          const co2 = parseFloat(data.co2);
          const temp = parseFloat(data.temperature);
          let co2Status = '--', tempStatus = '--', recommendation = '분석 불가';

          if (!isNaN(co2)) {
            co2Status = co2 < 300 ? '인구 쾌적' : co2 < 500 ? '인구 보통' : '인구 혼잡';
          }
          if (!isNaN(temp)) {
            tempStatus = temp < 20 ? '온도 낮음' : temp < 24 ? '온도 보통' : '온도 높음';
          }
          if (co2Status !== '--' && tempStatus !== '--') {
            if (co2Status === '인구 쾌적') {
              recommendation = tempStatus === '온도 낮음' ? '에어컨 활동 의심됨' : '평균';
            } else if (co2Status === '인구 보통') {
              recommendation = '평균';
            } else if (co2Status === '인구 혼잡') {
              recommendation = tempStatus === '온도 높음' ? '에어컨 가동 필요' : '평균';
            }
          }
          setIaq({ co2Status, tempStatus, recommendation });
        }

        // 아산시 외부 대기질 데이터 (10분 쓰로틀)
        const now = Date.now();
        if (now - lastAirFetchTime > AIR_FETCH_INTERVAL || lastAirFetchTime === 0) {
          const airRes = await fetch('CSV/airkorea.php');
          const airResult = await airRes.json();
          if (!cancelled && airResult.success && airResult.data) {
            cachedAirData = airResult.data;
            setAir(airResult.data);
            lastAirFetchTime = now;
          }
        }
      } catch (err) {
        console.error('데이터 가져오기 실패', err);
      }
    }

    fetchSensor();
    const intervalId = setInterval(fetchSensor, 5000);

    // 클린업: location이 바뀌거나 컴포넌트가 사라지면 자동으로 폴링 중단
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [location]);

  return { sensor, air, iaq };
}

/* ==================== 재사용 컴포넌트 ==================== */

function StatCard({ icon, label, value, unit, variant }) {
  const Icon = icon;
  return (
    <div className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__icon"><Icon /></div>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value-row">
        <span className="stat-card__value">{value ?? '--'}</span>
        <span className="stat-card__unit">{unit}</span>
      </div>
    </div>
  );
}

function SummaryCard({ iaq, tempStatus, recommendation }) {
  return (
    <section className="summary-card">
      <div className="summary-card__header">
        <h3>종합 공기질 추천 (IAQ)</h3>
        <p>CO2·온도 값을 기준으로 실내 환경 상태를 알려드립니다.</p>
      </div>
      <div className="summary-card__grid">
        <div className="summary-item">
          <div className="summary-item__value">{iaq}</div>
          <div className="summary-item__label">현재 CO2 상태</div>
        </div>
        <div className="summary-item">
          <div className="summary-item__value">{tempStatus}</div>
          <div className="summary-item__label">현재 온도 상태</div>
        </div>
        <div className="summary-item summary-item--highlight">
          <div className="summary-item__value">{recommendation}</div>
          <div className="summary-item__label">종합 추천</div>
        </div>
      </div>
    </section>
  );
}

function BarGroup({ label, value, sensorKey, max }) {
  const numeric = parseFloat(value);
  const pct = !isNaN(numeric) && numeric >= 0 ? Math.min((numeric / max) * 100, 100) : 0;
  return (
    <div className="bar-chart__bar-group">
      <div className="bar-chart__value">{value ?? '--'}</div>
      <div className="bar-chart__bar" data-sensor={sensorKey} style={{ height: `${pct}%` }} />
      <div className="bar-chart__label">{label}</div>
    </div>
  );
}

function CompareCard({ location, pm10, pm25, asanPm10, asanPm25 }) {
  return (
    <section className="compare-card">
      <div className="compare-card__chart">
        <h3>실내·실외 미세먼지 비교</h3>
        <div className="bar-chart-visuals">
          <BarGroup label={<>{location}<br />PM10</>} value={pm10} sensorKey="pm10" max={SENSOR_MAX.pm10} />
          <BarGroup label={<>아산시<br />PM10</>} value={asanPm10} sensorKey="asan_pm10" max={SENSOR_MAX.asan_pm10} />
          <BarGroup label={<>{location}<br />PM25</>} value={pm25} sensorKey="pm25" max={SENSOR_MAX.pm25} />
          <BarGroup label={<>아산시<br />PM25</>} value={asanPm25} sensorKey="asan_pm25" max={SENSOR_MAX.asan_pm25} />
        </div>
      </div>
      <div className="compare-card__side">
        <div className="small-info-card">
          <div className="small-info-card__title">아산시 PM10</div>
          <div className="small-info-card__content">{asanPm10 != null ? `${asanPm10} µg/m³` : '-- µg/m³'}</div>
        </div>
        <div className="small-info-card">
          <div className="small-info-card__title">아산시 PM25</div>
          <div className="small-info-card__content">{asanPm25 != null ? `${asanPm25} µg/m³` : '-- µg/m³'}</div>
        </div>
        <p className="compare-card__note">외부 대기질과 비교해 실내 환기 시점을 판단해보세요.</p>
      </div>
    </section>
  );
}

/* ==================== 탭(페이지) 컴포넌트 ==================== */

function LiveDashboard({ location }) {
  const { sensor, air, iaq } = useLiveSensorData(location);

  return (
    <>
      <section className="page-header">
        <div>
          <h2 className="page-header__title">실시간 공기질</h2>
          <p className="page-header__subtitle">선택한 강의실의 센서 데이터를 5초마다 갱신합니다.</p>
        </div>
        <div className="status-pill">
          <span className="status-pill__dot"></span>
          {location} 측정 중
        </div>
      </section>

      <section className="stat-grid">
        <StatCard icon={IconPm10} label="PM10 · 미세먼지" value={sensor.pm10} unit="µg/m³" variant="pm10" />
        <StatCard icon={IconCo2} label="CO2 · 이산화탄소" value={sensor.co2} unit="ppm" variant="co2" />
        <StatCard icon={IconTemp} label="Temperature · 온도" value={sensor.temperature} unit="℃" variant="temp" />
        <StatCard icon={IconPm25} label="PM2.5 · 초미세먼지" value={sensor.pm25} unit="µg/m³" variant="pm25" />
        <StatCard icon={IconTvoc} label="TVOC · 휘발성유기화합물" value={sensor.tvoc} unit="ppb" variant="tvoc" />
        <StatCard icon={IconHumidity} label="Humidity · 습도" value={sensor.humidity} unit="%" variant="humidity" />
      </section>

      <SummaryCard iaq={iaq.co2Status} tempStatus={iaq.tempStatus} recommendation={iaq.recommendation} />

      <CompareCard location={location} pm10={sensor.pm10} pm25={sensor.pm25} asanPm10={air.asan_pm10} asanPm25={air.asan_pm25} />
    </>
  );
}

function PredictDashboard() {
  const [selected, setSelected] = useState('pm10');
  const data = PREDICT_IMAGES[selected];

  return (
    <>
      <section className="page-header">
        <div>
          <h2 className="page-header__title">예측 정보</h2>
          <p className="page-header__subtitle">AI 모델이 예측한 항목별 월간 추이를 확인하세요.</p>
        </div>
      </section>

      <div className="chip-row">
        {Object.keys(PREDICT_IMAGES).map((key) => (
          <button
            key={key}
            className={`text-btn ${selected === key ? 'active' : ''}`}
            onClick={() => setSelected(key)}
          >
            {PREDICT_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="predict-card">
        <h3>{data.title}</h3>
        <img src={data.img} alt="예측 이미지" className="predict-card__image" />
        <div className="predict-card__footer">
          <span className="predict-card__badge">AI 기반 추천</span>
          <p>{data.content}</p>
        </div>
      </div>
    </>
  );
}

function AnalysisDashboard() {
  const [selected, setSelected] = useState(ANALYSIS_OPTIONS[0].file);

  return (
    <>
      <section className="page-header">
        <div>
          <h2 className="page-header__title">데이터 분석</h2>
          <p className="page-header__subtitle">기간별 추이를 다양한 관점에서 살펴보세요.</p>
        </div>
      </section>

      <div className="chip-row">
        {ANALYSIS_OPTIONS.map((opt) => (
          <button
            key={opt.file}
            className={`text-btn ${selected === opt.file ? 'active' : ''}`}
            onClick={() => setSelected(opt.file)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <iframe className="analysis-frame" src={selected} title="Data Analysis Chart" />
    </>
  );
}

/* ==================== 레이아웃 컴포넌트 ==================== */

function Header({ activeTab, onTabChange, sidebarHidden, onToggleSidebar, currentTime }) {
  const TABS = [
    { key: 'live', label: '실시간' },
    { key: 'predict', label: '예측' },
    { key: 'analysis', label: '데이터 분석' },
  ];

  return (
    <header className="header">
      <div className="header__spectrum" aria-hidden="true"></div>
      <div className="header__inner">
        <div className="header__brand">
          <span className="header__brand-mark">K</span>
          <div className="header__brand-text">
            <strong>K-Tennis</strong>
            <span>실내 공기질 모니터링</span>
          </div>
        </div>

        <nav className="header__nav main-buttons" aria-label="주요 메뉴">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`text-btn main-buttons__btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="header__meta">
          <span className="header__clock">{currentTime}</span>
          <div
            className={`menu-toggle ${sidebarHidden ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="사이드바 열기/닫기"
            onClick={onToggleSidebar}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleSidebar();
              }
            }}
          >
            <div className="menu-toggle__bar"></div>
            <div className="menu-toggle__bar"></div>
            <div className="menu-toggle__bar"></div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ hidden, currentLocation, onSelectLocation }) {
  return (
    <nav className={`sidebar ${hidden ? 'hidden' : ''}`} aria-label="강의실 선택">
      <ul className="sidebar__menu">
        {LOCATION_GROUPS.map((group) => (
          <li className="menu-group" key={group.title}>
            <div className="menu-group__title">{group.title}</div>
            <ul className="submenu">
              {group.items.map((item) => (
                <li key={item.label}>
                  {item.soon ? (
                    <button className="submenu__btn submenu__btn--soon" disabled>
                      {item.label} <span className="submenu__tag">준비중</span>
                    </button>
                  ) : (
                    <button
                      className={`submenu__btn ${currentLocation === item.location ? 'active' : ''}`}
                      onClick={() => onSelectLocation(item.location)}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ==================== 최상위 App ==================== */

function App() {
  const [activeTab, setActiveTab] = useState('live');
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('M502');
  const [currentTime, setCurrentTime] = useState('');

  // 시계 (기존 updateTime + setInterval 로직)
  useEffect(() => {
    function tick() {
      setCurrentTime(
        new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sidebarHidden={sidebarHidden}
        onToggleSidebar={() => setSidebarHidden((v) => !v)}
        currentTime={currentTime}
      />
      <Sidebar hidden={sidebarHidden} currentLocation={currentLocation} onSelectLocation={setCurrentLocation} />
      <main className={`main-content ${sidebarHidden ? 'main-content--full' : ''}`}>
        {activeTab === 'live' && <LiveDashboard location={currentLocation} />}
        {activeTab === 'predict' && <PredictDashboard />}
        {activeTab === 'analysis' && <AnalysisDashboard />}
      </main>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
