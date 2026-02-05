import matplotlib.pyplot as plt
import numpy as np

# 数据来源：VICTORY_REPORT_20260206.md
metrics = ['Funding Gap ($M)', 'I-29 Delay (Min)', 'Const. Risk (%)', 'Hotel Support (%)']
before = [20.0, 77.0, 95.0, 10.0]  # 初始风险/负债
after = [-1.98, 15.0, 5.0, 98.0]   # 成功后的盈余/低风险

x = np.arange(len(metrics))
width = 0.35

fig, ax = plt.subplots(figsize=(10, 6))
rects1 = ax.bar(x - width/2, before, width, label='Before NanoClaw', color='#e74c3c')
rects2 = ax.bar(x + width/2, after, width, label='After NanoClaw', color='#2ecc71')

ax.set_ylabel('Impact Level / Value')
ax.set_title('Platte County Strategic Victory: Performance Analysis (2026-02-06)')
ax.set_xticks(x)
ax.set_xticklabels(metrics)
ax.legend()

# 添加数据标签
def autolabel(rects):
    for rect in rects:
        height = rect.get_height()
        ax.annotate('{}'.format(height),
                    xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3), 
                    textcoords="offset points",
                    ha='center', va='bottom')

autolabel(rects1)
autolabel(rects2)

plt.tight_layout()
plt.savefig('victory_performance.png')
print("Chart generated successfully: victory_performance.png")
