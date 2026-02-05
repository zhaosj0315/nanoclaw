import pandas as pd
import json

# Load news data if exists
news_file = 'data/wc2026/news_20260205_230237.json'
try:
    with open(news_file, 'r') as f:
        news_data = json.load(f)
    df_news = pd.DataFrame(news_data)
except Exception as e:
    print(f"Error loading news: {e}")
    df_news = pd.DataFrame()

# Host Cities data
host_cities = [
    {"Country": "USA", "City": "New York/New Jersey", "Stadium": "MetLife Stadium", "Capacity": 87157, "Role": "Final"},
    {"Country": "USA", "City": "Dallas", "Stadium": "AT&T Stadium", "Capacity": 92967, "Role": "Quarter-finals+"},
    {"Country": "USA", "City": "Atlanta", "Stadium": "Mercedes-Benz Stadium", "Capacity": 75000, "Role": "Semi-finals+"},
    {"Country": "USA", "City": "Los Angeles", "Stadium": "SoFi Stadium", "Capacity": 70240, "Role": "Opening Match (USA)"},
    {"Country": "USA", "City": "Kansas City", "Stadium": "Arrowhead Stadium", "Capacity": 76640, "Role": "Quarter-finals+"},
    {"Country": "USA", "City": "Houston", "Stadium": "NRG Stadium", "Capacity": 72220, "Role": ""},
    {"Country": "USA", "City": "San Francisco", "Stadium": "Levi's Stadium", "Capacity": 70909, "Role": ""},
    {"Country": "USA", "City": "Philadelphia", "Stadium": "Lincoln Financial Field", "Capacity": 69328, "Role": ""},
    {"Country": "USA", "City": "Seattle", "Stadium": "Lumen Field", "Capacity": 69000, "Role": ""},
    {"Country": "USA", "City": "Miami", "Stadium": "Hard Rock Stadium", "Capacity": 67518, "Role": "3rd Place Match"},
    {"Country": "USA", "City": "Boston", "Stadium": "Gillette Stadium", "Capacity": 65878, "Role": ""},
    {"Country": "Mexico", "City": "Mexico City", "Stadium": "Estadio Azteca", "Capacity": 87523, "Role": "Opening Match (Grand)"},
    {"Country": "Mexico", "City": "Guadalajara", "Stadium": "Estadio Akron", "Capacity": 48071, "Role": ""},
    {"Country": "Mexico", "City": "Monterrey", "Stadium": "Estadio BBVA", "Capacity": 53460, "Role": ""},
    {"Country": "Canada", "City": "Toronto", "Stadium": "BMO Field", "Capacity": 45736, "Role": "Opening Match (Canada)"},
    {"Country": "Canada", "City": "Vancouver", "Stadium": "BC Place", "Capacity": 54500, "Role": ""}
]
df_cities = pd.DataFrame(host_cities)

# Save to Excel with multiple sheets
try:
    with pd.ExcelWriter('Today_News_20260205.xlsx', engine='openpyxl') as writer:
        if not df_news.empty:
            df_news.to_excel(writer, sheet_name='Latest News', index=False)
        df_cities.to_excel(writer, sheet_name='Host Cities & Stadiums', index=False)
    print("Excel updated successfully.")
except Exception as e:
    print(f"Error saving Excel: {e}")
