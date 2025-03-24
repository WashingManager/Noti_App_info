import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

async function updateForestFireData() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // 이 부분 추가
  });
  const page = await browser.newPage();

  try {
    // 1. 메인 페이지 (진화중/완료/외 종료 + 상황 정보)
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/main.do', { waitUntil: 'networkidle2' });
    const mainData = await page.evaluate(() => {
      return {
        status: {
          extinguishing: document.querySelector('#cntFireExtinguish')?.textContent || 'N/A',
          completed: document.querySelector('#cntFireExceptionEnd')?.textContent || 'N/A',
          other: document.querySelector('#todayForestFire')?.textContent || 'N/A'
        },
        currentFire: {
          grade: document.querySelector('#frfrGrade')?.textContent || 'N/A',
          details: Array.from(document.querySelectorAll('#forestFireInfoWrap table tbody tr')).map(row => ({
            label: row.querySelector('th')?.textContent || '',
            value: row.querySelector('td')?.textContent || ''
          }))
        }
      };
    });

    // 2. 발생 정보 (sub1.do, 3페이지)
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub1.do', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000); // 로딩 대기
    const fireList = [];
    for (let i = 1; i <= 3; i++) {
      const pageData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#fireListWrap tbody tr')).map(row => ({
          startTime: row.cells[0]?.textContent || '',
          endTime: row.cells[1]?.textContent || '',
          location: row.cells[2]?.textContent || '',
          status: row.cells[3]?.textContent || '',
          level: row.cells[4]?.textContent || ''
        }));
      });
      fireList.push(...pageData);
      if (i < 3) {
        await page.click(`.paging a[alt="${i + 1}페이지"]`);
        await page.waitForTimeout(2000); // 페이지 로딩 대기
      }
    }

    // 3. 자원 투입 내역 (sub2.do, 3페이지)
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub2.do', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    const resourceList = [];
    for (let i = 1; i <= 3; i++) {
      const pageData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#fireExtHistWrap tbody tr')).map(row => ({
          id: row.cells[0]?.textContent || '',
          location: row.cells[1]?.textContent || '',
          startTime: row.cells[2]?.textContent || '',
          endTime: row.cells[3]?.textContent || '',
          resources: row.cells[4]?.textContent || '',
          level: row.cells[5]?.textContent || ''
        }));
      });
      resourceList.push(...pageData);
      if (i < 3) {
        await page.click(`.paging a[art="${i + 1}페이지"]`);
        await page.waitForTimeout(2000);
      }
    }

    // JSON 저장
    const jsonData = {
      timestamp: new Date().toISOString(),
      main: mainData,
      fireList,
      resourceList
    };
    writeFileSync('forest-fire-data.json', JSON.stringify(jsonData, null, 2));
    console.log('forest-fire-data.json 업데이트 성공');
  } catch (error) {
    console.error('업데이트 실패:', error);
    writeFileSync('forest-fire-data.json', JSON.stringify({ timestamp: 'N/A', main: {}, fireList: [], resourceList: [] }, null, 2));
  } finally {
    await browser.close();
  }
}

updateForestFireData();
