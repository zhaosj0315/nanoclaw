import matplotlib.pyplot as plt
import matplotlib.patches as patches

def draw_flowchart():
    fig, ax = plt.subplots(figsize=(12, 8))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis('off')

    # Define boxes
    boxes = [
        {"text": "INPUT:\nIndustrial Steamer Stack\n(Raw Visual Data)", "pos": (1, 8), "color": "#E3F2FD"},
        {"text": "ANALYSIS:\nMaterial Detection\n(Polished Stainless Steel)", "pos": (4, 8), "color": "#BBDEFB"},
        {"text": "VLM PROCESSING:\nQuantum Heating\nOptimization", "pos": (7, 8), "color": "#90CAF9"},
        {"text": "SIMULATION:\nThermal Density &\nSteam Flow Control", "pos": (7, 5), "color": "#64B5F6"},
        {"text": "HUD OVERLAY:\nReal-time Efficiency\nMetrics (8K)", "pos": (4, 5), "color": "#42A5F5"},
        {"text": "OUTPUT:\nSuper Steamer\nOptimized Visuals", "pos": (1, 5), "color": "#2196F3"},
    ]

    # Draw boxes and arrows
    box_width = 2.2
    box_height = 1.4

    for box in boxes:
        x, y = box["pos"]
        rect = patches.FancyBboxPatch((x - box_width/2, y - box_height/2), box_width, box_height, 
                                     boxstyle="round,pad=0.1", linewidth=2, edgecolor='#1565C0', facecolor=box["color"])
        ax.add_patch(rect)
        ax.text(x, y, box["text"], ha='center', va='center', fontweight='bold', fontsize=9, color='#0D47A1')

    # Draw arrows
    def draw_arrow(start, end):
        ax.annotate('', xy=end, xytext=start,
                    arrowprops=dict(facecolor='#1565C0', shrink=0.05, width=2, headwidth=8))

    draw_arrow((2.1, 8), (2.9, 8))
    draw_arrow((5.1, 8), (5.9, 8))
    draw_arrow((7, 7.3), (7, 5.7))
    draw_arrow((5.9, 5), (5.1, 5))
    draw_arrow((2.9, 5), (2.1, 5))

    plt.title("🐾 NanoClaw: Industrial Steamer Optimization Workflow", fontsize=16, fontweight='bold', pad=20, color='#1A237E')
    plt.savefig('steamer_optimization_workflow.png', dpi=300, bbox_inches='tight')

if __name__ == "__main__":
    draw_flowchart()