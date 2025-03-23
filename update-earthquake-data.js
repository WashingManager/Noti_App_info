import fetch from 'node-fetch';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

async function updateEarthquakeData() {
    try {
        const url = 'https://www.weather.go.kr/w/eqk-vol/search/korea.do?startTm=2025-01-01&endTm=2025-03-23&startSize=2.0';
        const response = await fetch(url);
        const text = await response.text();
        console.log('응답 상태:', response.status);
        if (!response.ok) throw new Error(`HTTP 오류: ${response.status}`);

        const $ = cheerio.load(text);
        const earthquakeData = [];

        $('#excel_body tbody tr').each((i, row) => {
            const cells = $(row).find('td');
            const mapLink = $(cells[8]).find('a').attr('href') || null;
            const detailLink = $(cells[9]).find('a').attr('href') || null;

            earthquakeData.push({
                number: $(cells[0]).text().trim(),
                time: $(cells[1]).text().trim(),
                magnitude: $(cells[2]).text().trim(),
                depth: $(cells[3]).text().trim(),
                maxIntensity: $(cells[4]).text().trim(),
                latitude: $(cells[5]).text().trim(),
                longitude: $(cells[6]).text().trim(),
                location: $(cells[7]).text().trim(),
                mapLink: mapLink ? `https://www.weather.go.kr${mapLink}` : null,
                detailLink: detailLink ? `https://www.weather.go.kr${detailLink}` : null
            });
        });

        const lastUpdate = new Date().toISOString();

        writeFileSync(
            'earthquake-data.json',
            JSON.stringify({ data: earthquakeData, lastUpdate }, null, 2)
        );
        console.log('earthquake-data.json 업데이트 성공');
    } catch (error) {
        console.error('업데이트 실패:', error);
        writeFileSync(
            'earthquake-data.json',
            JSON.stringify({ data: [{ location: '오류', time: '데이터 업데이트 실패' }], lastUpdate: 'N/A' }, null, 2)
        );
    }
}

updateEarthquakeData();
