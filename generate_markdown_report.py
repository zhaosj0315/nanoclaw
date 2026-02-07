import pandas as pd

df = pd.read_csv('China_Software_600536_last_year.csv')
df['日期'] = pd.to_datetime(df['日期'])
df = df.sort_values('日期')

start_date = df['日期'].min().strftime('%Y-%m-%d')
end_date = df['日期'].max().strftime('%Y-%m-%d')
start_price = df.iloc[0]['收盘']
end_price = df.iloc[-1]['收盘']
high_price = df['最高'].max()
low_price = df['最低'].min()
avg_change = df['涨跌幅'].mean()
total_volume = df['成交量'].sum()

report = f"""# 中国软件 (600536) 近一年股票分析报告

## 概览
- **统计周期**: {start_date} 至 {end_date}
- **起始收盘价**: {start_price:.2f}
- **最终收盘价**: {end_price:.2f}
- **年度最高价**: {high_price:.2f}
- **年度最低价**: {low_price:.2f}
- **平均日涨跌幅**: {avg_change:.2f}%
- **年度总成交量**: {total_volume:,}

## 趋势简评
在过去的一年中，中国软件股票经历了显著的价格波动。最终价格相比起始价格变动了 {((end_price - start_price) / start_price * 100):.2f}%。

## 数据清单 (最近10个交易日)
"""

tail_df = df.tail(10)[['日期', '开盘', '收盘', '最高', '最低', '涨跌幅']]
report += tail_df.to_markdown(index=False)

with open('China_Software_Report.md', 'w', encoding='utf-8') as f:
    f.write(report)
