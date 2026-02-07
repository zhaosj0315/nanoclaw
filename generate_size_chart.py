import matplotlib.pyplot as plt
import os

# Data from the shell output
data = [
    ("nanoclaw_db_dashboard_20260207.png", 204),
    ("INFRA_CONSOLIDATED_REPORT_20260206.pdf", 196),
    ("package-lock.json", 140),
    ("file_size_distribution.png", 72),
    ("Daily_Sports_News_Report_2026-02-07.pdf", 64),
    ("daily_core_metrics_20260206_cn.png", 44),
    ("news_topic_distribution.png", 40),
    ("Today_News_20260206_Summary.txt", 12),
    ("generate_comprehensive_report.py", 8),
    ("Today_News_FIFA_20260206_Summary.txt", 8),
]

files, sizes = zip(*data)

plt.figure(figsize=(12, 8))
bars = plt.barh(files, sizes, color='skyblue')
plt.xlabel('Size (KB)')
plt.title('Top 10 Files by Size in Current Directory')
plt.gca().invert_yaxis()

for bar in bars:
    width = bar.get_width()
    plt.text(width + 2, bar.get_y() + bar.get_height()/2, f'{width} KB', va='center')

plt.tight_layout()
plt.savefig('file_size_distribution.png')
print("Chart saved as file_size_distribution.png")