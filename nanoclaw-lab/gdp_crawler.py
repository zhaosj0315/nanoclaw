import requests
import json
import sys
import os
from datetime import datetime

def fetch_gdp(country_code="CHN"):
    """Fetch GDP data from World Bank API."""
    url = f"https://api.worldbank.org/v2/country/{country_code}/indicator/NY.GDP.MKTP.CD?format=json"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if len(data) > 1:
            return data[1]
        return None
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def generate_report(data, country_code):
    if not data:
        return "Failed to fetch GDP data."
    
    country_name = data[0]['country']['value']
    lines = []
    lines.append(f"# GDP Report for {country_name} ({country_code})")
    lines.append("")
    lines.append(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append("| Year | GDP (Current USD) |")
    lines.append("|------|-------------------|")
    
    for entry in data[:10]: # Top 10 recent years
        year = entry['date']
        value = entry['value']
        if value:
            formatted_value = f"{value:,.0f}"
        else:
            formatted_value = "N/A"
        lines.append(f"| {year} | {formatted_value} |")
    
    return "\n".join(lines)

if __name__ == "__main__":
    country = sys.argv[1] if len(sys.argv) > 1 else "CHN"
    gdp_data = fetch_gdp(country)
    report_content = generate_report(gdp_data, country)
    
    # Save to a file in data/gdp_reports
    report_dir = "data/gdp_reports"
    os.makedirs(report_dir, exist_ok=True)
    report_path = os.path.join(report_dir, f"gdp_report_{country}_{datetime.now().strftime('%Y%m%d')}.md")
    
    with open(report_path, "wb") as f:
        f.write(report_content.encode('utf-8'))
    
    print(f"Report generated: {report_path}")
    print("\n--- REPORT START ---\n")
    print(report_content)
    print("\n--- REPORT END ---\n")