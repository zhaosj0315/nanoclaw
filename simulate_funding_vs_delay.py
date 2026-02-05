import matplotlib.pyplot as plt
import numpy as np

def simulate_funding_impact():
    # Funding Gap in Millions USD
    funding_gap = np.linspace(0, 50, 100)
    
    # Base delay per shipment (minutes)
    base_delay = 15
    
    # Logistics Delay model: Exponential increase after a certain threshold
    # Threshold: $15M gap (when staffing levels fall below minimum safety requirements)
    delays = base_delay + (funding_gap ** 2) / 10 + np.exp(funding_gap / 12)
    
    # Critical threshold indicators
    critical_threshold = 20 # $20M gap
    catastrophic_threshold = 40 # $40M gap
    
    plt.figure(figsize=(12, 7))
    plt.plot(funding_gap, delays, color='#e74c3c', linewidth=3, label='Estimated Logistics Delay')
    
    # Add zones
    plt.axvspan(0, critical_threshold, color='green', alpha=0.1, label='Manageable Risk')
    plt.axvspan(critical_threshold, catastrophic_threshold, color='orange', alpha=0.1, label='High Risk (Congestion)')
    plt.axvspan(catastrophic_threshold, 50, color='red', alpha=0.1, label='Catastrophic Failure')
    
    # Annotations
    plt.annotate('Staffing Shortage Begins', xy=(critical_threshold, 60), xytext=(25, 100),
                 arrowprops=dict(facecolor='black', shrink=0.05), fontsize=10)
    
    plt.annotate('KCI Perimeter Breach Risk', xy=(catastrophic_threshold, 250), xytext=(30, 350),
                 arrowprops=dict(facecolor='red', shrink=0.05), fontsize=10, color='red')

    plt.title('World Cup Logistics Sensitivity: Security Funding Gap vs. Operational Delay', fontsize=14, fontweight='bold')
    plt.xlabel('Security Funding Gap (Million USD)', fontsize=12)
    plt.ylabel('Average Logistics Delay per Shipment (Minutes)', fontsize=12)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend()
    
    # Save the chart
    plt.savefig('funding_vs_delay_analysis.png', dpi=300, bbox_inches='tight')
    print("Simulation complete. Chart saved as funding_vs_delay_analysis.png")

if __name__ == "__main__":
    simulate_funding_impact()
