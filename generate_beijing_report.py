import pandas as pd

data = {
    "Title": [
        "Alibaba Launches AI Infrastructure Strategy in Beijing",
        "Beijing Digital Economy Computing Power Center Hosts Global Delegation",
        "China Establishes 42 Mega-GPU Clusters",
        "15th Five-Year Plan (2026-2030) AI Focus"
    ],
    "Category": [
        "AI Infrastructure",
        "Digital Economy",
        "Computing Power",
        "Policy"
    ],
    "Snippet": [
        "Alibaba initiates major investment in Beijing to establish AI as basic infrastructure for commerce and cloud, aligning with national 2026-2030 goals.",
        "On Feb 5, the center showcased urban AI operations to a delegation from 17 countries, highlighting Beijing's leadership in the intelligent economy.",
        "Nationwide deployment of 42 ten-thousand-GPU intelligent computing clusters, with Beijing as a core node for technology self-reliance.",
        "National policy designates AI as 'basic infrastructure' (New Infra) for the 2026-2030 period, focusing on embodied AI and 6G."
    ],
    "Source": [
        "Brussels Morning / Global Times",
        "Laotian Times",
        "Gov.cn",
        "Capital FM"
    ],
    "Date": [
        "2026-02-06",
        "2026-02-05",
        "2026-02-06",
        "2026-02-06"
    ]
}

df = pd.DataFrame(data)
df.to_excel("Today_News_Beijing_Tech_20260206.xlsx", index=False)
print("Excel generated successfully.")
