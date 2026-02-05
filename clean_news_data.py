import pandas as pd
import os

def clean_data():
    file_path = 'Today_News_20260206.xlsx'
    if not os.path.exists(file_path):
        print(f"File {file_path} not found.")
        return

    df = pd.read_excel(file_path)
    
    # Define categories based on keywords
    categories = {
        'FIFA': ['fifa', 'world cup', 'soccer', 'football', 'platte county', 'tickets', 'parking'],
        'CRICKET': ['cricket', 't20', 'icc'],
        'OLYMPICS': ['olympic', 'eileen gu', 'winter games'],
        'MOTORSPORT': ['nascar', 'clash', 'racing'],
        'OTHER_SPORTS': ['darts', 'premier league darts']
    }

    def categorize(title, snippet):
        text = f"{str(title)} {str(snippet)}".lower()
        for cat, keywords in categories.items():
            if any(kw in text for kw in keywords):
                # Special check to distinguish FIFA World Cup from T20 World Cup
                if cat == 'FIFA' and 't20' in text and 'fifa' not in text:
                    continue
                return cat
        return 'UNCERTAIN'

    df['category'] = df.apply(lambda row: categorize(row['title'], row['snippet']), axis=1)

    # Save categorized files
    for cat in df['category'].unique():
        cat_df = df[df['category'] == cat]
        output_name = f'Today_News_{cat}_20260206.xlsx'
        cat_df.to_excel(output_name, index=False)
        print(f"Generated {output_name} with {len(cat_df)} items.")

    # Update summary
    with open('news_cleaning_summary.txt', 'w') as f:
        summary = df['category'].value_counts().to_string()
        f.write(f"News Cleaning Summary for 2026-02-06 (Refined):\n{summary}")
        print("Summary updated.")

if __name__ == "__main__":
    clean_data()