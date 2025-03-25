import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function gotoWithRetry(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await delay(10000); // 동적 콘텐츠 로드 대기 (10초 이상 걸릴 수 있음)
      return;
    } catch (e) {
      console.log(`Retry ${i + 1}/${retries} for ${url}: ${e.message}`);
      if (i === retries - 1) throw e;
      await delay(5000);
    }
  }
}

async function updateForestFireData() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(120000);

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
      await gotoWithRetry(page, 'https://fd.forest.go.kr/ffas/pubConn/movePage/main.do');
      await page.waitForSelector('#cntFireExtinguish', { timeout: 15000 }); // 주요 요소 대기
      jsonData.main = await page.evaluate(() => {
        return {
          status: {
            extinguishing: document.querySelector('#cntFireExtinguish')?.textContent.trim() || 'N/A',
            completed: document.querySelector('#cntFireExceptionEnd')?.textContent.trim() || 'N/A',
            other: document.querySelector('#todayForestFire')?.textContent.trim() || 'N/A'
          },
          currentFire: {
            grade: document.querySelector('#frfrGrade')?.textContent.trim() || 'N/A',
            details: Array.from(document.querySelectorAll('#forestFireInfoWrap table tbody tr')).map(row => ({
              label: row.querySelector('th')?.textContent.trim() || '',
              value: row.querySelector('td')?.textContent.trim() || ''
            }))
          }
        };
      });
      console.log('Main page data extracted:', jsonData.main);
    } catch (e) {
      console.error('Main page load failed:', e);
    }

    // 2. 발생 정보 (sub1.do, 최대 3페이지)
    console.log('Loading sub1.do...');
    try {
      await gotoWithRetry(page, 'https://fd.forest.go.kr/ffas/pubConn/movePage/sub1.do');
      for (let i = 1; i <= 3; i++) {
        console.log(`Processing fire list page ${i}`);
        const pageData = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('#fireListWrap tbody tr')).map(row => ({
            startTime: row.cells[0]?.textContent.trim() || '',
            endTime: row.cells[1]?.textContent.trim() || '',
            location: row.cells[2]?.textContent.trim() || '',
            status: row.cells[3]?.textContent.trim() || '',
            level: row.cells[4]?.textContent.trim() || '',
            hasButton: !!row.querySelector('button.img')
          }));
        });

        for (let j = 0; j < pageData.length; j++) {
          if (pageData[j].hasButton) {
            console.log(`Extracting URL for fire list row ${j + 1} on page ${i}`);
            detailUrl = null;
            await page.click(`#fireListWrap tbody tr:nth-child(${j + 1}) button.img`);
            await delay(5000);
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
      await gotoWithRetry(page, 'https://fd.forest.go.kr/ffas/pubConn/movePage/sub2.do');
      for (let i = 1; i <= 3; i++) {
        console.log(`Processing resource list page ${i}`);
        const pageData = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('#fireExtHistWrap tbody tr')).map(row => ({
            id: row.cells[0]?.textContent.trim() || '',
            location: row.cells[1]?.textContent.trim() || '',
            startTime: row.cells[2]?.textContent.trim() || '',
            endTime: row.cells[3]?.textContent.trim() || '',
            resources: row.cells[4]?.textContent.trim() || '',
            level: row.cells[5]?.textContent.trim() || '',
            hasButton: !!row.querySelector('button.img')
          }));
        });

        for (let j = 0; j < pageData.length; j++) {
          if (pageData[j].hasButton) {
            console.log(`Extracting URL for resource list row ${j + 1} on page ${i}`);
            detailUrl = null;
            await page.click(`#fireExtHistWrap tbody tr:nth-child(${j + 1}) button.img`);
            await delay(5000);
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
