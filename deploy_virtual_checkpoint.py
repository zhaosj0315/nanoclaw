
import matplotlib.pyplot as plt
import numpy as np

def simulate_virtual_checkpoint():
    # Parameters
    funding_gap_levels = np.linspace(0, 40, 50)  # $0M to $40M gap
    
    # Baseline: Manual Security Processing
    # As funding gap increases, staff decreases, processing capacity drops.
    # Base capacity (fully funded) = 120 vehicles/hour
    # Gap impact: -2 vehicles/hour per $1M gap
    base_capacity = 120
    manual_capacity = np.maximum(20, base_capacity - (funding_gap_levels * 3.5))
    
    # Demand (Peak World Cup Flow)
    demand = 100  # Vehicles/hour needing entry
    
    # Queue Theory Approximation (M/M/1-ish)
    # Wait time explodes as Demand approaches Capacity
    def calculate_wait_time(capacity, demand_load):
        utilization = demand_load / capacity
        # Cap utilization at 0.99 for formula stability, though >1 means infinite queue physically
        utilization = np.minimum(utilization, 0.99)
        # Avg Wait (minutes) = (Utilization / (1 - Utilization)) * ServiceTime
        # Service Time approx 1/Capacity * 60
        service_time = (1 / capacity) * 60
        wait = (utilization / (1 - utilization + 0.001)) * service_time
        
        # Add penalty for over-capacity (queue buildup simulation)
        overload = np.maximum(0, demand_load - capacity)
        wait += overload * 5  # Add 5 mins delay per accumulated vehicle per hour
        return wait

    wait_times_manual = [calculate_wait_time(cap, demand) for cap in manual_capacity]
    
    # Scenario: Virtual Checkpoint (VC)
    # VC takes 40% of the load automatically.
    # VC Capacity is independent of funding (tech deployed), extremely high (e.g., 300/hr)
    vc_load_share = 0.40
    manual_load_share = 0.60
    
    demand_manual_reduced = demand * manual_load_share
    
    # New wait time is max(VC_wait, Manual_wait), usually Manual_wait dominates but is lower
    wait_times_vc = [calculate_wait_time(cap, demand_manual_reduced) for cap in manual_capacity]

    # Plotting
    plt.figure(figsize=(10, 6))
    
    # Plot Manual Baseline
    plt.plot(funding_gap_levels, wait_times_manual, label='Baseline (Manual Screening)', color='red', linewidth=2)
    
    # Plot With VC
    plt.plot(funding_gap_levels, wait_times_vc, label='With Virtual Checkpoint (40% Offload)', color='green', linewidth=2, linestyle='--')
    
    # Thresholds
    plt.axhline(y=60, color='orange', linestyle=':', label='Warning Threshold (60m)')
    plt.axhline(y=180, color='black', linestyle=':', label='Critical Failure (180m)')
    
    # Critical Zone Highlight
    plt.axvspan(20, 40, color='red', alpha=0.05, label='High Risk Zone (>$20M Gap)')

    plt.title('Impact of Virtual Checkpoint on Security Delays vs. Funding Gap', fontsize=12)
    plt.xlabel('Security Funding Gap ($ Millions)', fontsize=10)
    plt.ylabel('Est. Checkpoint Wait Time (Minutes)', fontsize=10)
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    output_file = 'virtual_checkpoint_impact.png'
    plt.savefig(output_file)
    print(f"Simulation complete. Chart saved to {output_file}")
    
    # Analysis
    critical_gap_manual = funding_gap_levels[np.argmax(np.array(wait_times_manual) > 60)]
    print(f"CRITICAL: Without VC, delays exceed 60m at ${critical_gap_manual:.1f}M gap.")
    
    # Check if VC keeps us safe at $20M gap
    idx_20m = np.abs(funding_gap_levels - 20).argmin()
    delay_at_20m_manual = wait_times_manual[idx_20m]
    delay_at_20m_vc = wait_times_vc[idx_20m]
    
    print(f"At $20M Gap - Manual Delay: {delay_at_20m_manual:.0f} min")
    print(f"At $20M Gap - With VC Delay: {delay_at_20m_vc:.0f} min")

if __name__ == "__main__":
    simulate_virtual_checkpoint()
