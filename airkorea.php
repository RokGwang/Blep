<?php
require_once __DIR__ . '/vendor/autoload.php';
// 1. 기존 로컬 데이터 변수 (사용하시려는 센서 데이터가 있다면 여기에 채우세요)
$local_data = [
    'pm10'        => null,
    'co2'         => null,
    'temperature' => null,
    'pm25'        => null,
    'tvoc'        => null,
    'humidity'    => null
];

// 2. 공공데이터 API 호출 설정 (도고 측정소)
$endpoint = "https://apis.data.go.kr/B552584/ArpltnStatsSvc/getMsrstnAcctoRDyrg";

// .env가 /var/www/html의 상위 폴더인 /var/www/에 있으므로 '/..' 경로 사용
$dotenv = Dotenv\Dotenv::createImmutable('/var/www/');
$dotenv->load();
// 인증키
$serviceKey = $_ENV['weather']; // <--- 여기에 본인의 인증키를 입력하세요

$startDate = date('Ymd', strtotime('-7 days'));
$endDate = date('Ymd');

$queryParams = http_build_query([
    'serviceKey' => $serviceKey,
    'returnType' => 'xml',
    'numOfRows'  => '10',
    'pageNo'     => '1',
    'inqBginDt'  => $startDate,
    'inqEndDt'   => $endDate,
    'msrstnName' => '도고면'
]);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $endpoint . '?' . $queryParams);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10); // 타임아웃 설정
$response = curl_exec($ch);
curl_close($ch);

// 3. API 데이터 파싱
$asan_pm10 = "--";
$asan_pm25 = "--";
$maxDate = '0000-00-00';

$xml = simplexml_load_string($response);

if ($xml && isset($xml->body->items->item)) {
    foreach ($xml->body->items->item as $item) {
        // 날짜를 비교하여 가장 최신 데이터만 선택
        if ((string)$item->msurDt > $maxDate) {
            $maxDate = (string)$item->msurDt;
            $asan_pm10 = (string)$item->pm10Value;
            $asan_pm25 = (string)$item->pm25Value;
        }
    }
}

// 4. JSON 데이터 조합
// 로컬 데이터 + 도고 데이터 합치기
$final_data = array_merge($local_data, [
    'asan_pm10' => $asan_pm10,
    'asan_pm25' => $asan_pm25
]);

// 5. JSON 출력
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'success' => true,
    'data' => $final_data
]);
?>
