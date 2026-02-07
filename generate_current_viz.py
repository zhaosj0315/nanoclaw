import matplotlib.pyplot as plt
import subprocess
import os

def generate():
    try:
        output = subprocess.check_output("du -sk * .[^.]* 2>/dev/null | sort -rn | head -n 15", shell=True).decode()
        data = []
        for line in output.strip().split('\n'):
            parts = line.split('\t')
            if len(parts) != 2: continue
            size, name = parts
            if name in ['.', '..']: continue
            data.append((name, int(size) / 1024)) # MB

        names, sizes = zip(*data)

        plt.figure(figsize=(12, 10))
        bars = plt.barh(names[::-1], sizes[::-1], color='#ff7f0e')
        plt.xlabel('Size (MB)', fontsize=12)
        plt.ylabel('File/Folder', fontsize=12)
        plt.title('Top 15 Items by Size in Nanoclaw Project', fontsize=14, fontweight='bold')
        
        for bar in bars:
            width = bar.get_width()
            plt.text(width + 0.5, bar.get_y() + bar.get_height()/2, f'{width:.2f} MB', va='center')

        plt.grid(axis='x', linestyle='--', alpha=0.7)
        plt.tight_layout()
        plt.savefig('current_dir_sizes_v3.png')
        print("Success: current_dir_sizes_v3.png generated.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    generate()
