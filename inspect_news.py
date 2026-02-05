import pandas as pd
import os

file_path = 'Today_News_20260206.xlsx'
if os.path.exists(file_path):
    df = pd.read_excel(file_path)
    print(f"Total articles: {len(df)}")
    for i, row in df.iterrows():
        print(f"{i+1}. [{row.get('source', 'Unknown')}] {row['title']}")
else:
    print(f"File {file_path} not found.")
