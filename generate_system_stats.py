import matplotlib.pyplot as plt

# Data from real system scan (2026-02-06)
# Data Disk: /System/Volumes/Data
disk_used = 1.6 # TiB
disk_free = 0.18 # TiB (185 GiB approx)
mem_used = 35 # GB
mem_free = 0.5 # GB
cpu_usage = 32.08 # user + sys

labels_disk = [f'Used ({disk_used} TiB)', f'Available ({disk_free} TiB)']
sizes_disk = [disk_used, disk_free]

labels_mem = [f'Used ({mem_used} GB)', f'Free ({mem_free} GB)']
sizes_mem = [mem_used, mem_free]

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))

# Data Disk Pie Chart (Targeting the 90% usage volume)
ax1.pie(sizes_disk, labels=labels_disk, autopct='%1.1f%%', startangle=140, colors=['#ff4d4d','#66b3ff'], explode=(0.1, 0))
ax1.set_title('Data Disk Usage (/System/Volumes/Data)\nTotal: 1.8 TiB')

# Memory Pie Chart
ax2.pie(sizes_mem, labels=labels_mem, autopct='%1.1f%%', startangle=140, colors=['#ffcc99','#99ff99'], explode=(0.05, 0))
ax2.set_title('Memory Usage (Total 36 GB)')

title_text = 'System Resource Status (Data Disk Focus) - 2026-02-06\nCPU Usage: ' + str(cpu_usage) + '%'
plt.suptitle(title_text, fontsize=16)
plt.tight_layout()
plt.savefig('system_resource_usage_data_disk.png')