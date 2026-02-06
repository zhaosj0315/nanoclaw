import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import sys
import os

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

# Setup plot
plt.figure(figsize=(12, 8))

bars = plt.bar(districts, gdp_values, color='skyblue', edgecolor='navy')

# Add values on top of bars
for bar in bars:
    yval = bar.get_height()
    plt.text(bar.get_x() + bar.get_width()/2, yval + 50, round(yval, 1), ha='center', va='bottom', fontsize=10)

plt.xlabel('区域')
plt.ylabel('GDP (亿元)')
plt.title('2024年北京各区GDP排名情况')
plt.xticks(rotation=45)
plt.grid(axis='y', linestyle='--', alpha=0.7)
plt.tight_layout()

# Save
output_path = 'beijing_gdp_2024_cn.png'
plt.savefig(output_path, dpi=300)
print(f"Chart saved to {output_path}")
