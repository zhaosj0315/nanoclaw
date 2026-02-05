import matplotlib.pyplot as plt
import numpy as np

# Simulate data for Site-A Concrete Supply (Backup-B)
days = np.array(['Feb 1', 'Feb 2', 'Feb 3', 'Feb 4', 'Feb 5', 'Feb 6 (Today)', 'Feb 7 (Forecast)'])
supply_level = np.array([30, 25, 45, 60, 85, 92, 98])  # Percentage of required capacity
demand_threshold = np.array([85, 85, 85, 85, 85, 85, 85])

plt.figure(figsize=(10, 6))
plt.plot(days, supply_level, marker='o', linestyle='-', color='b', label='Actual/Projected Supply (Backup-B)')
plt.axhline(y=85, color='r', linestyle='--', label='Minimum Operational Threshold (85%)')
plt.fill_between(days, supply_level, 85, where=(supply_level >= 85), color='green', alpha=0.3, label='Recovery Surplus')
plt.fill_between(days, supply_level, 85, where=(supply_level < 85), color='red', alpha=0.3, label='Supply Gap')

plt.title('Site-A Infrastructure Recovery: Concrete Supply Chain Stability', fontsize=14)
plt.xlabel('Date (Feb 2026)', fontsize=12)
plt.ylabel('Supply Capacity (%)', fontsize=12)
plt.ylim(0, 110)
plt.legend(loc='lower right')
plt.grid(True, linestyle=':', alpha=0.6)

plt.tight_layout()
plt.savefig('site_a_supply_trend.png')
print("Chart generated: site_a_supply_trend.png")
