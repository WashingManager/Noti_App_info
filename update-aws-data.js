import { writeFileSync } from 'fs';
import puppeteer from 'puppeteer';

async function fetchAWSData(stnId) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // 페이지 접속
    await page.goto('https://www.weather.go.kr/plus/land/current/aws_table_popup.jsp', { waitUntil: 'networkidle2' });
    
    // stn_select 호출 시뮬레이션
    try {
        await page.evaluate((stn) => {
            if (typeof parent?.parent?.menu?.stn_select === 'function') {
                parent.parent.menu.stn_select(stn);
            } else {
                throw new Error('stn_select function not found');
            }
        }, stnId);
    } catch (e) {
        console.error('stn_select 호출 실패:', e);
    }

    // 데이터 로드 대기 (최대 30초)
    await page.waitForTimeout(2000); // 초기 2초 대기
    await page.waitForSelector('table table', { timeout: 30000 }).catch(async () => {
        // 타임아웃 시 HTML 디버깅
        const html = await page.content();
        writeFileSync('debug.html', html);
        console.log('테이블 로드 실패, debug.html에 저장됨');
    });

    const data = await page.evaluate(() => {
        const meta = document.querySelector('.regs')?.textContent.trim() || 'Unknown';
        const table = document.querySelector('table table');
        if (!table) return { meta, headers: [], data: [] };
        
        const headers = Array.from(table.querySelectorAll('tr.name td')).map(th => th.textContent.trim());
        const rows = Array.from(table.querySelectorAll('tr.text')).slice(0, 5).map(tr => 
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
