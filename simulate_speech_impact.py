
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# Data
stages = ['Base Probability', 'Pathos Injection', 'Risk Mitigation', 'Ethos Alignment']
probabilities = [57.2, 69.2, 74.2, 77.7]
gains = [0, 12.0, 5.0, 3.5]

# Create the waterfall chart data
df = pd.DataFrame({'Stage': stages, 'Probability': probabilities, 'Gain': gains})

fig, ax = plt.subplots(figsize=(10, 6))

# Plotting
bars = ax.bar(stages, df['Probability'], color=['#95a5a6', '#e74c3c', '#f1c40f', '#2ecc71'])
ax.set_ylim(0, 100)
ax.set_title('Platte County Hearing Approval Probability Impact', fontsize=16, fontweight='bold')
ax.set_ylabel('Approval Probability (%)')

# Add trend line
ax.plot(stages, probabilities, color='black', marker='o', linestyle='--', linewidth=1)

# Annotate bars
for i, rect in enumerate(bars):
    height = rect.get_height()
    gain_text = f"+{gains[i]}%" if gains[i] > 0 else ""
    ax.text(rect.get_x() + rect.get_width()/2., height + 2,
            f'{height:.1f}%',
            ha='center', va='bottom', fontsize=12, fontweight='bold')
    if gain_text:
        ax.text(rect.get_x() + rect.get_width()/2., height - 10,
                gain_text,
                ha='center', va='center', color='white', fontsize=10, fontweight='bold')

# Grid
ax.yaxis.grid(True, linestyle='--', alpha=0.7)

# Save
plt.tight_layout()
plt.savefig('speech_impact_analysis.png')
print("Chart generated: speech_impact_analysis.png")
print(f"Final Projected Approval Probability: {probabilities[-1]}%")
