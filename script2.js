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

// 🚀 [추가] 현재 선택된 방 위치 저장 변수 (기본 M502)
let currentLocation = 'M502'; 

// 🚀 [추가] 새로고침 전까지 사이트 내 이동 시 API 데이터를 보존하기 위한 캐시 변수
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

// 상단 헤더 활성화 버튼 변경
function setActiveButton(activeBtn) {
    [btnLive, btnPredict, btnAnalysis].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

// 실시간 데이터 폴링 제어
function startDataPolling() {
    stopDataPolling();
    sensorFetchInterval = setInterval(fetchAndDisplaySensorData, 5000);
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
        // 🚀 [수정] 현재 선택된 방(currentLocation)에 따라 다른 PHP 파일을 동적으로 호출
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
        <section class="section-header">
            <img src="https://marketplace.canva.com/zDhug/MAGx1pzDhug/1/tl/canva-cartoon-illustration-of-happy-yellow-chick-MAGx1pzDhug.png" alt="대표 이미지" class="section-header__image"/>
            <div class="section-header__text-group">
                <div class="section-header__text--large">실시간 정보</div>
                <div class="section-header__text--medium">This is an example dashboard created using build-in elements and components.</div>
                <div class="section-header__text--small">CodePen Home Full Free Bootstrap HTML Admin Dashboard Template</div>
            </div>
        </section>

        <section class="sensor-button-group">
            <button class="sensor-btn btn--purple"><div class="btn__left-content"><div class="btn__text--title">PM10</div><div class="btn__text--subtitle">미세먼지</div></div><div class="btn__right-content"><div class="btn__text--value" id="pm10_val">--</div></div></button>
            <button class="sensor-btn btn--sky-blue"><div class="btn__left-content"><div class="btn__text--title">CO2</div><div class="btn__text--subtitle">이산화탄소</div></div><div class="btn__right-content"><div class="btn__text--value" id="co2_val">--</div></div></button>
            <button class="sensor-btn btn--green"><div class="btn__left-content"><div class="btn__text--title">Temperature</div><div class="btn__text--subtitle">온도</div></div><div class="btn__right-content"><div class="btn__text--value" id="temp_val">--</div></div></button>
        </section>

        <div class="button-spacer"></div>

        <section class="sensor-button-group">
            <button class="sensor-btn btn--red"><div class="btn__left-content"><div class="btn__text--title">PM25</div><div class="btn__text--subtitle">초미세먼지</div></div><div class="btn__right-content"><div class="btn__text--value" id="pm25_val">--</div></div></button>
            <button class="sensor-btn btn--orange"><div class="btn__left-content"><div class="btn__text--title">TVOC</div><div class="btn__text--subtitle">휘발성 유기화합물</div></div><div class="btn__right-content"><div class="btn__text--value" id="tvoc_val">--</div></div></button>
            <button class="sensor-btn btn--white"><div class="btn__left-content"><div class="btn__text--title">Humidity</div><div class="btn__text--subtitle">습도</div></div><div class="btn__right-content"><div class="btn__text--value" id="hum_val">--</div></div></button>
        </section>

        <div class="large-stat-card">
            <div class="card__title--left">종합 공기질 지수 추천 (IAQ)</div>
            <div class="large-stat-card__content">
                <div class="stat-item stat-item--recommendation"><div class="stat-item__value" id="iaq_value">--</div><div class="stat-item__label">현재 CO2</div></div>
                <div class="stat-item stat-item--recommendation"><div class="stat-item__value" id="temp_value">--</div><div class="stat-item__label">현재 온도</div></div>
                <div class="stat-item"><div class="stat-item__value" id="final_recommendation">--</div></div>
            </div>
        </div>

        <div class="info-card">
            <div class="card-content-wrapper">
                <div class="bar-chart-container" id="live_bar_chart">
                    <div class="card__title--left">실시간 미세먼지 농도 비교</div>
                    <div class="bar-chart-visuals">
                        <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="pm10">--</div><div class="bar-chart__bar" data-sensor="pm10" style="height: 0%;"></div><div class="bar-chart__label">${currentLocation} PM10</div></div>
                        <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="asan_pm10" id="asan_pm10_val_chart">--</div><div class="bar-chart__bar" data-sensor="asan_pm10" style="height: 0%;"></div><div class="bar-chart__label">아산시 PM10</div></div>
                        <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="pm25">--</div><div class="bar-chart__bar" data-sensor="pm25" style="height: 0%;"></div><div class="bar-chart__label">${currentLocation} PM25</div></div>
                        <div class="bar-chart__bar-group"><div class="bar-chart__value" data-value-for="asan_pm25" id="asan_pm25_val_chart">--</div><div class="bar-chart__bar" data-sensor="asan_pm25" style="height: 0%;"></div><div class="bar-chart__label">아산시 PM25</div></div>
                    </div>
                </div>

                <div class="right-comparison-group">
                    <div class="small-info-card"><div class="small-info-card__title">아산시 PM10</div><div class="small-info-card__content" id="asan_pm10">-- µg/m³</div></div>
                    <div class="small-info-card"><div class="small-info-card__title">아산시 PM25</div><div class="small-info-card__content" id="asan_pm25">-- µg/m³</div></div>
                    <div class="card__text-group" style="margin-top: 10px; align-self: center;">
                        <div class="card__text--title">외부 공기질과 비교 분석</div>
                        <div class="card__text--content">실내 환경 개선을 위한 맞춤형 정보 제공</div>
                    </div>
                </div>
            </div>
        </div>
        <div style="height: 1500px;"></div>
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
        <section class="section-header">
            <img src="https://marketplace.canva.com/zDhug/MAGx1pzDhug/1/tl/canva-cartoon-illustration-of-happy-yellow-chick-MAGx1pzDhug.png" alt="대표 이미지" class="section-header__image"/>
            <div class="section-header__text-group">
                <div class="section-header__text--large">예측 정보</div>
                <div class="section-header__text--medium">This is the prediction dashboard created using the same layout.</div>
                <div class="section-header__text--small">AI 기반 데이터 예측 페이지</div>
            </div>
        </section>

        <div class="prediction-list" style="margin-top: 40px;">
            <div class="predict-buttons sensor-button-group">
                <button class="text-btn active" data-sensor="pm10">PM10 예측</button>
                <button class="text-btn" data-sensor="pm25">PM25 예측</button>
                <button class="text-btn" data-sensor="co2">CO2 예측</button>
                <button class="text-btn" data-sensor="tvoc">TVOC 예측</button>
                <button class="text-btn" data-sensor="temp">온도 예측</button>
                <button class="text-btn" data-sensor="humidity">습도 예측</button>
            </div>

            <div class="info-card">
                <div class="card__title--left" id="predict_card_title"></div>
                <img src="" alt="예측 이미지" class="card__image--predict" id="predict_card_image"/>
                <div class="card__text-group">
                    <div class="card__text--title">AI기반 추천</div>
                    <div class="card__text--content" id="predict_card_content"></div>
                </div>
            </div>
        </div>
        <div style="height: 150px;"></div>
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
        <section class="section-header">
            <img src="https://marketplace.canva.com/zDhug/MAGx1pzDhug/1/tl/canva-cartoon-illustration-of-happy-yellow-chick-MAGx1pzDhug.png" alt="대표 이미지" class="section-header__image"/>
            <div class="section-header__text-group">
                <div class="section-header__text--large">분석 정보</div>
                <div class="section-header__text--medium">This is the analysis dashboard created using the same layout.</div>
                <div class="section-header__text--small">AI 기반 데이터 분석 페이지</div>
            </div>
        </section>

        <div class="analysis-buttons sensor-button-group" style="margin-top: 40px;">
            <button class="text-btn active" data-file="page/co2_by_weekday.html">학기 별 CO2 분석</button>
            <button class="text-btn" data-file="page/term_indoor_conditions.html">학기 별 전체 값 분석</button>
            <button class="text-btn" data-file="page/temperature_vs_co2.html">온도/습도 분석</button>
            <button class="text-btn" data-file="page/indoor_vs_outdoor_pm10.html">내부/외부 미세먼지 분석</button>
        </div>

        <iframe id="analysis_iframe" src="co2_by_weekday.html" style="width: 96%; height: 800px; border: none; margin-top: 20px;" title="Data Analysis Chart"></iframe>
        <div style="height: 150px;"></div>
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
        
        // 🚀 [추가] 준비중인 페이지이거나 데이터가 없는 버튼 처리
        if (!targetLocation || this.textContent.includes('준비중')) {
            console.log("준비 중인 페이지입니다.");
            return;
        }

        // 모든 사이드바 버튼에서 active 제거 후 클릭한 버튼에 active 추가
        locationButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        // 🚀 [추가] 현재 위치 변경, 캐시 초기화 및 새로운 방 데이터 즉시 반영
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
