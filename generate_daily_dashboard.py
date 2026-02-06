import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np

# Set style
plt.style.use('dark_background')
fig = plt.figure(figsize=(14, 8))
gs = gridspec.GridSpec(2, 2, height_ratios=[1, 1])

# Colors
c_primary = '#00ff9d'  # Green for success
c_secondary = '#00a8ff' # Blue for tech
c_warning = '#ffaa00'
c_bg = '#1e1e1e'

# 1. Financial Lock (Bar Chart)
ax1 = plt.subplot(gs[0, 0])
items = ['Funding Gap', 'Surcharge Surplus']
values = [1.2, 3.18]
colors = [c_warning, c_primary]
bars = ax1.barh(items, values, color=colors, height=0.5)
ax1.set_xlim(0, 4)
ax1.set_xlabel('Amount (Million USD)')
ax1.set_title('🏆 Platte County Financial Victory', fontsize=12, pad=10, color='white')
ax1.bar_label(bars, fmt='$%.2fM', padding=5, color='white')
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)

# 2. Beijing Tech Latency (Gauge-like Bar)
ax2 = plt.subplot(gs[0, 1])
latency_target = 2.0
latency_actual = 1.2
ax2.barh(['Latency (ms)'], [latency_target], color='#333333', label='Max Threshold')
ax2.barh(['Latency (ms)'], [latency_actual], color=c_secondary, label='Actual (Ali-Cluster)')
ax2.set_xlim(0, 3)
ax2.set_title('⚡ Beijing AI Infrastructure Performance', fontsize=12, pad=10, color='white')
ax2.text(latency_actual + 0.1, 0, '1.2ms (Excellent)', va='center', color=c_secondary, fontweight='bold')
ax2.legend(loc='upper right', frameon=False)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)

# 3. Site A Recovery Curve (Line Chart)
ax3 = plt.subplot(gs[1, :])
hours = np.array([0, 12, 24, 36, 48])
readiness = np.array([92, 94.5, 97, 99, 100])
ax3.plot(hours, readiness, marker='o', color=c_primary, linewidth=2, label='Concrete Supply Readiness')
ax3.fill_between(hours, readiness, 90, color=c_primary, alpha=0.1)
ax3.set_ylim(90, 105)
ax3.set_xlabel('Hours from Now')
ax3.set_ylabel('Readiness (%)')
ax3.set_title('🏗️ Site A Construction Recovery Trajectory', fontsize=12, pad=10, color='white')
for i, txt in enumerate(readiness):
    ax3.annotate(f'{txt}%', (hours[i], readiness[i]), textcoords="offset points", xytext=(0,10), ha='center', color='white')
ax3.grid(True, linestyle='--', alpha=0.2)
ax3.spines['top'].set_visible(False)
ax3.spines['right'].set_visible(False)

plt.tight_layout()
output_path = 'daily_dashboard_20260206.png'
plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=c_bg)
print(output_path)
