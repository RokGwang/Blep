// ==================== DOM 요소 선택 ====================
const menuToggle = document.getElementById('menuToggle');
const sideNav = document.getElementById('sideNav');
const mainContent = document.getElementById('mainContent');

// 헤더 버튼
const btnLive = document.getElementById("btn_live");
const btnPredict = document.getElementById("btn_predict");
const btnAnalysis = document.getElementById("btn_analysis");

// 센서 데이터 표시 요소 (실시간 페이지에서 사용)
let pm10ValueElement;
let co2ValueElement;
let tempValueElement;
let pm25ValueElement;
let tvocValueElement;
let humValueElement;


let sensorFetchInterval;

// 막대 그래프 요소 (추가됨)
let chartBars = [];

// 예측 탭 관련 변수 (추가됨)
const PREDICT_IMAGES = {
    'pm10': { title: '10월 PM10 예측', img: 'image/pm10_prediction_oct.png', content: 'PM10 예측 데이터가 여기에 표시됩니다.' },
    'pm25': { title: '10월 PM25 예측', img: 'image/pm25_prediction_oct.png', content: 'PM25 예측 데이터가 여기에 표시됩니다.' },
    'co2': { title: '10월 CO2 예측', img: 'image/co2_prediction_oct.png', content: 'CO2 예측 데이터가 여기에 표시됩니다.' },
    'tvoc': { title: '10월 TVOC 예측', img: 'image/tvoc_prediction_oct.png', content: 'TVOC 예측 데이터가 여기에 표시됩니다.' },
    'temp': { title: '10월 Temperature 예측', img: 'image/temperature_prediction_oct.png', content: '온도 예측 데이터가 여기에 표시됩니다.' },
    'humidity': { title: '10월 Humidity 예측', img: 'image/humidity_prediction_oct.png', content: '습도 예측 데이터가 여기에 표시됩니다.' },
};

// ==================== 초기 설정 및 이벤트 핸들러 ====================

// 페이지 로드 시 네비게이션과 메인 콘텐츠의 초기 상태 설정
document.addEventListener("DOMContentLoaded", () => {
    // 사이드바가 기본적으로 열려 있도록 설정
    sideNav.classList.remove('hidden');
    mainContent.style.marginLeft = getComputedStyle(sideNav).width;

    // 초기 화면을 '실시간' 페이지로 로드
    renderLiveDashboard();
});

// 메뉴 토글 기능
menuToggle.addEventListener('click', () => {
    sideNav.classList.toggle('hidden');
    menuToggle.classList.toggle('active');

    // 네비게이션 상태에 따라 메인 콘텐츠의 margin-left 조정
    const sidebarWidth = getComputedStyle(sideNav).width;
    mainContent.style.marginLeft = sideNav.classList.contains('hidden') ? '0px' : sidebarWidth;
});

// ==================== 센서 데이터 관리 ====================

// 막대 그래프 업데이트 함수 (수정됨)
function updateChartBars() {
    if (!chartBars || chartBars.length === 0) return;

    // 센서 타입 -> 값 요소 맵 (실시간 데이터 센서)
    const sensorElementMap = {
        pm10: pm10ValueElement,
        co2: co2ValueElement,
        temp: tempValueElement,
        pm25: pm25ValueElement,
        tvoc: tvocValueElement,
        humidity: humValueElement,
    };

    // 센서별 최대값 (표시 비율 계산에 사용)
    const sensorMax = {
        pm10: 200,       // µg/m3
        pm25: 150,       // µg/m3
        asan_pm10: 200,  // 🚀 추가: 아산시 PM10 최대값
        asan_pm25: 150,  // 🚀 추가: 아산시 PM25 최대값
        co2: 2000,       // ppm
        tvoc: 1000,      // ppb
        temp: 50,        // ℃
        humidity: 100    // %
    };
    
    // 🚀 수정: 아산시 PM10/PM25 값을 small-info-card에서 가져오기
    const asanPm10Element = document.getElementById("asan_pm10"); 
    const asanPm25Element = document.getElementById("asan_pm25"); 

    const valueElements = Array.from(document.querySelectorAll('.bar-chart__value'));

    chartBars.forEach(bar => {
        const sensorType = bar.dataset.sensor;
        let val = null; // 🚨 필수 수정: val을 null로 초기화

        let max = sensorMax[sensorType] || 300;

        if (sensorType === 'asan_pm10' || sensorType === 'asan_pm25') {
            // 🚀 아산시 센서 처리: small-info-card에서 텍스트를 파싱
            const el = sensorType === 'asan_pm10' ? asanPm10Element : asanPm25Element;

            if (el && el.textContent) {
                // "50 µg/m³" 와 같은 문자열에서 숫자만 추출
                let raw = el.textContent.replace(' µg/m³', '');
                val = parseFloat(raw);
            }
        } else {
            // 🚀 502 센서 처리: 센서 버튼에서 텍스트를 파싱
            const el = sensorElementMap[sensorType];

            if (el && el.textContent) {
                let raw = el.textContent;
                val = parseFloat(raw);
            }
        }

        // 유효성 검사
        if (isNaN(val) || val === null || val < 0) {
            bar.style.height = '0%';
            // valueElement도 업데이트가 필요하지만, data-value-for가 --일 경우 차트 값이 잘못될 수 있습니다.
            // 여기서는 막대 그래프의 높이만 0%로 설정하고, 상단 텍스트 업데이트는 아래에서 공통으로 처리합니다.
            
            // 🚨 임시 수정: val이 null/NaN인 경우, valueElement에 "--"를 설정하기 위해 여기서 continue하지 않습니다.
        }
        
        // 최대값 기준으로 % 계산 및 높이 설정
        const pct = (val !== null && !isNaN(val) && val >= 0) ? Math.min((val / max) * 100, 100) : 0;
        bar.style.height = `${pct}%`;

        // 상단 값 텍스트 업데이트
        const valueElement = valueElements.find(el => el.dataset.valueFor === sensorType);
        if (valueElement) {
            if (val !== null && !isNaN(val) && val >= 0) {
                 // 숫자는 소수점 없이 반올림
                 valueElement.textContent = Math.round(val);
            } else {
                 valueElement.textContent = "--";
            }
        }
    });
}

// API로부터 최신 센서 데이터를 가져와서 화면에 표시하는 함수
async function fetchAndDisplaySensorData() {
    try {
        // ✅ 안전 검사 유지: 모든 6개 센서 요소 변수가 유효한지 확인
        if (!pm10ValueElement || !co2ValueElement || !tempValueElement ||
            !pm25ValueElement || !tvocValueElement || !humValueElement) {

            // 이 요소들이 null이라는 것은 Live Dashboard DOM이 해제되었을(다른 탭으로 이동) 가능성이 높습니다.
            stopDataPolling(); // 폴링 중지
            console.warn("실시간 요소가 준비되지 않아 폴링을 중지합니다.");
            return; // 함수 종료
        }
        // ------------------------------------------------------------

        // 실제 API 엔드포인트에 맞게 URL 수정 필요
        const response = await fetch("insert.php");
        const result = await response.json();
        const asanPm10Element = document.getElementById("asan_pm10");
        const asanPm25Element = document.getElementById("asan_pm25");
        const co2RecommendationElement = document.getElementById("iaq_value");       // A 부분 (HTML ID: iaq_value)
        const tempRecommendationElement = document.getElementById("temp_value");    // B 부분 (HTML ID: temp_value)
        const finalRecommendationElement = document.getElementById("final_recommendation"); // C 값 (HTML ID: final_recommendation)

        if (result.success && result.data) {
            // 값이 있는 경우에만 업데이트
            if (pm10ValueElement) pm10ValueElement.textContent = result.data.pm10 || "--";
            if (co2ValueElement) co2ValueElement.textContent = result.data.co2 || "--";
            if (tempValueElement) tempValueElement.textContent = result.data.temperature || "--";
            if (pm25ValueElement) pm25ValueElement.textContent = result.data.pm25 || "--";
            if (tvocValueElement) tvocValueElement.textContent = result.data.tvoc || "--";
            if (humValueElement) humValueElement.textContent = result.data.humidity || "--";
            if (asanPm10Element) asanPm10Element.textContent = (result.data.asan_pm10 !== undefined ? result.data.asan_pm10 : "--") + " µg/m³";
            if (asanPm25Element) asanPm25Element.textContent = (result.data.asan_pm25 !== undefined ? result.data.asan_pm25 : "--") + " µg/m³";

            // 1. 센서 값 읽기
            const co2 = parseFloat(result.data.co2);
            const temperature = parseFloat(result.data.temperature);

            let recommendationA = "--";
            let recommendationB = "--";
            let recommendationC = "분석 불가"; // 기본값

            // 2. A (CO2) 값 결정
            if (!isNaN(co2)) {
                if (co2 < 300) {
                    recommendationA = "인구 쾌적";
                } else if (co2 < 500) {
                    recommendationA = "인구 보통";
                } else {
                    recommendationA = "인구 혼잡";
                }
            }

            // 3. B (온도) 값 결정
            if (!isNaN(temperature)) {
                if (temperature < 20) {
                    recommendationB = "온도 낮음";
                } else if (temperature < 24) {
                    recommendationB = "온도 보통";
                } else {
                    recommendationB = "온도 높음";
                }
            }
            
            // 4. C (최종 추천) 값 결정 (A와 B를 모두 유효한 값으로 가져야 함)
            if (recommendationA !== "--" && recommendationB !== "--") {
                 // 🚀 보강: A와 B가 "--"가 아닐 때만 최종 추천 로직 실행
                if (recommendationA === "인구 쾌적") {
                    if (recommendationB === "온도 낮음") {
                        recommendationC = "에어컨 활동 의심됨";
                    } else { // 온도 보통, 온도 높음
                        recommendationC = "평균";
                    }
                } else if (recommendationA === "인구 보통") {
                    recommendationC = "평균";
                } else if (recommendationA === "인구 혼잡") {
                    if (recommendationB === "온도 높음") {
                        recommendationC = "에어컨 가동 필요";
                    } else { // 온도 낮음, 온도 보통
                        recommendationC = "평균";
                    }
                }
            } else {
                 // A나 B가 "--"이면, 최종 추천도 "--"로 표시
                 recommendationC = "--";
            }
            
            // 5. DOM에 결과 출력
            if (co2RecommendationElement) co2RecommendationElement.textContent = recommendationA;
            if (tempRecommendationElement) tempRecommendationElement.textContent = recommendationB;
            if (finalRecommendationElement) finalRecommendationElement.textContent = recommendationC;

            // 데이터 업데이트 후 차트도 업데이트
            updateChartBars();

        } else {
            console.error("API 응답 오류:", result.error);
        }
    } catch (err) {
        console.error("데이터 가져오기 실패", err);
    }
}

// 실시간 데이터 업데이트 시작/중지 함수
function startDataPolling() {
    // 이전에 설정된 인터벌이 있으면 중지
    if (sensorFetchInterval) {
        clearInterval(sensorFetchInterval);
        sensorFetchInterval = null; // 명시적 초기화
    }

    // 5초마다 반복 실행
    sensorFetchInterval = setInterval(fetchAndDisplaySensorData, 5000);

    // 첫 데이터 로드를 위해 지연 후 한 번 호출 (옵션이지만 권장)
    setTimeout(fetchAndDisplaySensorData, 100);
}

function stopDataPolling() {
    if (sensorFetchInterval) {
        clearInterval(sensorFetchInterval);
    }
    sensorFetchInterval = null; // ID 초기화
}

// ==================== 페이지 렌더링 함수 ====================

// 활성화된 헤더 버튼 스타일을 변경하는 함수
function setActiveButton(activeBtn) {
    [btnLive, btnPredict, btnAnalysis].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

// 예측 이미지/텍스트를 업데이트하는 함수 (추가됨)
function updatePredictionCard(sensorKey) {
    const data = PREDICT_IMAGES[sensorKey];
    if (!data) return;

    // DOM 요소 선택
    const cardTitle = document.getElementById('predict_card_title');
    const cardImage = document.getElementById('predict_card_image');
    const cardContent = document.getElementById('predict_card_content');

    // 버튼 활성화 스타일 업데이트
    const buttons = document.querySelectorAll('.predict-buttons .text-btn');
    buttons.forEach(btn => {
        if (btn.dataset.sensor === sensorKey) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 콘텐츠 업데이트
    cardTitle.textContent = data.title;
    cardImage.src = data.img;
    cardContent.textContent = data.content;
}


// 실시간 대시보드 DOM 요소를 초기화하고 폴링을 시작하는 함수
function initializeLiveDashboard() {
    // innerHTML이 렌더링된 후 DOM 요소를 참조합니다.
    pm10ValueElement = document.getElementById("pm10_val");
    co2ValueElement = document.getElementById("co2_val");
    tempValueElement = document.getElementById("temp_val");
    pm25ValueElement = document.getElementById("pm25_val");
    tvocValueElement = document.getElementById("tvoc_val");
    humValueElement = document.getElementById("hum_val");

    // data-sensor="pm10_fixed", data-sensor="pm25_fixed"를 포함하여 모든 막대를 선택
    chartBars = Array.from(document.querySelectorAll('.bar-chart__bar'));

    // 모든 요소가 할당되었는지 한 번 더 확인 (방어적 코딩)
    if (pm10ValueElement && co2ValueElement && tempValueElement && pm25ValueElement && tvocValueElement && humValueElement) {
        // 모든 요소가 할당된 후 데이터 폴링을 시작합니다.
        startDataPolling();
    } else {
        console.error("실시간 대시보드 요소 초기화 실패!");
        // 여기서 폴링을 시작하지 않음
    }
}

// 1. 실시간 대시보드 렌더링 (수정됨)
function renderLiveDashboard() {
    stopDataPolling(); // 기존 인터벌 중지
    setActiveButton(btnLive);

    // HTML 마크업 생성
    mainContent.innerHTML = `
        <section class="section-header">
            <img
                src="https://marketplace.canva.com/zDhug/MAGx1pzDhug/1/tl/canva-cartoon-illustration-of-happy-yellow-chick-MAGx1pzDhug.png"
                alt="대표 이미지"
                class="section-header__image"
            />
            <div class="section-header__text-group">
                <div class="section-header__text--large">실시간 정보</div>
                <div class="section-header__text--medium">This is an example dashboard created using build-in elements and components.</div>
                <div class="section-header__text--small">CodePen Home Full Free Bootstrap HTML Admin Dashboard Template</div>
            </div>
        </section>

        <section class="sensor-button-group">
            <button class="sensor-btn btn--purple">
                <div class="btn__left-content">
                    <div class="btn__text--title">PM10 Sensor</div>
                    <div class="btn__text--subtitle">미세먼지</div>
                </div>
                <div class="btn__right-content">
                    <div class="btn__text--value" id="pm10_val">--</div>
                </div>
            </button>

            <button class="sensor-btn btn--sky-blue">
                <div class="btn__left-content">
                    <div class="btn__text--title">CO2 Sensor</div>
                    <div class="btn__text--subtitle">이산화탄소</div>
                </div>
                <div class="btn__right-content">
                    <div class="btn__text--value" id="co2_val">--</div>
                </div>
            </button>

            <button class="sensor-btn btn--green">
                <div class="btn__left-content">
                    <div class="btn__text--title">Temperature</div>
                    <div class="btn__text--subtitle">온도</div>
                </div>
                <div class="btn__right-content">
                    <div class="btn__text--value" id="temp_val">--</div>
                </div>
            </button>
        </section>

        <div class="button-spacer"></div>

        <section class="sensor-button-group">
            <button class="sensor-btn btn--red">
                <div class="btn__left-content">
                    <div class="btn__text--title">PM25 Sensor</div>
                    <div class="btn__text--subtitle">초미세먼지</div>
                </div>
                <div class="btn__right-content">
                    <div class="btn__text--value" id="pm25_val">--</div>
                </div>
            </button>

            <button class="sensor-btn btn--orange">
                <div class="btn__left-content">
                    <div class="btn__text--title">TVOC Sensor</div>
                    <div class="btn__text--subtitle">휘발성 유기화합물</div>
                </div>
                <div class="btn__right-content">
                    <div class="btn__text--value" id="tvoc_val">--</div>
                </div>
            </button>

            <button class="sensor-btn btn--white">
                <div class="btn__left-content">
                    <div class="btn__text--title">Humidity</div>
                    <div class="btn__text--subtitle">습도</div>
                </div>
                <div class="btn__right-content">
                    <div class="btn__text--value" id="hum_val">--</div>
                </div>
            </button>
        </section>

        <div class="large-stat-card">
            <div class="card__title--left">종합 공기질 지수 추천 (IAQ)</div>
            <div class="large-stat-card__content">
                <div class="stat-item stat-item--recommendation">
                    <div class="stat-item__value" id="iaq_value">--</div> 
                    <div class="stat-item__label">현재 CO2</div>
                </div>
                <div class="stat-item stat-item--recommendation">
                    <div class="stat-item__value" id="temp_value">--</div> 
                    <div class="stat-item__label">현재 온도</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item__value" id="final_recommendation">--</div> 
                    </div>
            </div>
        </div>

       <div class="info-card">
            <div class="card-content-wrapper">
                
                <div class="bar-chart-container" id="live_bar_chart">
                    <div class="card__title--left">실시간 미세먼지 농도 비교</div>
                    
                    <div class="bar-chart-visuals">
                        <div class="bar-chart__bar-group">
                            <div class="bar-chart__value" data-value-for="pm10">--</div> <div class="bar-chart__bar" data-sensor="pm10" style="height: 0%;"></div>
                            <div class="bar-chart__label">502 PM10</div>
                        </div>
                        <div class="bar-chart__bar-group">
                            <div class="bar-chart__value" data-value-for="asan_pm10" id="asan_pm10_val_chart">--</div> <div class="bar-chart__bar" data-sensor="asan_pm10" style="height: 0%;"></div>
                            <div class="bar-chart__label">아산시 PM10</div>
                        </div>
                        <div class="bar-chart__bar-group">
                            <div class="bar-chart__value" data-value-for="pm25">--</div> <div class="bar-chart__bar" data-sensor="pm25" style="height: 0%;"></div>
                            <div class="bar-chart__label">502 PM25</div>
                        </div>
                        <div class="bar-chart__bar-group">
                            <div class="bar-chart__value" data-value-for="asan_pm25" id="asan_pm25_val_chart">--</div> <div class="bar-chart__bar" data-sensor="asan_pm25" style="height: 0%;"></div>
                            <div class="bar-chart__label">아산시 PM25</div>
                        </div>
                    </div>
                </div>

                <div class="right-comparison-group">
                    <div class="small-info-card">
                        <div class="small-info-card__title">아산시 PM10</div>
                        <div class="small-info-card__content" id="asan_pm10">-- µg/m³</div>
                    </div>
                    <div class="small-info-card">
                        <div class="small-info-card__title">아산시 PM25</div>
                        <div class="small-info-card__content" id="asan_pm25">-- µg/m³</div>
                    </div>
                    
                    <div class="card__text-group" style="margin-top: 10px; align-self: center;">
                        <div class="card__text--title">외부 공기질과 비교 분석</div>
                        <div class="card__text--content">실내 환경 개선을 위한 맞춤형 정보 제공</div>
                    </div>
                </div>

            </div>
            
            </div>

        <div style="height: 1500px;"></div> `;

        

    // DOM 요소 할당과 폴링 시작을 innerHTML이 파싱된 후로 지연시킵니다.
    setTimeout(initializeLiveDashboard, 100);
}

// 2. 예측 대시보드 렌더링 (수정됨: 단일 객체와 버튼 구조)
function renderPredictDashboard() {
    stopDataPolling(); // 데이터 폴링 중지
    setActiveButton(btnPredict);

    // 다른 탭으로 이동 시 실시간 요소 변수들을 null로 초기화 (오류 방지)
    pm10ValueElement = null;
    co2ValueElement = null;
    tempValueElement = null;
    pm25ValueElement = null;
    tvocValueElement = null;
    humValueElement = null;
    chartBars = []; // 차트 배열도 비움

    mainContent.innerHTML = `
        <section class="section-header">
            <img
                src="https://marketplace.canva.com/zDhug/MAGx1pzDhug/1/tl/canva-cartoon-illustration-of-happy-yellow-chick-MAGx1pzDhug.png"
                alt="대표 이미지"
                class="section-header__image"
            />
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
                <img src="" alt="예측 이미지" class="card__image--predict" id="predict_card_image" />
                <div class="card__text-group">
                    <div class="card__text--title">AI기반 추천</div>
                    <div class="card__text--content" id="predict_card_content"></div>
                </div>
            </div>
        </div>

        <div style="height: 1500px;"></div>
    `;

    // 1. 초기 로드 시 PM10 예측값 표시
    updatePredictionCard('pm10');

    // 2. 버튼 클릭 이벤트 리스너 등록
    const predictButtons = document.querySelectorAll('.predict-buttons .text-btn');
    predictButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 버튼의 data-sensor 속성을 사용하여 해당 센서의 정보를 로드
            const sensor = this.dataset.sensor;
            updatePredictionCard(sensor);
        });
    });
}

// 3. 데이터 분석 대시보드 렌더링 (<iframe> 사용 및 버튼 추가)
function renderAnalysisDashboard() {
    stopDataPolling(); // 데이터 폴링 중지
    setActiveButton(btnAnalysis);

    // 다른 탭으로 이동 시 실시간 요소 변수들을 null로 초기화 (선택 사항이지만 안전함)
    pm10ValueElement = null;
    co2ValueElement = null;
    tempValueElement = null;
    pm25ValueElement = null;
    tvocValueElement = null;
    humValueElement = null;
    chartBars = []; // 차트 배열도 비움
    
    // HTML 마크업 생성 및 iframe 삽입
    mainContent.innerHTML = `
        <section class="section-header">
            <img
                src="https://marketplace.canva.com/zDhug/MAGx1pzDhug/1/tl/canva-cartoon-illustration-of-happy-yellow-chick-MAGx1pzDhug.png"
                alt="대표 이미지"
                class="section-header__image"
            />
            <div class="section-header__text-group">
                <div class="section-header__text--large">분석 정보</div>
                <div class="section-header__text--medium">
                    This is the analysis dashboard created using the same layout.
                </div>
                <div class="section-header__text--small">AI 기반 데이터 분석 페이지</div>
            </div>
        </section>

        <div class="analysis-buttons sensor-button-group" style="margin-top: 40px;">
            <button class="text-btn active" data-file="page/co2_by_weekday.html">학기 별 CO2 분석</button>
            <button class="text-btn" data-file="page/term_indoor_conditions.html">학기 별 전체 값 분석</button>
            <button class="text-btn" data-file="page/temperature_vs_co2.html">온도/습도 분석</button>
            <button class="text-btn" data-file="page/indoor_vs_outdoor_pm10.html">내부/외부 미세먼지 분석</button>
        </div>

        <iframe 
            id="analysis_iframe"
            src="co2_by_weekday.html"  style="width: 96%; height: 800px; border: none; margin-top: 20px;"
            title="Data Analysis Chart"
        ></iframe>
        
        <div style="height: 1500px;"></div>
    `;

    // <iframe>의 src를 변경하는 이벤트 리스너 등록
    const iframe = document.getElementById('analysis_iframe');
    const buttons = document.querySelectorAll('.analysis-buttons .text-btn');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // 모든 버튼의 active 클래스 제거
            buttons.forEach(btn => btn.classList.remove('active'));
            // 클릭된 버튼에 active 클래스 추가
            this.classList.add('active');

            // 버튼의 data-file 속성 값을 iframe의 src로 설정
            const newFile = this.dataset.file;
            iframe.src = newFile;
        });
    });
}

// ==================== 메인 메뉴 버튼 이벤트 ====================

btnPredict.addEventListener("click", renderPredictDashboard);
btnAnalysis.addEventListener("click", renderAnalysisDashboard);
btnLive.addEventListener("click", renderLiveDashboard);

function updateTime() {
    const now = new Date();

    const timeString = now.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    document.getElementById("currentTime").textContent = timeString;
}

// 처음 1번 실행
updateTime();

// 1초마다 시간 업데이트
setInterval(updateTime, 1000);
