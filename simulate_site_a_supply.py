import matplotlib.pyplot as plt
import matplotlib
import numpy as np
import platform

# Set font for Chinese characters based on OS
system_name = platform.system()
if system_name == 'Darwin':  # macOS
    plt.rcParams['font.sans-serif'] = ['Arial Unicode MS']
elif system_name == 'Windows':
    plt.rcParams['font.sans-serif'] = ['SimHei']
else:
    plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei']
plt.rcParams['axes.unicode_minus'] = False

# Simulate data for Site-A Concrete Supply (Backup-B)
days = np.array(['2月1日', '2月2日', '2月3日', '2月4日', '2月5日', '2月6日 (今日)', '2月7日 (预测)'])
supply_level = np.array([30, 25, 45, 60, 85, 92, 98])  # Percentage of required capacity
demand_threshold = np.array([85, 85, 85, 85, 85, 85, 85])

plt.figure(figsize=(10, 6))
plt.plot(days, supply_level, marker='o', linestyle='-', color='b', label='实际/预测供应量 (Backup-B)')
plt.axhline(y=85, color='r', linestyle='--', label='最小运营阈值 (85%)')
plt.fill_between(days, supply_level, 85, where=(supply_level >= 85), color='green', alpha=0.3, label='恢复盈余区')
plt.fill_between(days, supply_level, 85, where=(supply_level < 85), color='red', alpha=0.3, label='供应缺口')

plt.title('Site A 基建恢复：混凝土供应链稳定性', fontsize=14)
plt.xlabel('日期 (2026年2月)', fontsize=12)
plt.ylabel('供应能力 (%)', fontsize=12)
plt.ylim(0, 110)
plt.legend(loc='lower right')
plt.grid(True, linestyle=':', alpha=0.6)

plt.tight_layout()
plt.savefig('site_a_supply_trend.png')
print("Chart generated: site_a_supply_trend.png")