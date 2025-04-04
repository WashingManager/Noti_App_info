import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function fetchEarthquakeData(url, isDomestic = false) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const allData = [];
    const baseUrl = 'https://www.weather.go.kr/w/eqk-vol/search/';
    let currentPage = 1; // 현재 페이지 번호 추적

    const formatLink = (link) => {
        if (!link) return null;
        if (link.startsWith('http')) return link;
        return `${baseUrl}${link}`;
    };

    while (true) {
        const content = await page.content();
        const $ = cheerio.load(content);

        // 현재 페이지의 데이터 수집
        $('#excel_body tbody tr').each((i, row) => {
            const cells = $(row).find('td');

            if (isDomestic) {
                const mapLink = $(cells[8]).find('a').attr('href') || null;
                const detailLink = $(cells[9]).find('a').attr('href') || null;

                allData.push({
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
                const mapLink = $(cells[7]).find('a').attr('href') || null;

                allData.push({
                    number: $(cells[0]).text().trim(),
                    time: $(cells[1]).text().trim(),
                    magnitude: $(cells[2]).text().trim(),
                    depth: $(cells[3]).text().trim(),
                    maxIntensity: '',
                    latitude: $(cells[4]).text().trim(),
                    longitude: $(cells[5]).text().trim(),
                    location: $(cells[6]).text().trim(),
                    mapLink: formatLink(mapLink),
                    detailLink: null
                });
            }
        });

        // 다음 페이지 링크 찾기
        const nextPageLink = await page.evaluate((currentPage) => {
            const pageLinks = document.querySelectorAll('.cmp-paging a');
            for (const link of pageLinks) {
                const href = link.getAttribute('href');
                const pageNum = parseInt(link.textContent.trim(), 10);
                if (pageNum === currentPage + 1 && href) {
                    return href; // 다음 페이지 번호의 href 반환
                }
            }
            return null; // 다음 페이지가 없으면 null
        }, currentPage);

        // 다음 페이지가 없으면 종료
        if (!nextPageLink) {
            console.log('No more pages to fetch.');
            break;
        }

        // 다음 페이지 URL 생성
        const nextUrl = `${baseUrl}${nextPageLink}`;
        console.log(`Moving to next page: ${nextUrl}`);

        // 페이지 이동
        try {
            await page.goto(nextUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            currentPage += 1; // 페이지 번호 증가
        } catch (err) {
            console.error(`Failed to navigate to ${nextUrl}: ${err.message}`);
            break;
        }
    }

    await browser.close();
    return allData;
}

async function fetchRecentEarthquakeData(url) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const content = await page.content();
    const $ = cheerio.load(content);

    const table = $('.cont-box-eqk tbody');
    const rows = table.find('tr');
    const baseUrl = 'https://www.weather.go.kr';

    const recentData = {
        time: $(rows[0]).find('td').text().trim(),
        magnitude: $(rows[1]).find('td strong').text().trim(),
        location: $(rows[2]).find('td.td_loc').text().trim(),
        depth: $(rows[2]).find('td').last().text().trim(),
        note: $(rows[3]).find('td').text().trim(),
        mapImage: baseUrl + $('.map-box img').attr('src')
    };

    await browser.close();
    return recentData;
}

async function updateEarthquakeData() {
    try {
        const domesticUrl = 'https://www.weather.go.kr/w/eqk-vol/search/korea.do';
        const internationalUrl = 'https://www.weather.go.kr/w/eqk-vol/search/worldwide.do';
        const recentUrl = 'https://www.weather.go.kr/w/eqk-vol/recent-eqk.do';

        const domesticData = await fetchEarthquakeData(domesticUrl, true);
        const internationalData = await fetchEarthquakeData(internationalUrl, false);
        const recentData = await fetchRecentEarthquakeData(recentUrl);

        const lastUpdate = new Date().toISOString();

        writeFileSync(
            'earthquake-data.json',
            JSON.stringify({
                domestic: domesticData,
                international: internationalData,
                recent: recentData,
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
                recent: { time: '오류', location: '최근 데이터 업데이트 실패' },
                lastUpdate: 'N/A'
            }, null, 2)
        );
    }
}

updateEarthquakeData();
