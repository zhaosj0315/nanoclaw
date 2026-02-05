
import matplotlib.pyplot as plt
import numpy as np

# Data for Security Funding Gap vs Logistics Delay
gap_levels = np.array([0, 10, 20, 30, 35, 40, 50]) # In millions USD
delays = np.array([10, 15, 30, 120, 180, 240, 300]) # In minutes

plt.figure(figsize=(10, 6))
plt.plot(gap_levels, delays, marker='o', linestyle='-', color='red', linewidth=2, label='Average Logistics Delay')
plt.axvline(x=20, color='orange', linestyle='--', label='Inflection Point ($20M)')
plt.fill_between(gap_levels, delays, where=(gap_levels >= 20), color='salmon', alpha=0.3, label='System Failure Zone')

plt.title('KCI Logistics Impact: Security Funding Gap vs. Processing Delay', fontsize=14)
plt.xlabel('Funding Gap (Million USD)', fontsize=12)
plt.ylabel('Average Delay (Minutes)', fontsize=12)
plt.grid(True, which='both', linestyle='--', alpha=0.5)
plt.legend()

# Adding text annotations
plt.annotate('Normal Operations', xy=(5, 12), xytext=(2, 50),
             arrowprops=dict(facecolor='black', shrink=0.05))
plt.annotate('Logistics Collapse', xy=(35, 180), xytext=(25, 250),
             arrowprops=dict(facecolor='black', shrink=0.05))

plt.tight_layout()
plt.savefig('logistics_collapse_risk.png')
print("Chart generated: logistics_collapse_risk.png")
