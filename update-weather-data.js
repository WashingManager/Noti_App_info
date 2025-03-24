import fetch from 'node-fetch';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

async function updateWeatherData() {
    try {
        const baseUrl = 'https://www.weather.go.kr/plus/land/current/aws_table_popup.jsp';
        const response = await fetch(`${baseUrl}?stn=433`); // 부천 기본값
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP 오류: ${response.status}`);

        const $ = cheerio.load(text);
        const weatherData = [];
        let timestamp = $('.ehead').text().match(/\d{4}\.\d{2}\.\d{2}\.\d{2}:\d{2}/)?.[0] || 'N/A';

        $('table table tbody tr.text').each((i, row) => {
            const cells = $(row).find('td');
            const stnId = $(cells[0]).find('a').attr('href')?.match(/\d+/)?.[0] || 'N/A';
            const location = $(cells[1]).text().trim();
            const altitude = $(cells[2]).text().trim();
            const precipitation = $(cells[3]).text().trim() === '○' ? 'Yes' : 'No';
            const temp = $(cells[10]).text().trim();
            const windDir1M = $(cells[11]).text().trim();
            const windDir1MText = $(cells[12]).text().trim();
            const windSpeed1M = $(cells[13]).text().trim();
            const windDir10M = $(cells[14]).text().trim();
            const windDir10MText = $(cells[15]).text().trim();
            const windSpeed10M = $(cells[16]).text().trim();
            const humidity = $(cells[17]).text().trim();
            const pressure = $(cells[18]).text().trim();
            const address = $(cells[19]).text().trim();

            weatherData.push({
                stnId,
                location,
                altitude,
                precipitation,
                temp,
                wind: {
                    '1M': { direction: windDir1M, text: windDir1MText, speed: windSpeed1M },
                    '10M': { direction: windDir10M, text: windDir10MText, speed: windSpeed10M }
                },
                humidity,
                pressure,
                address
            });
        });

        const jsonData = {
            timestamp,
            defaultStn: '433', // 부천 기본값
            stations: weatherData
        };

        writeFileSync(
            'weather-data.json',
            JSON.stringify(jsonData, null, 2)
        );
        console.log('weather-data.json 업데이트 성공');
    } catch (error) {
        console.error('업데이트 실패:', error);
        writeFileSync(
            'weather-data.json',
            JSON.stringify({ timestamp: 'N/A', defaultStn: '433', stations: [{ stnId: '오류', location: '데이터 업데이트 실패' }] }, null, 2)
        );
    }
}

updateWeatherData();
