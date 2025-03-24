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

  // 타임아웃 설정 (60초로 증가)
  await page.setDefaultNavigationTimeout(60000);

  let jsonData = {
    timestamp: new Date().toISOString(),
    main: {},
    fireList: [],
    resourceList: []
  };

  try {
    // 네트워크 요청 추적 설정
    await page.setRequestInterception(true);
    let detailUrl = null;
    page.on('request', request => {
      if (request.url().includes('pubConn') && !request.url().includes('sub1.do') && !request.url().includes('sub2.do')) {
        detailUrl = request.url();
      }
      request.continue();
    });

    // 1. 메인 페이지
    console.log('Loading main page...');
    try {
      await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/main.do', { waitUntil: 'domcontentloaded' });
      jsonData.main = await page.evaluate(() => {
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
      console.log('Main page data extracted');
    } catch (e) {
      console.error('Main page load failed:', e);
    }

    // 2. 발생 정보 (sub1.do, 최대 3페이지)
    console.log('Loading sub1.do...');
    try {
      await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub1.do', { waitUntil: 'domcontentloaded' });
      await delay(3000);
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

        for (let j = 0; j < pageData.length; j++) {
          if (pageData[j].hasButton) {
            console.log(`Extracting URL for fire list row ${j + 1} on page ${i}`);
            detailUrl = null;
            await page.click(`#fireListWrap tbody tr:nth-child(${j + 1}) button.img`);
            await delay(3000);
            pageData[j].detailUrl = detailUrl || (await page.url());
            await page.goBack();
            await delay(3000);
          } else {
            pageData[j].detailUrl = '-';
          }
          delete pageData[j].hasButton;
        }

        jsonData.fireList.push(...pageData);

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
    } catch (e) {
      console.error('sub1.do processing failed:', e);
    }

    // 3. 자원 투입 내역 (sub2.do, 최대 3페이지)
    console.log('Loading sub2.do...');
    try {
      await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub2.do', { waitUntil: 'domcontentloaded' });
      await delay(3000);
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

        for (let j = 0; j < pageData.length; j++) {
          if (pageData[j].hasButton) {
            console.log(`Extracting URL for resource list row ${j + 1} on page ${i}`);
            detailUrl = null;
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

        jsonData.resourceList.push(...pageData);

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
    } catch (e) {
      console.error('sub2.do processing failed:', e);
    }

    // JSON 저장
    writeFileSync('forest-fire-data.json', JSON.stringify(jsonData, null, 2));
    console.log('forest-fire-data.json 업데이트 성공');
  } catch (error) {
    console.error('업데이트 실패:', error);
    writeFileSync('forest-fire-data.json', JSON.stringify(jsonData, null, 2));
  } finally {
    await browser.close();
  }
}

updateForestFireData();
