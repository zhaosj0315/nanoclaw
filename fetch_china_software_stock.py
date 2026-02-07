import requests
import json
import csv
from datetime import datetime, timedelta

def fetch_stock_data(code, start_date, end_date):
    # secid: 1 for SH, 0 for SZ
    secid = f"1.{code}" if code.startswith('60') else f"0.{code}"
    url = "http://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "secid": secid,
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": "101", # daily
        "fqt": "1",   # forward adjust
        "beg": start_date,
        "end": end_date,
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    if data and data['data'] and data['data']['klines']:
        klines = data['data']['klines']
        rows = []
        for line in klines:
            rows.append(line.split(','))
        return rows
    return None

def save_to_csv(data, filename):
    headers = ["日期", "开盘", "收盘", "最高", "最低", "成交量", "成交额", "振幅", "涨跌幅", "涨跌额", "换手率"]
    with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(data)

if __name__ == "__main__":
    stock_code = "600536"
    end_date = "20260207"
    start_date = "20250207"
    
    print(f"Fetching data for {stock_code} from {start_date} to {end_date}...")
    data = fetch_stock_data(stock_code, start_date, end_date)
    
    if data:
        filename = f"China_Software_600536_last_year.csv"
        save_to_csv(data, filename)
        print(f"Successfully saved data to {filename}")
    else:
        print("Failed to fetch data.")
