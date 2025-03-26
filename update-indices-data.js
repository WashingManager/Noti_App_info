import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

async function fetchTabData(page, tabId) {
    await page.click(`button[data-test-tab-id="${tabId}"]`);
    await page.waitForSelector('.datatable-v2_body__8TXQk', { timeout: 10000 });

    const data = await page.evaluate((tabId) => {
        const rows = Array.from(document.querySelectorAll('.datatable-v2_body__8TXQk tr'));
        return rows.map(row => {
            const cells = row.querySelectorAll('td');
            const nameCell = cells[1];
            const timeCell = cells[cells.length - 1];

            // 국기 URL 생성 (FlagCDN 사용)
            const flagElement = nameCell.querySelector('span[class^="flag_flag"]');
            let flagUrl = '';
            if (flagElement) {
                let countryCode = flagElement.getAttribute('data-test')?.replace('flag-', '').toLowerCase() || '';
                if (countryCode === 'tp') {
                    countryCode = 'tw';
                }
                flagUrl = countryCode ? `https://flagcdn.com/16x12/${countryCode}.png` : '';
            }

            // 기본 반환 객체
            const result = {
                name: nameCell.querySelector('a')?.textContent.trim() || '',
                link: nameCell.querySelector('a')?.href || '',
                flagUrl,
                values: tabId === 0
                    ? Array.from(cells).slice(2, -1).map(cell => cell.textContent.trim()) // 가격 탭: 마지막 셀 제외
                    : Array.from(cells).slice(2).map(cell => cell.textContent.trim())   // 성과, 기술 분석 탭: 마지막 셀 포함
            };

            // 가격 탭(tabId === 0)일 때만 time과 marketStatus 추가
            if (tabId === 0) {
                const clockElement = timeCell.querySelector('svg');
                const marketStatus = clockElement
                    ? clockElement.classList.contains('text-market-open')
                        ? 'open'
                        : clockElement.classList.contains('text-market-closed')
                        ? 'closed'
                        : 'unknown'
                    : 'unknown';

                result.time = timeCell.querySelector('time')?.textContent.trim() || '';
                result.marketStatus = marketStatus;
            }

            return result;
        });
    }, tabId); // tabId를 evaluate 내부로 전달
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
