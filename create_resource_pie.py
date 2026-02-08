import matplotlib.pyplot as plt

# CPU data
cpu_labels = ['User', 'System', 'Idle']
cpu_sizes = [10.76, 12.46, 76.76]
cpu_colors = ['#ff9999','#66b3ff','#99ff99']

# Memory data
# 34GB used, 1.1GB unused
mem_labels = ['Used', 'Unused']
mem_sizes = [34, 1.1]
mem_colors = ['#ffcc99','#c2c2f0']

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))

# CPU Pie
ax1.pie(cpu_sizes, labels=cpu_labels, autopct='%1.1f%%', startangle=140, colors=cpu_colors)
ax1.set_title('CPU Usage')

# Memory Pie
ax2.pie(mem_sizes, labels=mem_labels, autopct='%1.1f%%', startangle=140, colors=mem_colors)
ax2.set_title('Memory Usage (Total ~35.1GB)')

plt.tight_layout()
plt.savefig('system_resource_usage.png')
