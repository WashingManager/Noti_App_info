import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

async function updateKoreaAirQualityData() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            protocolTimeout: 180000 // 3분 타임아웃
        });
        const page = await browser.newPage();

        const categories = {
            '10008': 102, // PM-2.5
            '10007': 103, // PM-10
            '10003': 104, // 오존
            '10006': 105, // 이산화질소
            '10002': 106, // 일산화탄소
            '10001': 107  // 아황산가스
        };

        const cities = ['전국', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '세종'];
        const data = {};

        for (const [itemCode, menuNo] of Object.entries(categories)) {
            const url = `https://www.airkorea.or.kr/web/sidoQualityCompare?itemCode=${itemCode}&pMENU_NO=${menuNo}`;
            console.log(`Fetching data for itemCode: ${itemCode}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // 테이블 로드 대기
            await page.waitForSelector('#sidoTable', { timeout: 60000 });

            // 시간평균 행 데이터 추출 (첫 번째 행)
            const categoryData = await page.evaluate((cities) => {
                const row = document.querySelector('#sidoTable tr:first-child'); // 시간평균 행
                const cells = Array.from(row.querySelectorAll('td'));
                return cities.map((city, index) => ({
                    city,
                    value: cells[index]?.textContent.trim() || '-'
                }));
            }, cities);

            data[itemCode] = categoryData;
            console.log(`Successfully fetched data for itemCode: ${itemCode}`);
        }

        writeFileSync(
            'korea-air-quality-data.json',
            JSON.stringify({
                categories: data,
                lastUpdate: new Date().toISOString()
            }, null, 2)
        );
        console.log('korea-air-quality-data.json 업데이트 성공');
    } catch (error) {
        console.error('업데이트 실패:', error.message);
        writeFileSync(
            'korea-air-quality-data.json',
            JSON.stringify({
                categories: { '10008': [{ city: '오류', value: `데이터 업데이트 실패: ${error.message}` }] },
                lastUpdate: new Date().toISOString()
            }, null, 2)
        );
    } finally {
        if (browser) await browser.close();
    }
}

updateKoreaAirQualityData();
