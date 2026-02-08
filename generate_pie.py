import matplotlib.pyplot as plt

# Set font for Chinese characters (macOS)
plt.rcParams['font.sans-serif'] = ['Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False

# Data
labels = ['连通性 (Connectivity)', '安全性 (Security)', '智能模块 (Intelligence)', '资产管理 (Assets)', '监控指标 (Metrics)']
sizes = [25, 25, 20, 15, 15]
colors = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#607D8B']
explode = (0.1, 0, 0, 0, 0)  # highlight Connectivity

fig, ax = plt.subplots(figsize=(10, 7))
ax.pie(sizes, explode=explode, labels=labels, colors=colors, autopct='%1.1f%%',
        shadow=True, startangle=140)
ax.axis('equal')  # Equal aspect ratio ensures that pie is drawn as a circle.

plt.title('NanoClaw 当前系统状态分布', fontsize=16)
plt.tight_layout()
plt.savefig('system_status_pie.png')
print("Pie chart saved as system_status_pie.png")
