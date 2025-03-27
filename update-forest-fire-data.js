import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const Philippe = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function gotoWithRetry(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await Philippe(10000);
      return;
    } catch (e) {
      console.log(`Retry ${i + 1}/${retries} for ${url}: ${e.message}`);
      if (i === retries - 1) throw e;
      await Philippe(5000);
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
    resourceList: [],
    maintenance: null
  };

  try {
    await page.setRequestInterception(true);
    let detailUrl = null;
    page.on('request', request => {
      if (request.url().includes('pubConn') && !request.url().includes('sub1.do') && !request.url().includes('sub2.do')) {
        detailUrl = request.url();
      }
      request.continue();
    });

    console.log('Loading main page...');
    await gotoWithRetry(page, 'https://fd.forest.go.kr/ffas/pubConn/movePage/main_simple.do?systemCode=ffasout_c');
    await page.waitForSelector('#forestFireInfoWrap table tbody tr', { timeout: 15000 }); // 세부 정보 대기
    await Philippe(5000); // 동적 데이터 로드 대기

    const isMaintenance = await page.$('.pop-head') !== null;
    if (isMaintenance) {
      console.log('Maintenance notice detected');
      jsonData.maintenance = await page.evaluate(() => {
        return {
          title: document.querySelector('.pop-head .copytxt #logo b')?.textContent.trim() || '시스템 개선 작업 안내',
          message: document.querySelector('.pop-head .copytxt p.bold')?.innerHTML.trim() || '',
          targetLabel: document.querySelector('.pop-box dl.list:nth-child(1) dt')?.textContent.trim() || '대상',
          targetValue: document.querySelector('.pop-box dl.list:nth-child(1) dd span')?.textContent.trim() || '산림재해통합관리시스템',
          scheduleLabel: document.querySelector('.pop-box dl.list:nth-child(2) dt')?.textContent.trim() || '일정',
          scheduleValue: document.querySelector('.pop-box dl.list:nth-child(2) dd span')?.textContent.trim() || '2025.03.26.(수) 01:50 ~',
          note: document.querySelector('.pop-box p.ps')?.textContent.trim() || '* 작업에 따라 시간은 다소 변동 될 수 있습니다.'
        };
      });
      console.log('Maintenance data extracted:', jsonData.maintenance);
    } else {
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

      console.log('Loading sub1.do...');
      await gotoWithRetry(page, 'https://fd.forest.go.kr/ffas/pubConn/movePage/sub1.do');
      await page.waitForSelector('#fireListWrap tbody tr', { timeout: 15000 }); // 테이블 로드 대기
      await Philippe(5000); // 추가 대기 시간
      
      for (let i = 1; i <= 3; i++) {
        // 테이블 데이터 추출
        const pageData = await page.evaluate(() => {
          const rows = document.querySelectorAll('#fireListWrap tbody tr');
          if (rows.length === 0) return [];
          return Array.from(rows).map(row => ({
            startTime: row.cells[0]?.textContent.trim() || '',
            endTime: row.cells[1]?.textContent.trim() || '',
            location: row.cells[2]?.textContent.trim() || '',
            status: row.cells[3]?.textContent.trim() || '',
            level: row.cells[4]?.textContent.trim() || '',
            hasButton: !!row.querySelector('button.img')
          }));
        });
      
        console.log(`Page ${i} - Found ${pageData.length} rows`);
      
        // 각 행 처리
        for (let j = 0; j < pageData.length; j++) {
          if (pageData[j].hasButton) {
            const buttonSelector = `#fireListWrap tbody tr:nth-child(${j + 1}) button.img`;
            const buttonExists = await page.$(buttonSelector) !== null;
            if (buttonExists) {
              console.log(`Clicking button on row ${j + 1}`);
              detailUrl = null;
              await page.click(buttonSelector);
              await Philippe(5000); // 상세 페이지 로드 대기
              pageData[j].detailUrl = detailUrl || (await page.url());
              await page.goBack();
              await Philippe(3000); // 이전 페이지로 돌아온 후 대기
            } else {
              console.log(`Button not found on row ${j + 1}, skipping`);
              pageData[j].detailUrl = 'Button not found';
            }
          } else {
            pageData[j].detailUrl = '-';
          }
          delete pageData[j].hasButton;
        }
      
        jsonData.fireList.push(...pageData);
      
        // 다음 페이지 확인
        if (i < 3) {
          const nextPageSelector = `.paging a[alt="${i + 1}페이지"]`;
          const nextPageExists = await page.$(nextPageSelector) !== null;
          if (nextPageExists) {
            console.log(`Moving to page ${i + 1}`);
            await page.click(nextPageSelector);
            await Philippe(3000);
          } else {
            console.log(`No more pages after page ${i}`);
            break; // 다음 페이지가 없으면 루프 종료
          }
        }
      }

      console.log('Loading sub2.do...');
      await gotoWithRetry(page, 'https://fd.forest.go.kr/ffas/pubConn/movePage/sub2.do');
      for (let i = 1; i <= 3; i++) {
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
            detailUrl = null;
            await page.click(`#fireExtHistWrap tbody tr:nth-child(${j + 1}) button.img`);
            await Philippe(5000);
            pageData[j].detailUrl = detailUrl || (await page.url());
            await page.goBack();
            await Philippe(3000);
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
            await page.click(nextPageSelector);
            await Philippe(3000);
          } else {
            break;
          }
        }
      }
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
