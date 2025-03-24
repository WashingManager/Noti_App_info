import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

// 대기 함수 추가
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function updateForestFireData() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    // 네트워크 요청 추적 설정
    await page.setRequestInterception(true);
    let detailUrl = null;
    page.on('request', request => {
      if (request.url().includes('pubConn') && !request.url().includes('sub1.do') && !request.url().includes('sub2.do')) {
        detailUrl = request.url(); // 상세 페이지로 보이는 URL 캡처
      }
      request.continue();
    });

    // 1. 메인 페이지
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

    // 2. 발생 정보 (sub1.do, 최대 3페이지)
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub1.do', { waitUntil: 'networkidle2' });
    await delay(3000);
    const fireList = [];
    for (let i = 1; i <= 3; i++) {
      console.log(`Processing fire list page ${i}`);
      const pageData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#fireListWrap tbody tr')).map(row => ({
          startTime: row.cells[0]?.textContent || '',
          endTime: row.cells[1]?.textContent || '',
          location: row.cells[2]?.textContent || '',
          status: row.cells[3]?.textContent || '',
          level: row.cells[4]?.textContent || '',
          hasButton: !!row.querySelector('button.img')
        }));
      });

      // URL 추출
      for (let j = 0; j < pageData.length; j++) {
        if (pageData[j].hasButton) {
          console.log(`Extracting URL for fire list row ${j + 1} on page ${i}`);
          detailUrl = null; // 초기화
          await page.click(`#fireListWrap tbody tr:nth-child(${j + 1}) button.img`);
          await delay(3000); // 네트워크 요청 대기
          pageData[j].detailUrl = detailUrl || (await page.url()); // 네트워크 요청이 없으면 현재 URL 사용
          await page.goBack();
          await delay(3000);
        } else {
          pageData[j].detailUrl = '-';
        }
        delete pageData[j].hasButton;
      }

      fireList.push(...pageData);

      if (i < 3) {
        const nextPageSelector = `.paging a[alt="${i + 1}페이지"]`;
        const nextPageExists = await page.$(nextPageSelector) !== null;
        if (nextPageExists) {
          console.log(`Navigating to fire list page ${i + 1}`);
          await page.click(nextPageSelector);
          await delay(3000);
        } else {
          console.log(`No more pages found after page ${i}`);
          break;
        }
      }
    }

    // 3. 자원 투입 내역 (sub2.do, 최대 3페이지)
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub2.do', { waitUntil: 'networkidle2' });
    await delay(3000);
    const resourceList = [];
    for (let i = 1; i <= 3; i++) {
      console.log(`Processing resource list page ${i}`);
      const pageData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#fireExtHistWrap tbody tr')).map(row => ({
          id: row.cells[0]?.textContent || '',
          location: row.cells[1]?.textContent || '',
          startTime: row.cells[2]?.textContent || '',
          endTime: row.cells[3]?.textContent || '',
          resources: row.cells[4]?.textContent || '',
          level: row.cells[5]?.textContent || '',
          hasButton: !!row.querySelector('button.img')
        }));
      });

      // URL 추출
      for (let j = 0; j < pageData.length; j++) {
        if (pageData[j].hasButton) {
          console.log(`Extracting URL for resource list row ${j + 1} on page ${i}`);
          await page.click(`#fireExtHistWrap tbody tr:nth-child(${j + 1}) button.img`);
          await delay(3000);
          pageData[j].detailUrl = detailUrl || (await page.url());
          await page.goBack();
          await delay(3000);
        } else {
          pageData[j].detailUrl = '-';
        }
        delete pageData[j].hasButton;
      }

      resourceList.push(...pageData);

      if (i < 3) {
        const nextPageSelector = `.paging a[alt="${i + 1}페이지"]`;
        const nextPageExists = await page.$(nextPageSelector) !== null;
        if (nextPageExists) {
          console.log(`Navigating to resource list page ${i + 1}`);
          await page.click(nextPageSelector);
          await delay(3000);
        } else {
          console.log(`No more pages found after page ${i}`);
          break;
        }
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
