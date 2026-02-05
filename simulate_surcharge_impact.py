import matplotlib.pyplot as plt
import numpy as np

# Data
scenarios = ['Baseline (No Action)', 'Hospitality Fee Only', 'Hosp. + Gateway Fee', 'Fees + VC Savings']
gap_remaining = [20.0, 11.2, 7.2, 2.2]  # In Millions USD
colors = ['#FF4C4C', '#FF9F40', '#FFCD56', '#4BC0C0']  # Red, Orange, Yellow, Teal

# Plot
plt.figure(figsize=(10, 6))
bars = plt.bar(scenarios, gap_remaining, color=colors)

# Labels
plt.title('Impact of Secure Gateway Initiative on Funding Gap', fontsize=16, fontweight='bold')
plt.ylabel('Remaining Funding Gap ($ Millions)', fontsize=12)
plt.axhline(y=5.0, color='gray', linestyle='--', alpha=0.7, label='Safety Threshold ($5M)')
plt.grid(axis='y', linestyle='--', alpha=0.3)

# Value annotations
for bar in bars:
    height = bar.get_height()
    plt.text(bar.get_x() + bar.get_width()/2., height + 0.5,
             f'${height}M',
             ha='center', va='bottom', fontsize=12, fontweight='bold')

plt.legend()
plt.tight_layout()
plt.savefig('surcharge_impact_chart.png')
print("Chart generated: surcharge_impact_chart.png")
