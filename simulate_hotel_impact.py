import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Simulation Parameters
visitors = 120000
stay_duration = 3  # nights
kci_area_capture_rate = 0.45  # 45% of visitors stay near the gateway
daily_hotel_rate = 180  # Average night rate during World Cup
elasticity = -0.15  # Demand elasticity (conservative for mega-events)

surcharge_levels = np.arange(0, 21, 1)  # $0 to $20 surcharge

results = []

for s in surcharge_levels:
    total_nights = visitors * stay_duration * kci_area_capture_rate
    # Impact on demand (Occupancy change)
    price_increase_pct = s / daily_hotel_rate
    demand_change_pct = price_increase_pct * elasticity
    
    actual_nights = total_nights * (1 + demand_change_pct)
    revenue_from_surcharge = actual_nights * s
    hotel_revenue_loss = (total_nights - actual_nights) * daily_hotel_rate
    
    results.append({
        'Surcharge': s,
        'Tax_Revenue': revenue_from_surcharge,
        'Hotel_Impact': hotel_revenue_loss,
        'Net_Benefit': revenue_from_surcharge - hotel_revenue_loss
    })

df = pd.DataFrame(results)

# Plotting
fig, ax1 = plt.subplots(figsize=(10, 6))

ax1.set_xlabel('Surcharge per Night ($)')
ax1.set_ylabel('Tax Revenue ($)', color='tab:blue')
ax1.plot(df['Surcharge'], df['Tax_Revenue'], color='tab:blue', linewidth=3, label='Estimated Tax Revenue')
ax1.axhline(y=1200000, color='r', linestyle='--', label='Target: $1.2M Gap')
ax1.tick_params(axis='y', labelcolor='tab:blue')

ax2 = ax1.twinx()
ax2.set_ylabel('Hotel Revenue Impact ($)', color='tab:red')
ax2.bar(df['Surcharge'], df['Hotel_Impact'], alpha=0.3, color='tab:red', label='Hotel Revenue Displacement')
ax2.tick_params(axis='y', labelcolor='tab:red')

plt.title('Economic Impact of Gateway Surcharge (Platte County / KCI)')
fig.tight_layout()
plt.savefig('hotel_impact_chart.png')

# Summary Report
optimal_surcharge = df[df['Tax_Revenue'] >= 1200000]['Surcharge'].min()
print(f"Optimal Surcharge to cover $1.2M: ${optimal_surcharge}")
print(f"Max Revenue: ${df['Tax_Revenue'].max():,.2f}")
