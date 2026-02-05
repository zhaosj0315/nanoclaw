# -*- coding: utf-8 -*-
import datetime
import requests
from bs4 import BeautifulSoup
import sys
import os
import json
import time

class WorldCupScraper:
    def __init__(self, output_dir="data/wc2026"):
        self.output_dir = output_dir
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        self.session = requests.Session()
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        }
        self.session.headers.update(self.headers)

    def fetch_news_ddg(self, query="World Cup 2026 news"):
        print(f"[{datetime.datetime.now()}] 🦆 Fetching from DuckDuckGo: {query}")
        
        try:
            # First, visit the homepage to get cookies
            self.session.get("https://duckduckgo.com/", timeout=10)
            
            # Now try the search
            url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
            response = self.session.get(url, timeout=15)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                articles = []
                
                # Try different selectors as DDG might change them
                results = soup.select('.result') or soup.select('.links_main')
                
                for result in results:
                    title_tag = result.select_one('.result__title a') or result.select_one('.result-link')
                    snippet_tag = result.select_one('.result__snippet') or result.select_one('.result-snippet')
                    
                    if title_tag:
                        articles.append({
                            "title": title_tag.get_text().strip(),
                            "link": title_tag['href'] if title_tag.has_attr('href') else "",
                            "source": "DuckDuckGo",
                            "snippet": snippet_tag.get_text().strip() if snippet_tag else ""
                        })
                
                return articles
            else:
                print(f"⚠️ DDG returned status {response.status_code}")
                return []

        except Exception as e:
            print(f"❌ Error fetching from DDG: {e}")
            return []

    def save_results(self, all_articles):
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save JSON
        json_path = os.path.join(self.output_dir, f"news_{timestamp}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(all_articles, f, ensure_ascii=False, indent=2)
            
        # Save Markdown Report
        md_path = os.path.join(self.output_dir, f"report_{timestamp}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"# 🐾 NanoClaw: World Cup 2026 Intelligence Report\n\n")
            f.write(f"**Generated at:** {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            # Deduplicate by title
            unique_articles = {a['title']: a for a in all_articles}.values()
            
            for i, article in enumerate(unique_articles, 1):
                f.write(f"### {i}. {article['title']}\n")
                f.write(f"- **Snippet:** {article.get('snippet', 'N/A')}\n")
                f.write(f"- **Link:** [Read More]({article['link']})\n\n")
        
        print(f"\n✅ Reports saved:")
        print(f"   - JSON: {json_path}")
        print(f"   - Markdown: {md_path}")
        return md_path

    def fetch_news_yahoo(self, query="World Cup 2026 news"):
        print(f"[{datetime.datetime.now()}] 🟣 Fetching from Yahoo News: {query}")
        url = f"https://news.search.yahoo.com/search?p={query.replace(' ', '+')}"
        
        try:
            response = self.session.get(url, timeout=15)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                articles = []
                
                # Yahoo News results are in 'div.NewsArticle' or similar
                for item in soup.select('div.NewsArticle'):
                    title_tag = item.select_one('h4.s-title a')
                    snippet_tag = item.select_one('p.s-desc')
                    source_tag = item.select_one('span.s-source')
                    
                    if title_tag:
                        articles.append({
                            "title": title_tag.get_text().strip(),
                            "link": title_tag['href'],
                            "source": source_tag.get_text().strip() if source_tag else "Yahoo News",
                            "snippet": snippet_tag.get_text().strip() if snippet_tag else ""
                        })
                
                return articles
            return []
        except Exception as e:
            print(f"❌ Error fetching from Yahoo: {e}")
            return []

    def run(self):
        queries = [
            "World Cup 2026 news",
            "World Cup 2026 schedule"
        ]
        
        all_results = []
        for q in queries:
            results = self.fetch_news_ddg(q)
            if not results:
                print(f"   (DDG failed, trying Yahoo News...)")
                results = self.fetch_news_yahoo(q)
            
            all_results.extend(results)
            time.sleep(2) 
            
        if all_results:
            self.save_results(all_results)
            print(f"\n--- Top 3 Headlines ---")
            for i, a in enumerate(all_results[:3], 1):
                print(f"{i}. {a['title']}")
        else:
            print("⚠️ No data collected. Please check network or proxy.")

if __name__ == '__main__':
    scraper = WorldCupScraper()
    scraper.run()
