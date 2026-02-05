# -*- coding: utf-8 -*-
import datetime
import requests
from bs4 import BeautifulSoup
import sys
import os
import json
import time
import pandas as pd

class InfraCrawler:
    def __init__(self, output_dir="data/wc2026"):
        self.output_dir = output_dir
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        self.session = requests.Session()
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
        }
        self.session.headers.update(self.headers)

    def search_ddg(self, query):
        print(f"[{datetime.datetime.now()}] 🔍 Searching: {query}")
        url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
        try:
            response = self.session.get(url, timeout=15)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                results = []
                for result in soup.select('.result'):
                    title_tag = result.select_one('.result__title a')
                    snippet_tag = result.select_one('.result__snippet')
                    if title_tag:
                        results.append({
                            "title": title_tag.get_text().strip(),
                            "link": title_tag['href'],
                            "snippet": snippet_tag.get_text().strip() if snippet_tag else "",
                            "timestamp": datetime.datetime.now().isoformat()
                        })
                return results
            return []
        except Exception as e:
            print(f"❌ Error: {e}")
            return []

    def run(self):
        infrastructure_queries = [
            "World Cup 2026 stadium construction progress",
            "MetLife Stadium renovations for 2026 World Cup",
            "Estadio Azteca renovation status 2026",
            "BMO Field Toronto expansion World Cup 2026",
            "BC Place Vancouver World Cup upgrades progress",
            "SoFi Stadium pitch modification World Cup 2026",
            "Dallas AT&T Stadium renovations World Cup 2026",
            "Kansas City Arrowhead Stadium 2026 upgrades",
            "Monterrey Estadio BBVA World Cup preparation",
            "Guadalajara Estadio Akron World Cup 2026 news"
        ]
        
        all_data = []
        for query in infrastructure_queries:
            results = self.search_ddg(query)
            all_data.extend(results)
            time.sleep(3) # Be polite
        
        if all_data:
            self.save(all_data)
        else:
            print("No data found.")

    def save(self, data):
        # Deduplicate
        unique_data = list({item['link']: item for item in data}.values())
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"infra_progress_{timestamp}.json"
        filepath = os.path.join(self.output_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(unique_data, f, ensure_ascii=False, indent=2)
            
        # Also save to Excel for the user
        excel_path = f"Infra_Progress_{datetime.datetime.now().strftime('%Y%m%d')}.xlsx"
        pd.DataFrame(unique_data).to_excel(excel_path, index=False)
        print(f"✅ Deep crawl completed. Saved to {excel_path}")

if __name__ == "__main__":
    crawler = InfraCrawler()
    crawler.run()
