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

    // 2. 발생 정보 (sub1.do, 3페이지) + URL 추출
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub1.do', { waitUntil: 'networkidle2' });
    await delay(2000); // 페이지 로딩 대기
    const fireList = [];
    for (let i = 1; i <= 3; i++) {
      const pageData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#fireListWrap tbody tr')).map(row => ({
          startTime: row.cells[0]?.textContent || '',
          endTime: row.cells[1]?.textContent || '',
          location: row.cells[2]?.textContent || '',
          status: row.cells[3]?.textContent || '',
          level: row.cells[4]?.textContent || '',
          hasButton: !!row.querySelector('button.img') // 버튼 존재 여부 확인
        }));
      });

      // 각 행의 버튼 클릭 후 URL 추출
      for (let j = 0; j < pageData.length; j++) {
        if (pageData[j].hasButton) {
          await page.click(`#fireListWrap tbody tr:nth-child(${j + 1}) button.img`);
          await delay(2000); // 상세 페이지 로딩 대기
          pageData[j].detailUrl = page.url(); // 이동된 URL 저장
          await page.goBack(); // 이전 페이지로 돌아감
          await delay(2000);
        } else {
          pageData[j].detailUrl = '-'; // 버튼이 없는 경우
        }
        delete pageData[j].hasButton; // 임시 속성 제거
      }

      fireList.push(...pageData);
      if (i < 3) {
        await page.click(`.paging a[alt="${i + 1}페이지"]`);
        await delay(2000); // 페이지 로딩 대기
      }
    }

    // 3. 자원 투입 내역 (sub2.do, 3페이지) + URL 추출
    await page.goto('https://fd.forest.go.kr/ffas/pubConn/movePage/sub2.do', { waitUntil: 'networkidle2' });
    await delay(2000);
    const resourceList = [];
    for (let i = 1; i <= 3; i++) {
      const pageData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#fireExtHistWrap tbody tr')).map(row => ({
          id: row.cells[0]?.textContent || '',
          location: row.cells[1]?.textContent || '',
          startTime: row.cells[2]?.textContent || '',
          endTime: row.cells[3]?.textContent || '',
          resources: row.cells[4]?.textContent || '',
          level: row.cells[5]?.textContent || '',
          hasButton: !!row.querySelector('button.img') // 버튼 존재 여부 확인
        }));
      });

      // 각 행의 버튼 클릭 후 URL 추출
      for (let j = 0; j < pageData.length; j++) {
        if (pageData[j].hasButton) {
          await page.click(`#fireExtHistWrap tbody tr:nth-child(${j + 1}) button.img`);
          await delay(2000); // 상세 페이지 로딩 대기
          pageData[j].detailUrl = page.url(); // 이동된 URL 저장
          await page.goBack(); // 이전 페이지로 돌아감
          await delay(2000);
        } else {
          pageData[j].detailUrl = '-'; // 버튼이 없는 경우
        }
        delete pageData[j].hasButton; // 임시 속성 제거
      }

      resourceList.push(...pageData);
      if (i < 3) {
        await page.click(`.paging a[art="${i + 1}페이지"]`);
        await delay(2000);
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
