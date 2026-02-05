import matplotlib.pyplot as plt
import numpy as np

# 设置模拟参数
base_daily_cost = 50000  # 基础日成本 ($)
logistics_premium = 0.08  # 物流溢价
labor_premium_3shift = 0.25 # 三班倒人工成本溢价
total_days_remaining = 60 # 正常工期

# 场景 1: 常规进度
days = np.arange(0, total_days_remaining + 1)
cost_normal = days * base_daily_cost
progress_normal = (days / total_days_remaining) * 100

# 场景 2: 三班倒 (压缩工期至 70%)
sprint_total_days = int(total_days_remaining * 0.7)
days_sprint = np.arange(0, sprint_total_days + 1)
daily_cost_sprint = base_daily_cost * (1 + logistics_premium + labor_premium_3shift)
cost_sprint = days_sprint * daily_cost_sprint
progress_sprint = (days_sprint / sprint_total_days) * 100

# 绘图
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

ax1.plot(days, progress_normal, label='Normal Schedule', color='gray', linestyle='--')
ax1.plot(days_sprint, progress_sprint, label='3-Shift Sprint (Target)', color='green', linewidth=2)
ax1.set_title('Construction Progress Completion (%)')
ax1.set_xlabel('Days from Feb 6')
ax1.set_ylabel('% Complete')
ax1.legend()
ax1.grid(True, alpha=0.3)

ax2.plot(days, cost_normal / 1e6, label='Normal Cost', color='gray', linestyle='--')
ax2.plot(days_sprint, cost_sprint / 1e6, label='3-Shift Cost', color='orange', linewidth=2)
ax2.set_title('Cumulative Cost ($ Millions)')
ax2.set_xlabel('Days from Feb 6')
ax2.set_ylabel('USD (M)')
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('site_a_3shift_comparison.png')
print("Simulation complete. chart saved as site_a_3shift_comparison.png")
