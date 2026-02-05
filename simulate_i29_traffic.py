
import matplotlib.pyplot as plt
import numpy as np

def simulate_i29_traffic():
    # Simulation parameters
    hours = np.linspace(8, 24, 100)  # 8 AM to Midnight
    
    # Baseline traffic (normal day)
    baseline_traffic = 20 + 10 * np.sin((hours - 17) * np.pi / 4)**2  # Peak at 5 PM
    
    # World Cup Day traffic (no intervention)
    # Adds random bursts and high constant load
    wc_traffic = baseline_traffic * 3 + 15 * np.exp(-(hours - 19)**2 / 2)  # Huge peak around match time
    
    # AI Diversion Strategy (Intervention)
    # Diverts 40% of non-essential vehicles to secondary routes (Hwy 169, Hwy 71)
    intervention_traffic = wc_traffic.copy()
    # Reduction is more effective at peak
    intervention_traffic = intervention_traffic * (0.6 + 0.1 * np.cos((hours - 19) * np.pi / 6))
    
    # Shuttle Priority Lane (effectively caps travel time for shuttles)
    shuttle_time = np.minimum(intervention_traffic, 40) # Shuttles use priority lanes
    
    plt.figure(figsize=(12, 7))
    plt.plot(hours, baseline_traffic, label='Normal Traffic (Baseline)', linestyle='--', color='gray')
    plt.plot(hours, wc_traffic, label='World Cup Traffic (No Action)', color='red', linewidth=2)
    plt.plot(hours, intervention_traffic, label='With AI Diversion (General Flow)', color='orange')
    plt.plot(hours, shuttle_time, label='Shuttle Travel Time (Priority)', color='green', linewidth=3)
    
    plt.axhline(y=45, color='black', linestyle=':', label='Max Acceptable Delay (45m)')
    plt.fill_between(hours, 45, wc_traffic, where=(wc_traffic > 45), color='red', alpha=0.1)
    
    plt.title('I-29 Corridor Traffic Simulation: KCI to Stadium (FIFA 2026)', fontsize=14)
    plt.xlabel('Hour of Day', fontsize=12)
    plt.ylabel('Travel Time (Minutes)', fontsize=12)
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.savefig('i29_traffic_simulation.png')
    print("Simulation complete. Image saved as i29_traffic_simulation.png")
    
    # Calculate stats
    avg_wc = np.mean(wc_traffic)
    avg_int = np.mean(shuttle_time)
    improvement = (avg_wc - avg_int) / avg_wc * 100
    
    print(f"Average WC Travel Time: {avg_wc:.1f} min")
    print(f"Average Shuttle Time (AI): {avg_int:.1f} min")
    print(f"Efficiency Improvement: {improvement:.1f}%")

if __name__ == "__main__":
    simulate_i29_traffic()
