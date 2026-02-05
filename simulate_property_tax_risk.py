import matplotlib.pyplot as plt
import numpy as np

# Data for Property Tax Risk Simulation
scenarios = ['Full Funding', 'Partial ($4)', 'Rejection']
infrastructure_shortfall = [0, 7.1, 14.2] # Million USD
property_tax_hike_percent = [0, 8.5, 25.4] # Estimated % increase

# Create visualization
fig, ax1 = plt.subplots(figsize=(10, 6))

color = 'tab:red'
ax1.set_xlabel('Budget Scenarios (Platte County Hearing)')
ax1.set_ylabel('Funding Gap (Million $)', color=color)
bars = ax1.bar(scenarios, infrastructure_shortfall, color=['green', 'orange', 'red'], alpha=0.6)
ax1.tick_params(axis='y', labelcolor=color)

ax2 = ax1.twinx()
color = 'tab:blue'
ax2.set_ylabel('Est. Property Tax Hike (%)', color=color)
ax2.plot(scenarios, property_tax_hike_percent, color=color, marker='o', linewidth=3, markersize=10)
ax2.tick_params(axis='y', labelcolor=color)

for i, txt in enumerate(property_tax_hike_percent):
    ax2.annotate(f'+{txt}%', (scenarios[i], property_tax_hike_percent[i]), textcoords="offset points", xytext=(0,10), ha='center', fontweight='bold')

plt.title('Platte County: The Cost of "Short-Sighted" Budgeting\n(Infrastructure Default vs. Homeowner Tax Risk)')
fig.tight_layout()

plt.savefig('property_tax_risk_chart.png')
print("Chart generated: property_tax_risk_chart.png")