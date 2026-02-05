import matplotlib.pyplot as plt
import numpy as np

# Data for Victory Dashboard
categories = ['I-29 Travel Time (min)', 'Funding Status ($M)']
before = [77, -1.2] 
after = [39, 1.98] 

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

# Plot 1: Travel Time
ax1.bar(['Before', 'After'], [77, 39], color=['#ff9999', '#66b3ff'])
ax1.set_title('I-29 Travel Time Reduction')
ax1.set_ylabel('Minutes')
for i, v in enumerate([77, 39]):
    ax1.text(i, v + 1, str(v), ha='center', fontweight='bold')

# Plot 2: Funding
ax2.bar(['Before', 'After'], [-1.2, 1.98], color=['#ff9999', '#99ff99'])
ax2.set_title('Platte County Funding (Surplus/Gap)')
ax2.set_ylabel('Millions USD')
ax2.axhline(0, color='black', linewidth=0.8)
for i, v in enumerate([-1.2, 1.98]):
    ax2.text(i, v + (0.1 if v > 0 else -0.3), f'${v}M', ha='center', fontweight='bold')

plt.tight_layout()
plt.savefig('VICTORY_SUMMARY_20260206.png')
