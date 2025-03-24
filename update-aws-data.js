import { writeFileSync } from 'fs';
import puppeteer from 'puppeteer';

async function fetchAWSData(stnId) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://www.weather.go.kr/plus/land/current/aws_table_popup.jsp', { waitUntil: 'networkidle2' });
    
    await page.evaluate((stn) => parent.parent.menu.stn_select(stn), stnId);
    await page.waitForSelector('table table', { timeout: 10000 });

    const data = await page.evaluate(() => {
        const meta = document.querySelector('.regs')?.textContent.trim() || 'Unknown';
        const headers = Array.from(document.querySelectorAll('tr.name td')).map(th => th.textContent.trim());
        const rows = Array.from(document.querySelectorAll('tr.text')).slice(0, 5).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
        );
        return { meta, headers, data: rows };
    });

    await browser.close();
    return {
        stn: stnId,
        meta: data.meta,
        headers: data.headers,
        data: data.data,
        lastUpdate: new Date().toISOString()
    };
}

async function updateAWSData() {
    try {
        const data = await fetchAWSData('433'); // 부천 기본값
        writeFileSync('aws_data.json', JSON.stringify(data, null, 2));
        console.log('aws_data.json 업데이트 성공');
    } catch (error) {
        console.error('업데이트 실패:', error);
        writeFileSync('aws_data.json', JSON.stringify({
            stn: '433',
            meta: '오류',
            headers: ['오류'],
            data: [['데이터 업데이트 실패']],
            lastUpdate: 'N/A'
        }, null, 2));
    }
}

updateAWSData();
