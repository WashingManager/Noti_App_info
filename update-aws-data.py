import requests
from bs4 import BeautifulSoup
from datetime import datetime
import json

BASE_URL = "https://www.weather.go.kr/plus/land/current/aws_table_popup.jsp"
DEFAULT_STN = "433"

def fetch_aws_data(stn_id):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    payload = {"stn": stn_id}
    response = requests.post(BASE_URL, headers=headers, data=payload)
    
    if response.status_code != 200:
        print(f"Failed to fetch data for stn {stn_id}: {response.status_code}")
        return None
    
    soup = BeautifulSoup(response.text, 'html.parser')
    meta = soup.select_one(".regs").text.strip() if soup.select_one(".regs") else "Unknown"
    table = soup.select_one("table table")
    
    if not table:
        print(f"No table found for stn {stn_id}")
        return None
    
    headers = [th.text.strip() for th in table.select("tr.name td")]
    rows = [[td.text.strip() for td in tr.select("td")] for tr in table.select("tr.text")[:5]]
    
    return {
        "stn": stn_id,
        "meta": meta,
        "headers": headers,
        "data": rows,
        "lastUpdate": datetime.now().isoformat()
    }

def save_data(data):
    with open("aws_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("aws_data.json 저장 성공")

def main():
    data = fetch_aws_data(DEFAULT_STN)
    if data:
        save_data(data)
    else:
        print("Failed to fetch data")

if __name__ == "__main__":
    main()
