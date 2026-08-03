<?php
$endpoint = "https://apis.data.go.kr/B552584/ArpltnStatsSvc/getMsrstnAcctoRDyrg";
$serviceKey = "aa474cf9835ce9b58b5cecd42544fe0c4c5134b007a520bac9b0aa70bcca6da3"; 

// 1. 날짜를 자동으로 계산 (오늘 ~ 7일 전)
$endDate = date('Ymd');
$startDate = date('Ymd', strtotime('-7 days'));

$queryParams = [
    'serviceKey'      => $serviceKey,
    'returnType'      => 'xml',
    'numOfRows'       => '10', // 최근 7일치만 가져옴
    'pageNo'          => '1',
    'inqBginDt'       => $startDate,
    'inqEndDt'        => $endDate,
    'msrstnName'      => '도고면' // 측정소명
];

$url = $endpoint . '?' . http_build_query($queryParams);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
$response = curl_exec($ch);
curl_close($ch);

$xml = simplexml_load_string($response);

// 2. 가장 최신 데이터 1개를 찾기 위한 변수 초기화
$latestItem = null;
$maxDate = '0000-00-00';

// 데이터가 존재하는지 확인
if (isset($xml->body->items->item)) {
    foreach ($xml->body->items->item as $item) {
        $currentDate = (string)$item->msurDt;
        // 날짜가 더 크면 최신 데이터로 업데이트
        if ($currentDate > $maxDate) {
            $maxDate = $currentDate;
            $latestItem = $item;
        }
    }
}

// 3. 결과 출력
echo "<h3>도고 측정소 최근 데이터 (" . $maxDate . ")</h3>";

if ($latestItem) {
    echo "<table border='1' style='border-collapse: collapse; width: 300px;'>";
    echo "<tr style='background-color: #f2f2f2;'><th>측정항목</th><th>농도 (㎍/㎥)</th></tr>";
    
    // PM10과 PM2.5만 출력
    echo "<tr><td>미세먼지 (PM10)</td><td style='text-align:center;'>" . (string)$latestItem->pm10Value . "</td></tr>";
    echo "<tr><td>초미세먼지 (PM2.5)</td><td style='text-align:center;'>" . (string)$latestItem->pm25Value . "</td></tr>";
    
    echo "</table>";
} else {
    echo "도고 측정소의 최근 데이터가 없습니다. (데이터가 생성되지 않았을 수 있습니다.)";
}
?>
