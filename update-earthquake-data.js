import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function fetchEarthquakeData(url, isDomestic = false) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const content = await page.content();
    const $ = cheerio.load(content);

    const data = [];
    $('#excel_body tbody tr').each((i, row) => {
        const cells = $(row).find('td');
        const baseUrl = 'https://www.weather.go.kr';
        const formatLink = (link) => {
            if (!link) return null;
            if (link.startsWith('http')) return link;
            return `${baseUrl}${link}`;
        };

        if (isDomestic) {
            // 국내 지진: 10개 열
            const mapLink = $(cells[8]).find('a').attr('href') || null;
            const detailLink = $(cells[9]).find('a').attr('href') || null;

            data.push({
                number: $(cells[0]).text().trim(),
                time: $(cells[1]).text().trim(),
                magnitude: $(cells[2]).text().trim(),
                depth: $(cells[3]).text().trim(),
                maxIntensity: $(cells[4]).text().trim(),
                latitude: $(cells[5]).text().trim(),
                longitude: $(cells[6]).text().trim(),
                location: $(cells[7]).text().trim(),
                mapLink: formatLink(mapLink),
                detailLink: formatLink(detailLink)
            });
        } else {
            // 국외 지진: 8개 열
            const mapLink = $(cells[7]).find('a').attr('href') || null;

            data.push({
                number: $(cells[0]).text().trim(),
                time: $(cells[1]).text().trim(),
                magnitude: $(cells[2]).text().trim(),
                depth: $(cells[3]).text().trim(),
                maxIntensity: '', // 국외 데이터에는 최대진도 없음
                latitude: $(cells[4]).text().trim(),
                longitude: $(cells[5]).text().trim(),
                location: $(cells[6]).text().trim(),
                mapLink: formatLink(mapLink),
                detailLink: null // 국외 데이터에는 상세정보 없음
            });
        }
    });

    await browser.close();
    return data;
}

async function updateEarthquakeData() {
    try {
        const domesticUrl = 'https://www.weather.go.kr/w/eqk-vol/search/korea.do?startTm=2025-01-01&endTm=2025-03-23&startSize=2.0';
        const internationalUrl = 'https://www.weather.go.kr/w/eqk-vol/search/worldwide.do?startTm=2025-01-01&endTm=2025-03-23&startSize=2.0';

        const domesticData = await fetchEarthquakeData(domesticUrl, true);
        const internationalData = await fetchEarthquakeData(internationalUrl, false);

        const lastUpdate = new Date().toISOString();

        writeFileSync(
            'earthquake-data.json',
            JSON.stringify({
                domestic: domesticData,
                international: internationalData,
                lastUpdate
            }, null, 2)
        );
        console.log('earthquake-data.json 업데이트 성공');
    } catch (error) {
        console.error('업데이트 실패:', error);
        writeFileSync(
            'earthquake-data.json',
            JSON.stringify({
                domestic: [{ location: '오류', time: '국내 데이터 업데이트 실패' }],
                international: [{ location: '오류', time: '국외 데이터 업데이트 실패' }],
                lastUpdate: 'N/A'
            }, null, 2)
        );
    }
}

updateEarthquakeData();
