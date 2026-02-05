import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# Scenario: Hearing Rejects $8 Surcharge completely
# Impact on Funding, Logistics Delay, and Long-term Taxpayer Cost

days = np.array([0, 15, 30, 45, 60, 75, 90])
# Funding Gap (Millions)
funding_gap = np.array([0, 5, 12, 22, 35, 50, 70])
# Logistics Delay (Minutes)
delays = np.array([10, 25, 60, 120, 180, 300, 450])
# Local Tax Increase Risk (%)
tax_risk = np.array([0, 2, 8, 15, 25, 40, 65])

fig, ax1 = plt.subplots(figsize=(10, 6))

color = 'tab:red'
ax1.set_xlabel('Days After Rejection')
ax1.set_ylabel('Funding Gap ($M) / Tax Risk (%)', color=color)
ax1.plot(days, funding_gap, 'r-o', label='Funding Gap ($M)')
ax1.plot(days, tax_risk, 'r--', label='Local Tax Increase Risk (%)')
ax1.tick_params(axis='y', labelcolor=color)
ax1.grid(True, linestyle='--', alpha=0.6)

ax2 = ax1.twinx()
color = 'tab:blue'
ax2.set_ylabel('Logistics Delay (Min)', color=color)
ax2.plot(days, delays, 'b-s', label='Logistics Delay (Min)')
ax2.tick_params(axis='y', labelcolor=color)

plt.title('EXTREME RISK ANALYSIS: Total Surcharge Rejection Impact', fontsize=14)
fig.tight_layout()
plt.legend(loc='upper left')

plt.savefig('extreme_plan_b_rejection_analysis.png')
print("Analysis complete. Image saved as extreme_plan_b_rejection_analysis.png")
