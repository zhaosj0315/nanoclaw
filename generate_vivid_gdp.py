import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np

# Set font for Chinese display (macOS default)
plt.rcParams['font.sans-serif'] = ['Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False

# Data for Beijing District GDP 2024 (in 100 million RMB)
data = {
    "海淀区": 12907.1,
    "朝阳区": 9230.1,
    "西城区": 6038.0,
    "大兴区": 4984.1,
    "东城区": 3808.7,
    "丰台区": 2493.9,
    "顺义区": 2388.3,
    "昌平区": 1811.9,
    "通州区": 1508.1,
    "石景山区": 1312.9,
    "房山区": 948.9,
    "平谷区": 570.5,
    "怀柔区": 564.5,
    "密云区": 457.1,
    "门头沟区": 304.4,
    "延庆区": 253.0
}

# Sort data
sorted_data = dict(sorted(data.items(), key=lambda item: item[1], reverse=True))
districts = list(sorted_data.keys())
gdp_values = list(sorted_data.values())

# Styling
plt.style.use('dark_background')
fig, ax = plt.subplots(figsize=(14, 8))
fig.patch.set_facecolor('#0B0E14')
ax.set_facecolor('#0B0E14')

# Gradient colors
colors = plt.cm.viridis(np.linspace(0.3, 0.9, len(districts)))

# Plot
bars = ax.bar(districts, gdp_values, color=colors, edgecolor='white', linewidth=0.5, alpha=0.9)

# Add values on top with glow-like effect
for bar in bars:
    yval = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, yval + 200, f'{yval/1000:.1f}k', 
            ha='center', va='bottom', fontsize=11, color='cyan', fontweight='bold')

# Labels and Titles
ax.set_xlabel('行政区划', fontsize=12, color='#A0A0A0', labelpad=15)
ax.set_ylabel('GDP (亿元)', fontsize=12, color='#A0A0A0', labelpad=15)
ax.set_title('2024 BEIJING DISTRICT GDP LANDSCAPE', fontsize=22, pad=30, color='white', fontweight='bold', fontname='Arial')
plt.suptitle('北京市各区生产总值：海淀领跑，梯度分明', y=0.92, fontsize=14, color='cyan', fontname='Arial Unicode MS')

# Clean up axes
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#404040')
ax.spines['bottom'].set_color('#404040')
ax.tick_params(axis='x', rotation=45, colors='#E0E0E0', labelsize=10)
ax.tick_params(axis='y', colors='#E0E0E0')

# Grid
ax.yaxis.grid(True, linestyle='--', which='major', color='#303030', alpha=0.5)

plt.tight_layout(rect=[0, 0.03, 1, 0.95])

# Save
output_path = 'beijing_gdp_2024_vivid.png'
plt.savefig(output_path, dpi=300, facecolor=fig.get_facecolor())
print(f"Vivid chart saved to {output_path}")