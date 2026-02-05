import matplotlib.pyplot as plt
import numpy as np

# 模拟参数
days = np.arange(0, 100)
baseline_delivery = 100 * (1 - np.exp(-0.05 * days)) # 正常进度曲线
plan_b_delivery = 60 * (1 - np.exp(-0.03 * days))    # 物流降速40%后的曲线

# 成本超支模拟 (以百万美元为单位)
cost_baseline = days * 0.5
cost_plan_b = days * 1.2 # 延期导致的人工和租赁成本激增

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 12))

# 进度对比
ax1.plot(days, baseline_delivery, 'g-', label='Baseline (With Surcharge)')
ax1.plot(days, plan_b_delivery, 'r--', label='Plan B (40% Logistics Slowdown)')
ax1.set_title('Site A Construction Progress: Baseline vs. Plan B', fontsize=14)
ax1.set_ylabel('Completion Percentage (%)')
ax1.legend()
ax1.grid(True)

# 成本对比
ax2.fill_between(days, cost_baseline, cost_plan_b, color='red', alpha=0.3, label='Estimated Cost Overrun')
ax2.plot(days, cost_baseline, 'g-', label='Budgeted Cost')
ax2.plot(days, cost_plan_b, 'r-', label='Plan B Projected Cost')
ax2.set_title('Cumulative Project Cost Inflation', fontsize=14)
ax2.set_ylabel('Cost (Millions USD)')
ax2.set_xlabel('Days from Hearing Failure')
ax2.legend()
ax2.grid(True)

plt.tight_layout()
plt.savefig('plan_b_impact_analysis.png')
