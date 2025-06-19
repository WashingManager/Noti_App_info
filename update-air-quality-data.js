import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

// 처리되지 않은 Promise Rejection 처리
process.on('unhandledRejection', (error) => {
    console.error('처리되지 않은 Rejection:', error);
    process.exit(1);
});

async function waitForTable(page, selector, maxAttempts = 3) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await page.waitForSelector(selector, { timeout: 30000 });
            return true;
        } catch (error) {
            console.log(`테이블 로드 재시도 ${i + 1}/${maxAttempts}`);
            if (i === maxAttempts - 1) throw error;
            await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        }
    }
}

async function updateAirQualityData() {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://www.iqair.com/ko/world-air-quality-ranking', { waitUntil: 'networkidle2', timeout: 60000 });

        // 테이블 로드 대기
        await waitForTable(page, 'table tbody tr');
        console.log('테이블 로드 완료');

        const data = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            console.log(`발견된 행 수: ${rows.length}`);
            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                return {
                    rank: cells[0]?.textContent.trim() || '',
                    flag: cells[1]?.querySelector('img')?.src || '',
                    city: cells[2]?.querySelector('a')?.textContent.trim() || '',
                    link: cells[2]?.querySelector('a')?.href || '',
                    aqi: cells[3]?.querySelector('.aqi-number')?.textContent.trim() || '',
                    followers: cells[4]?.querySelector('.follower-number')?.textContent.trim() || ''
                };
            });
        });

        if (data.length === 0) {
            console.log('데이터가 비어 있음. HTML 확인:', await page.content().slice(0, 500));
            await page.screenshot({ path: 'debug-screenshot.png' });
        }

        let updateTime;
        try {
            // <time> 태그를 직접 선택
            await page.waitForSelector('time', { timeout: 10000 });
            updateTime = await page.$eval('time', el => el.getAttribute('datetime'));
            console.log('업데이트 시간 추출 성공:', updateTime);
        } catch (error) {
            console.log('time 태그 선택 실패, 기본 시간 사용:', error.message);
            updateTime = new Date().toISOString();
            await page.screenshot({ path: 'update-time-error-screenshot.png' });
            console.log('HTML 디버깅:', await page.content().slice(0, 500));
        }

        writeFileSync(
            'air-quality-data.json',
            JSON.stringify({
                rankings: data,
                lastUpdate: updateTime
            }, null, 2)
        );
        console.log('air-quality-data.json 업데이트 성공:', data.length, '개 항목');
    } catch (error) {
        console.error('업데이트 실패:', error.message);
        writeFileSync(
            'air-quality-data.json',
            JSON.stringify({
                rankings: [{ rank: '오류', city: `데이터 업데이트 실패: ${error.message}` }],
                lastUpdate: new Date().toISOString()
            }, null, 2)
        );
    } finally {
        if (browser) await browser.close().catch(err => console.error('브라우저 닫기 실패:', err));
    }
}

updateAirQualityData();
