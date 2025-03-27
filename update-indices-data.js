import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

// 처리되지 않은 Promise Rejection 처리
process.on('unhandledRejection', (error) => {
    console.error('처리되지 않은 Rejection:', error);
    process.exit(1);
});

// 탭 데이터 가져오는 함수
async function fetchTabData(page, tabId) {
    try {
        // 탭 버튼 클릭
        await page.click(`button[data-test-tab-id="${tabId}"]`);
        // 데이터 테이블 로드 대기
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
    } catch (error) {
        throw new Error(`탭 ${tabId} 데이터 가져오기 실패: ${error.message}`);
    }
}

// 인덱스 데이터 업데이트 함수
async function updateIndicesData() {
    let browser;
    try {
        // Puppeteer 브라우저 실행
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 30000 // 브라우저 실행 타임아웃 30초
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 }); // 화면 크기 설정으로 렌더링 개선

        // 페이지 이동 및 로드 대기
        await page.goto('https://kr.investing.com/indices/major-indices', { 
            waitUntil: 'networkidle2',
            timeout: 30000 // 페이지 로드 타임아웃 30초
        });

        // 각 탭 데이터 가져오기
        const priceData = await fetchTabData(page, 0); // "가격" 탭
        const performanceData = await fetchTabData(page, 1); // "성과" 탭
        const technicalData = await fetchTabData(page, 2); // "기술 분석" 탭

        const lastUpdate = new Date().toISOString();

        // JSON 파일로 저장
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

    } catch (error) {
        console.error('업데이트 실패:', error);
        // 오류 발생 시 기본 오류 데이터 저장
        writeFileSync(
            'indices-data.json',
            JSON.stringify({
                price: [{ name: '오류', values: [error.message] }],
                performance: [{ name: '오류', values: [error.message] }],
                technical: [{ name: '오류', values: [error.message] }],
                lastUpdate: 'N/A'
            }, null, 2)
        );
    } finally {
        // 브라우저 정리
        if (browser) {
            await browser.close().catch(err => console.error('브라우저 닫기 실패:', err));
        }
    }
}

// 함수 실행
updateIndicesData();
