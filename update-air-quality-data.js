import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

async function updateAirQualityData() {
    try {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://www.iqair.com/ko/world-air-quality-ranking', { waitUntil: 'networkidle2' });

        const data = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
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

        const updateTime = await page.$eval('time.update-time', el => el.getAttribute('datetime')) || new Date().toISOString();

        writeFileSync(
            'air-quality-data.json',
            JSON.stringify({
                rankings: data,
                lastUpdate: updateTime
            }, null, 2)
        );
        console.log('air-quality-data.json 업데이트 성공');
        await browser.close();
    } catch (error) {
        console.error('업데이트 실패:', error);
        writeFileSync(
            'air-quality-data.json',
            JSON.stringify({
                rankings: [{ rank: '오류', city: '데이터 업데이트 실패' }],
                lastUpdate: 'N/A'
            }, null, 2)
        );
    }
}

updateAirQualityData();
