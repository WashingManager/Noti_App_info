import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

async function fetchTabData(page, tabId) {
    await page.click(`button[data-test-tab-id="${tabId}"]`);
    await page.waitForSelector('.datatable-v2_body__8TXQk', { timeout: 10000 }); // 테이블 로드 대기

    const data = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.datatable-v2_body__8TXQk tr'));
        return rows.map(row => {
            const cells = row.querySelectorAll('td');
            const nameCell = cells[1]; // 종목명 셀
            const timeCell = cells[cells.length - 1]; // 시간 셀 (마지막 열)

            // 국기 정보 추출
            const flagElement = nameCell.querySelector('span[class^="flag_flag"]');
            const country = flagElement ? flagElement.getAttribute('aria-label') : '';

            // 시장 상태 추출
            const clockElement = timeCell.querySelector('svg');
            const marketStatus = clockElement
                ? clockElement.classList.contains('text-market-open')
                    ? 'open'
                    : clockElement.classList.contains('text-market-closed')
                    ? 'closed'
                    : 'unknown'
                : 'unknown';

            return {
                name: nameCell.querySelector('a')?.textContent.trim() || '',
                link: nameCell.querySelector('a')?.href || '',
                country: country, // 국기 정보 추가
                values: Array.from(cells).slice(2, -1).map(cell => cell.textContent.trim()), // 시간 열 제외한 값
                time: timeCell.querySelector('time')?.textContent.trim() || '', // 시간 정보
                marketStatus: marketStatus // 시장 상태 추가
            };
        });
    });
    return data;
}

async function updateIndicesData() {
    try {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://kr.investing.com/indices/major-indices', { waitUntil: 'networkidle2' });

        const priceData = await fetchTabData(page, 0); // "가격" 탭
        const performanceData = await fetchTabData(page, 1); // "성과" 탭
        const technicalData = await fetchTabData(page, 2); // "기술 분석" 탭

        const lastUpdate = new Date().toISOString();

        writeFileSync(
            'indices-data.json',
            JSON.stringify({
                price: priceData,
                performance: performanceData,
                technical: technicalData,
                lastUpdate
            }, null, 2)
        );
        console.log('indices-data.json 업데이트 성공');
        await browser.close();
    } catch (error) {
        console.error('업데이트 실패:', error);
        writeFileSync(
            'indices-data.json',
            JSON.stringify({
                price: [{ name: '오류', values: ['데이터 업데이트 실패'] }],
                performance: [{ name: '오류', values: ['데이터 업데이트 실패'] }],
                technical: [{ name: '오류', values: ['데이터 업데이트 실패'] }],
                lastUpdate: 'N/A'
            }, null, 2)
        );
    }
}

updateIndicesData();
