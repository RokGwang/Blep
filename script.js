// ==================== DOM 요소 선택 ====================
const menuToggle = document.getElementById('menuToggle');
const sideNav = document.getElementById('sideNav');
const mainContent = document.getElementById('mainContent');

const btnLive = document.getElementById("btn_live");
const btnPredict = document.getElementById("btn_predict");
const btnAnalysis = document.getElementById("btn_analysis");

// 센서 값 요소 및 상태 변수
let sensorElements = {};
let sensorFetchInterval;

// 아산시 API 호출 제한 관리 (10분에 1회 호출: 일일 약 144회로 트래픽 500회 제한 방어)
let lastAirFetchTime = 0;
const AIR_FETCH_INTERVAL = 10 * 60 * 1000;

// 현재 선택된 방 위치 저장 변수 (기본 M502)
let currentLocation = 'M502';

// 새로고침 전까지 사이트 내 이동 시 API 데이터를 보존하기 위한 캐시 변수
let cachedSensorData = null;
let cachedAirData = null;
let cachedIaqValues = { iaq: "--", temp: "--", recommendation: "분석 불가" };

// 예측 탭 데이터 설정
const PREDICT_IMAGES = {
    'pm10': { title: '10월 PM10 예측', img: 'image/pm10_prediction_oct.png', content: 'PM10 예측 데이터가 여기에 표시됩니다.' },
    'pm25': { title: '10월 PM25 예측', img: 'image/pm25_prediction_oct.png', content: 'PM25 예측 데이터가 여기에 표시됩니다.' },
    'co2': { title: '10월 CO2 예측', img: 'image/co2_prediction_oct.png', content: 'CO2 예측 데이터가 여기에 표시됩니다.' },
    'tvoc': { title: '10월 TVOC 예측', img: 'image/tvoc_prediction_oct.png', content: 'TVOC 예측 데이터가 여기에 표시됩니다.' },
    'temp': { title: '10월 Temperature 예측', img: 'image/temperature_prediction_oct.png', content: '온도 예측 데이터가 여기에 표시됩니다.' },
    'humidity': { title: '10월 Humidity 예측', img: 'image/humidity_prediction_oct.png', content: '습도 예측 데이터가 여기에 표시됩니다.' },
};

// 센서별 최대값 설정
const SENSOR_MAX = {
    pm10: 150, pm25: 150,
    asan_pm10: 150, asan_pm25: 150,
    co2: 2000, tvoc: 1000,
    temp: 50, humidity: 100
};

// 대시보드용 미니 아이콘 (currentColor를 사용해 카드 색상에 맞춰짐)
const ICONS = {
    pm10: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="8" r="1.6"/><circle cx="13" cy="6" r="1.2"/><circle cx="17" cy="10" r="2"/><circle cx="9" cy="15" r="2.2"/><circle cx="16" cy="17" r="1.4"/></svg>`,
    pm25: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="9" r="1"/><circle cx="13" cy="7" r="0.8"/><circle cx="16" cy="11" r="1.2"/><circle cx="10" cy="14" r="1.3"/><circle cx="15" cy="16" r="0.9"/><circle cx="6" cy="15" r="0.7"/></svg>`,
    co2: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17a4 4 0 1 1 1.2-7.8A5 5 0 0 1 17 11a3.5 3.5 0 0 1-.5 6.9H6Z"/></svg>`,
    tvoc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-4 4 4 6 0s4 4 6 0s4 4 6 0"/></svg>`,
    temp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/></svg>`,
    humidity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/></svg>`
};

// ==================== 초기 설정 및 공통 함수 ====================

document.addEventListener("DOMContentLoaded", () => {
    sideNav.classList.remove('hidden');
    mainContent.style.marginLeft = getComputedStyle(sideNav).width;
    renderLiveDashboard();

    // 시계 동작 초기화
    updateTime();
    setInterval(updateTime, 1000);
});

// 메뉴 토글 기능
menuToggle.addEventListener('click', () => {
    sideNav.classList.toggle('hidden');
    menuToggle.classList.toggle('active');
    mainContent.style.marginLeft = sideNav.classList.contains('hidden') ? '0px' : getComputedStyle(sideNav).width;
});
menuToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        menuToggle.click();
    }
});

// 상단 헤더 활성화 버튼 변경
function setActiveButton(activeBtn) {
    [btnLive, btnPredict, btnAnalysis].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

// 실시간 데이터 폴링 제어
function startDataPolling() {
    stopDataPolling();
    sensorFetchInterval = setInterval(fetchAndDisplaySensorData, 1800000);
    setTimeout(fetchAndDisplaySensorData, 100);
}

function stopDataPolling() {
    if (sensorFetchInterval) {
        clearInterval(sensorFetchInterval);
        sensorFetchInterval = null;
    }
}

// 실시간 데이터 초기화 해제 (탭 이동용)
function clearLiveElements() {
    stopDataPolling();
    sensorElements = {};
}

// ==================== 센서 데이터 관리 ====================

// 막대 그래프 업데이트 (아산시 외부 대기 데이터 및 실내 센서 데이터 동시 반영)
function updateChartBars() {
    const chartBars = document.querySelectorAll('.bar-chart__bar');
    if (!chartBars || chartBars.length === 0) return;

    const valueElements = Array.from(document.querySelectorAll('.bar-chart__value'));

    chartBars.forEach(bar => {
        const sensorType = bar.dataset.sensor;
        const max = SENSOR_MAX[sensorType] || 300;
        let val = null;

        // 해당 센서의 화면 상단 숫자 텍스트 요소를 직접 찾아서 값을 읽어옵니다.
        const valueElement = valueElements.find(el => el.dataset.valueFor === sensorType);

        if (valueElement && valueElement.textContent && valueElement.textContent !== "--") {
            // "µg/m³" 같은 단위 문자열이 섞여있어도 숫자만 추출하도록 정규식 처리 강화
            const cleanText = valueElement.textContent.replace(/[^0-9.]/g, '');
            val = parseFloat(cleanText);
        }

        const isValid = val !== null && !isNaN(val) && val >= 0;
        const pct = isValid ? Math.min((val / max) * 100, 100) : 0;

        // 막대 높이 강제 적용
        bar.style.height = `${pct}%`;
    });
}

// API 데이터 패치 및 적용 부분 수정
async function fetchAndDisplaySensorData() {
    const requiredKeys = ['pm10', 'co2', 'temp', 'pm25', 'tvoc', 'humidity'];
    if (requiredKeys.some(key => !sensorElements[key])) {
        stopDataPolling();
        console.warn("실시간 요소가 준비되지 않아 폴링을 중지합니다.");
        return;
    }

    try {
        // 현재 선택된 방(currentLocation)에 따라 다른 PHP 파일을 동적으로 호출
        let apiPath = "CSV/sensor.php"; // 기본 M502
        if (currentLocation === 'M501') apiPath = "CSV/sensor501.php";
        if (currentLocation === 'M507') apiPath = "CSV/sensor507.php";
        if (currentLocation === 'M520') apiPath = "CSV/sensor520.php";

        const sensorRes = await fetch(apiPath);
        const sensorResult = await sensorRes.json();

        if (sensorResult.success && sensorResult.data) {
            const data = sensorResult.data;
            cachedSensorData = data; // 실내 데이터 캐싱

            sensorElements.pm10.textContent = data.pm10 ?? "--";
            sensorElements.co2.textContent = data.co2 ?? "--";
            sensorElements.temp.textContent = data.temperature ?? "--";
            sensorElements.pm25.textContent = data.pm25 ?? "--";
            sensorElements.tvoc.textContent = data.tvoc ?? "--";
            sensorElements.humidity.textContent = data.humidity ?? "--";

            // 실내 PM10, PM25 막대 상단 값 영역 반영
            const pm10ChartVal = document.querySelector('.bar-chart__value[data-value-for="pm10"]');
            const pm25ChartVal = document.querySelector('.bar-chart__value[data-value-for="pm25"]');

            if (pm10ChartVal) pm10ChartVal.textContent = data.pm10 ?? "--";
            if (pm25ChartVal) pm25ChartVal.textContent = data.pm25 ?? "--";

            // IAQ 및 추천 로직 계산
            const co2 = parseFloat(data.co2);
            const temp = parseFloat(data.temperature);

            let recA = "--", recB = "--", recC = "분석 불가";
            if (!isNaN(co2)) {
                recA = co2 < 300 ? "인구 쾌적" : co2 < 500 ? "인구 보통" : "인구 혼잡";
            }
            if (!isNaN(temp)) {
                recB = temp < 20 ? "온도 낮음" : temp < 24 ? "온도 보통" : "온도 높음";
            }
            if (recA !== "--" && recB !== "--") {
                if (recA === "인구 쾌적") {
                    recC = recB === "온도 낮음" ? "에어컨 활동 의심됨" : "평균";
                } else if (recA === "인구 보통") {
                    recC = "평균";
                } else if (recA === "인구 혼잡") {
                    recC = recB === "온도 높음" ? "에어컨 가동 필요" : "평균";
                }
            }

            cachedIaqValues = { iaq: recA, temp: recB, recommendation: recC }; // IAQ 결과 캐싱

            document.getElementById("iaq_value").textContent = recA;
            document.getElementById("temp_value").textContent = recB;
            document.getElementById("final_recommendation").textContent = recC;
        }

        // 2. 도고면 외부 대기질 데이터 가져오기
        const currentTime = Date.now();
        if (currentTime - lastAirFetchTime > AIR_FETCH_INTERVAL || lastAirFetchTime === 0) {
            const airRes = await fetch("CSV/airkorea.php");
            const airResult = await airRes.json();

            if (airResult.success && airResult.data) {
                const airData = airResult.data;
                cachedAirData = airData; // 대기질 데이터 캐싱
                const asanPm10El = document.getElementById("asan_pm10");
                const asanPm25El = document.getElementById("asan_pm25");

                if (asanPm10El) asanPm10El.textContent = `${airData.asan_pm10 ?? "--"} µg/m³`;
                if (asanPm25El) asanPm25El.textContent = `${airData.asan_pm25 ?? "--"} µg/m³`;

                const asanPm10ChartVal = document.querySelector('.bar-chart__value[data-value-for="asan_pm10"]');
                const asanPm25ChartVal = document.querySelector('.bar-chart__value[data-value-for="asan_pm25"]');

                if (asanPm10ChartVal) asanPm10ChartVal.textContent = airData.asan_pm10 ?? "--";
                if (asanPm25ChartVal) asanPm25ChartVal.textContent = airData.asan_pm25 ?? "--";

                lastAirFetchTime = currentTime;
            }
        }

        // 데이터 반영 후 즉시 막대 그래프 높이 동기화 실행
        updateChartBars();

    } catch (err) {
        console.error("데이터 가져오기 실패", err);
    }
}

// ==================== 페이지 렌더링 함수 ====================

// 1. 실시간 대시보드
function renderLiveDashboard() {
    clearLiveElements();
    setActiveButton(btnLive);

    mainContent.innerHTML = `
        <section class="page-header">
            <div>
                <h2 class="page-header__title">실시간 공기질</h2>
                <p class="page-header__subtitle">선택한 강의실의 센서 데이터를 5초마다 갱신합니다.</p>
            </div>
            <div class="status-pill">
                <span class="status-pill__dot"></span>
                ${currentLocation} 측정 중
            </div>
        </section>

        <section class="stat-grid">
            <div class="stat-card stat-card--pm10">
                <div class="stat-card__icon">${ICONS.pm10}</div>
                <div class="stat-card__label">PM10 · 미세먼지</div>
                <div class="stat-card__value-row"><span class="stat-card__value" id="pm10_val">--</span><span class="stat-card__unit">µg/m³</span></div>
            </div>
            <div class="stat-card stat-card--co2">
                <div class="stat-card__icon">${ICONS.co2}</div>
                <div class="stat-card__label">CO2 · 이산화탄소</div>
                <div class="stat-card__value-row"><span class="stat-card__value" id="co2_val">--</span><span class="stat-card__unit">ppm</span></div>
            </div>
            <div class="stat-card stat-card--temp">
                <div class="stat-card__icon">${ICONS.temp}</div>
                <div class="stat-card__label">Temperature · 온도</div>
                <div class="stat-card__value-row"><span class="stat-card__value" id="temp_val">--</span><span class="stat-card__unit">℃</span></div>
            </div>
            <div class="stat-card stat-card--pm25">
                <div class="stat-card__icon">${ICONS.pm25}</div>
                <div class="stat-card__label">PM2.5 · 초미세먼지</div>
                <div class="stat-card__value-row"><span class="stat-card__value" id="pm25_val">--</span><span class="stat-card__unit">µg/m³</span></div>
            </div>
            <div class="stat-card stat-card--tvoc">
                <div class="stat-card__icon">${ICONS.tvoc}</div>
                <div class="stat-card__label">TVOC · 휘발성유기화합물</div>
                <div class="stat-card__value-row"><span class="stat-card__value" id="tvoc_val">--</span><span class="stat-card__unit">ppb</span></div>
            </div>
            <div class="stat-card stat-card--humidity">
                <div class="stat-card__icon">${ICONS.humidity}</div>
                <div class="stat-card__label">Humidity · 습도</div>
                <div class="stat-card__value-row"><span class="stat-card__value" id="hum_val">--</span><span class="stat-card__unit">%</span></div>
            </div>
        </section>

        <section class="summary-card">
            <div class="summary-card__header">
                <h3>종합 공기질 추천 (IAQ)</h3>
                <p>CO2·온도 값을 기준으로 실내 환경 상태를 알려드립니다.</p>
            </div>
            <div class="summary-card__grid">
                <div class="summary-item">
                    <div class="summary-item__value" id="iaq_value">--</div>
                    <div class="summary-item__label">현재 CO2 상태</div>
                </div>
                <div class="summary-item">
                    <div class="summary-item__value" id="temp_value">--</div>
                    <div class="summary-item__label">현재 온도 상태</div>
                </div>
                <div class="summary-item summary-item--highlight">
                    <div class="summary-item__value" id="final_recommendation">--</div>
                    <div class="summary-item__label">종합 추천</div>
                </div>
            </div>
        </section>

        <section class="compare-card">
            <div class="compare-card__chart" id="live_bar_chart">
                <h3>실내·실외 미세먼지 비교</h3>
                <div class="bar-chart-visuals">
                    <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="pm10">--</div><div class="bar-chart__bar" data-sensor="pm10" style="height: 0%;"></div><div class="bar-chart__label">${currentLocation}<br>PM10</div></div>
                    <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="asan_pm10">--</div><div class="bar-chart__bar" data-sensor="asan_pm10" style="height: 0%;"></div><div class="bar-chart__label">아산시<br>PM10</div></div>
                    <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="pm25">--</div><div class="bar-chart__bar" data-sensor="pm25" style="height: 0%;"></div><div class="bar-chart__label">${currentLocation}<br>PM25</div></div>
                    <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="asan_pm25">--</div><div class="bar-chart__bar" data-sensor="asan_pm25" style="height: 0%;"></div><div class="bar-chart__label">아산시<br>PM25</div></div>
                </div>
            </div>

            <div class="compare-card__side">
                <div class="small-info-card"><div class="small-info-card__title">아산시 PM10</div><div class="small-info-card__content" id="asan_pm10">-- µg/m³</div></div>
                <div class="small-info-card"><div class="small-info-card__title">아산시 PM25</div><div class="small-info-card__content" id="asan_pm25">-- µg/m³</div></div>
                <p class="compare-card__note">외부 대기질과 비교해 실내 환기 시점을 판단해보세요.</p>
            </div>
        </section>
    `;

    setTimeout(() => {
        sensorElements = {
            pm10: document.getElementById("pm10_val"),
            co2: document.getElementById("co2_val"),
            temp: document.getElementById("temp_val"),
            pm25: document.getElementById("pm25_val"),
            tvoc: document.getElementById("tvoc_val"),
            humidity: document.getElementById("hum_val"),
        };

        if (Object.values(sensorElements).every(Boolean)) {
            // 이미 캐시된 데이터가 존재한다면 즉시 UI에 복원
            if (cachedSensorData) {
                sensorElements.pm10.textContent = cachedSensorData.pm10 ?? "--";
                sensorElements.co2.textContent = cachedSensorData.co2 ?? "--";
                sensorElements.temp.textContent = cachedSensorData.temperature ?? "--";
                sensorElements.pm25.textContent = cachedSensorData.pm25 ?? "--";
                sensorElements.tvoc.textContent = cachedSensorData.tvoc ?? "--";
                sensorElements.humidity.textContent = cachedSensorData.humidity ?? "--";

                const pm10ChartVal = document.querySelector('.bar-chart__value[data-value-for="pm10"]');
                const pm25ChartVal = document.querySelector('.bar-chart__value[data-value-for="pm25"]');
                if (pm10ChartVal) pm10ChartVal.textContent = cachedSensorData.pm10 ?? "--";
                if (pm25ChartVal) pm25ChartVal.textContent = cachedSensorData.pm25 ?? "--";

                document.getElementById("iaq_value").textContent = cachedIaqValues.iaq;
                document.getElementById("temp_value").textContent = cachedIaqValues.temp;
                document.getElementById("final_recommendation").textContent = cachedIaqValues.recommendation;
            }

            if (cachedAirData) {
                const asanPm10El = document.getElementById("asan_pm10");
                const asanPm25El = document.getElementById("asan_pm25");
                if (asanPm10El) asanPm10El.textContent = `${cachedAirData.asan_pm10 ?? "--"} µg/m³`;
                if (asanPm25El) asanPm25El.textContent = `${cachedAirData.asan_pm25 ?? "--"} µg/m³`;

                const asanPm10ChartVal = document.querySelector('.bar-chart__value[data-value-for="asan_pm10"]');
                const asanPm25ChartVal = document.querySelector('.bar-chart__value[data-value-for="asan_pm25"]');
                if (asanPm10ChartVal) asanPm10ChartVal.textContent = cachedAirData.asan_pm10 ?? "--";
                if (asanPm25ChartVal) asanPm25ChartVal.textContent = cachedAirData.asan_pm25 ?? "--";
            }

            updateChartBars();

            // 데이터 폴링 시작
            startDataPolling();
        } else {
            console.error("실시간 대시보드 요소 초기화 실패!");
        }
    }, 100);
}

// 2. 예측 대시보드
function renderPredictDashboard() {
    clearLiveElements();
    setActiveButton(btnPredict);

    mainContent.innerHTML = `
        <section class="page-header">
            <div>
                <h2 class="page-header__title">예측 정보</h2>
                <p class="page-header__subtitle">AI 모델이 예측한 항목별 월간 추이를 확인하세요.</p>
            </div>
        </section>

        <div class="chip-row predict-buttons">
            <button class="text-btn active" data-sensor="pm10">PM10</button>
            <button class="text-btn" data-sensor="pm25">PM25</button>
            <button class="text-btn" data-sensor="co2">CO2</button>
            <button class="text-btn" data-sensor="tvoc">TVOC</button>
            <button class="text-btn" data-sensor="temp">온도</button>
            <button class="text-btn" data-sensor="humidity">습도</button>
        </div>

        <div class="predict-card">
            <h3 id="predict_card_title"></h3>
            <img src="" alt="예측 이미지" class="predict-card__image" id="predict_card_image"/>
            <div class="predict-card__footer">
                <span class="predict-card__badge">AI 기반 추천</span>
                <p id="predict_card_content"></p>
            </div>
        </div>
    `;

    updatePredictionCard('pm10');

    document.querySelectorAll('.predict-buttons .text-btn').forEach(button => {
        button.addEventListener('click', function() {
            updatePredictionCard(this.dataset.sensor);
        });
    });
}

function updatePredictionCard(sensorKey) {
    const data = PREDICT_IMAGES[sensorKey];
    if (!data) return;

    document.getElementById('predict_card_title').textContent = data.title;
    document.getElementById('predict_card_image').src = data.img;
    document.getElementById('predict_card_content').textContent = data.content;

    document.querySelectorAll('.predict-buttons .text-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sensor === sensorKey);
    });
}

// 3. 데이터 분석 대시보드
function renderAnalysisDashboard() {
    clearLiveElements();
    setActiveButton(btnAnalysis);

    mainContent.innerHTML = `
        <section class="page-header">
            <div>
                <h2 class="page-header__title">데이터 분석</h2>
                <p class="page-header__subtitle">기간별 추이를 다양한 관점에서 살펴보세요.</p>
            </div>
        </section>

        <div class="chip-row analysis-buttons">
            <button class="text-btn active" data-file="page/co2_by_weekday.html">학기 별 CO2 분석</button>
            <button class="text-btn" data-file="page/term_indoor_conditions.html">학기 별 전체 값 분석</button>
            <button class="text-btn" data-file="page/temperature_vs_co2.html">온도/습도 분석</button>
            <button class="text-btn" data-file="page/indoor_vs_outdoor_pm10.html">내부/외부 미세먼지 분석</button>
        </div>

        <iframe id="analysis_iframe" class="analysis-frame" src="co2_by_weekday.html" title="Data Analysis Chart"></iframe>
    `;

    const iframe = document.getElementById('analysis_iframe');
    const buttons = document.querySelectorAll('.analysis-buttons .text-btn');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            iframe.src = this.dataset.file;
        });
    });
}

// ==================== 이벤트 바인딩 및 시간 관리 ====================

btnLive.addEventListener("click", renderLiveDashboard);
btnPredict.addEventListener("click", renderPredictDashboard);
btnAnalysis.addEventListener("click", renderAnalysisDashboard);

// ==================== 사이드바 위치 버튼 활성화 관리 ====================
const locationButtons = document.querySelectorAll('.submenu__btn');

locationButtons.forEach(button => {
    button.addEventListener('click', function() {
        const targetLocation = this.dataset.location;

        // 준비중인 페이지이거나 데이터가 없는 버튼 처리
        if (!targetLocation || this.textContent.includes('준비중')) {
            console.log("준비 중인 페이지입니다.");
            return;
        }

        // 모든 사이드바 버튼에서 active 제거 후 클릭한 버튼에 active 추가
        locationButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        // 현재 위치 변경, 캐시 초기화 및 새로운 방 데이터 즉시 반영
        currentLocation = targetLocation;
        cachedSensorData = null; // 이전 방 캐시 비우기

        console.log(`현재 선택된 위치 변경: ${currentLocation}`);

        // 실시간 뷰 레이아웃 상태를 유지한 채 선택된 방 데이터로 갱신
        renderLiveDashboard();
    });
});

function updateTime() {
    const timeString = new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    const timeEl = document.getElementById("currentTime");
    if (timeEl) timeEl.textContent = timeString;
}
