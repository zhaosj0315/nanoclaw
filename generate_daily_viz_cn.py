import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import platform

# Set Chinese font
system = platform.system()
if system == 'Darwin':
    plt.rcParams['font.sans-serif'] = ['PingFang SC', 'Arial Unicode MS', 'Heiti TC', 'sans-serif']
else:
    plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

# Data
# categories = ['Surplus ($M)', 'Concrete (%)', 'Clusters (#)', 'Funding (100M)']
categories = ['资金盈余($M)', '混凝土(%)', '智算集群(个)', '融资(亿元)']
values = [3.18, 92.2, 42, 3]
colors = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800']

fig, ax = plt.subplots(figsize=(10, 6))
bars = ax.bar(categories, values, color=colors, alpha=0.8)

# Add value labels
for bar in bars:
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
            f'{height}',
            ha='center', va='bottom', fontsize=12, fontweight='bold')

# Styling
ax.set_title('2026-02-06 每日核心指标概览', fontsize=16, pad=20)
ax.set_ylabel('数值', fontsize=12)
ax.grid(axis='y', linestyle='--', alpha=0.3)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig('daily_core_metrics_20260206_cn.png', dpi=150)