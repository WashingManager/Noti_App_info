import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

async function updateKoreaAirQualityData() {
    try {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://airkorea.or.kr/web/', { waitUntil: 'networkidle2', timeout: 60000 });

        const categories = {
            'KHAI': 'tab1warnIngAreaKHAI',
            '10008': 'tab1warnIngArea10008', // 초미세먼지 (PM-2.5)
            '10007': 'tab1warnIngArea10007', // 미세먼지 (PM-10)
            '10003': 'tab1warnIngArea10003', // 오존
            '10006': 'tab1warnIngArea10006', // 이산화질소
            '10002': 'tab1warnIngArea10002', // 일산화탄소
            '10001': 'tab1warnIngArea10001'  // 아황산가스
        };

        const data = {};
        for (const [key, divId] of Object.entries(categories)) {
            await page.select('#itemBox2', key); // 드롭다운 선택
            await page.waitForFunction((id) => document.querySelector(`#${id}`)?.children.length > 0, { timeout: 30000 }, divId);

            const categoryData = await page.evaluate((id) => {
                const buttons = Array.from(document.querySelectorAll(`#${id} button`));
                return buttons.map(button => ({
                    city: button.textContent.split(/[\d.]+/)[0].trim(),
                    value: button.querySelector('span')?.textContent.trim() || ''
                }));
            }, divId);

            data[key] = categoryData;
        }

        writeFileSync(
            'korea-air-quality-data.json',
            JSON.stringify({
                categories: data,
                lastUpdate: new Date().toISOString()
            }, null, 2)
        );
        console.log('korea-air-quality-data.json 업데이트 성공');
        await browser.close();
    } catch (error) {
        console.error('업데이트 실패:', error.message);
        writeFileSync(
            'korea-air-quality-data.json',
            JSON.stringify({
                categories: { '10008': [{ city: '오류', value: `데이터 업데이트 실패: ${error.message}` }] },
                lastUpdate: new Date().toISOString()
            }, null, 2)
        );
    }
}

updateKoreaAirQualityData();
