import os
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

def get_size(path):
    total_size = 0
    try:
        if os.path.isfile(path):
            total_size = os.path.getsize(path)
        elif os.path.isdir(path):
            for dirpath, dirnames, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    if not os.path.islink(fp):
                        total_size += os.path.getsize(fp)
    except Exception:
        pass
    return total_size

items = []
# Scan current directory
for entry in os.listdir('.'):
    # Optional: skip hidden files if desired, but user asked for "files in current directory"
    # listing everything is safer.
    if entry == 'current_dir_sizes.png': continue # Don't include the output file itself if it exists
    
    size = get_size(entry)
    is_dir = os.path.isdir(entry)
    items.append({'name': entry, 'size': size, 'is_dir': is_dir})

# Sort by size desc
items.sort(key=lambda x: x['size'], reverse=True)

# Print for CLI output (Top 25)
print("TOP_FILES_START")
for item in items[:25]:
    size_str = f"{item['size']/1024:.1f} KB"
    if item['size'] > 1024*1024:
        size_str = f"{item['size']/(1024*1024):.1f} MB"
    type_str = "📁" if item['is_dir'] else "📄"
    print(f"{type_str} {item['name']} ({size_str})")
print("TOP_FILES_END")

# Generate Chart
# We will chart top 15 for clarity
top_items = items[:15]
names = [x['name'] for x in top_items]
sizes_kb = [x['size']/1024 for x in top_items]
colors = ['#ffcc00' if x['is_dir'] else '#4d94ff' for x in top_items] # Yellow for folders, Blue for files

plt.figure(figsize=(10, 6))
bars = plt.barh(names, sizes_kb, color=colors)
plt.xlabel('Size (KB)')
plt.title('Top 15 Files/Folders by Size')
plt.gca().invert_yaxis() # Largest on top

# Add value labels
for bar in bars:
    width = bar.get_width()
    label_x_pos = width + (max(sizes_kb)*0.01)
    plt.text(label_x_pos, bar.get_y() + bar.get_height()/2, f'{width:.1f} KB', va='center')

# Legend
folder_patch = mpatches.Patch(color='#ffcc00', label='Folder')
file_patch = mpatches.Patch(color='#4d94ff', label='File')
plt.legend(handles=[folder_patch, file_patch])

plt.tight_layout()
plt.savefig('current_dir_sizes.png')
