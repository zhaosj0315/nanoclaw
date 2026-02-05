import matplotlib.pyplot as plt
import numpy as np

# Simulation: Security Funding vs. Logistic Delay at KCI Airport
funding_levels = np.linspace(50, 100, 10) # 50% to 100% of requested budget
# Logarithmic or exponential delay increase as funding drops
base_delay = 15 # minutes
delay = base_delay + (100 - funding_levels)**1.5 / 5

plt.figure(figsize=(10, 6))
plt.plot(funding_levels[::-1], delay, 'r-s', linewidth=2, label='Estimated Arrival Delay')
plt.axvline(x=70, color='orange', linestyle='--', label='Projected Budget Cut Point (~70%)')
plt.text(71, 40, 'KSHB-TV Reported Risk Zone', color='orange', fontweight='bold')

plt.title('Impact Analysis: Security Funding Gap vs. KCI Logistic Delays', fontsize=14)
plt.xlabel('Security Funding Level (% of Requirement)', fontsize=12)
plt.ylabel('Average Processing Delay (Minutes)', fontsize=12)
plt.gca().invert_xaxis() # Higher funding on the left
plt.grid(True, linestyle='--', alpha=0.7)
plt.legend()

plt.tight_layout()
plt.savefig('kci_logistics_delay_impact.png')
print("Simulation completed: kci_logistics_delay_impact.png")
