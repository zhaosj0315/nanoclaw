import matplotlib.pyplot as plt
import numpy as np

def simulate_i29_burst_test():
    hours = np.linspace(8, 24, 200)
    
    # Baseline WC traffic
    wc_traffic = 60 + 20 * np.sin((hours - 19) * np.pi / 6)**2
    
    # "Burst Event": VIP Arrival at 14:00 (Hour 14)
    # Adds a sudden spike of 150 vehicles/min
    burst = 150 * np.exp(-(hours - 14.5)**2 / 0.05)
    total_raw_traffic = wc_traffic + burst
    
    # AI Reaction: Detected in 2 minutes, triggers "Burst Mode"
    # Burst Mode redirects 80% of non-essential traffic instantly
    ai_reaction = total_raw_traffic.copy()
    # Mask for burst period
    is_burst = (hours > 14.3) & (hours < 15.5)
    ai_reaction[is_burst] = wc_traffic[is_burst] * 0.5 + burst[is_burst] * 0.2
    
    # Non-burst period use normal AI diversion
    ai_reaction[~is_burst] = ai_reaction[~is_burst] * 0.65
    
    plt.figure(figsize=(12, 7))
    plt.plot(hours, total_raw_traffic, 'r--', label='Traffic with Burst (No AI)', alpha=0.5)
    plt.plot(hours, ai_reaction, 'g-', label='AI Burst Response (Diversion Active)', linewidth=2.5)
    plt.fill_between(hours, ai_reaction, total_raw_traffic, color='green', alpha=0.1, label='Traffic Diverted')
    
    plt.axvline(x=14.5, color='orange', linestyle='--', label='VIP Arrival Detected')
    plt.text(14.6, 200, 'AI Burst Mode Engaged', color='orange', fontweight='bold')
    
    plt.title('I-29 Stress Test: VIP "Burst Event" Response Analysis', fontsize=14)
    plt.xlabel('Hour of Day', fontsize=12)
    plt.ylabel('Vehicle Density / Delay Factor', fontsize=12)
    plt.legend()
    plt.grid(True, linestyle=':', alpha=0.6)
    
    plt.savefig('i29_ai_stress_test.png')
    
    print("Stress Test Success: i29_ai_stress_test.png generated.")
    # Calculate recovery time
    try:
        recovery_idx = np.where((hours > 15) & (ai_reaction < 70))[0][0]
        recovery_time = hours[recovery_idx]
        print(f"System recovered to normal flow by: {recovery_time:.2f}")
    except IndexError:
        print("System still recovering at end of simulation.")

if __name__ == "__main__":
    simulate_i29_burst_test()
