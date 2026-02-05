import pandas as pd
import datetime

# 1. World Cup 2026 Intelligence
host_cities = [
    {"Country": "USA", "City": "New York/New Jersey", "Stadium": "MetLife Stadium", "Capacity": 87157, "Role": "Final"},
    {"Country": "USA", "City": "Dallas", "Stadium": "AT&T Stadium", "Capacity": 92967, "Role": "Quarter-finals+"},
    {"Country": "USA", "City": "Atlanta", "Stadium": "Mercedes-Benz Stadium", "Capacity": 75000, "Role": "Semi-finals+"},
    {"Country": "USA", "City": "Los Angeles", "Stadium": "SoFi Stadium", "Capacity": 70240, "Role": "Opening Match (USA)"},
    {"Country": "USA", "City": "Kansas City", "Stadium": "Arrowhead Stadium", "Capacity": 76640, "Role": "Quarter-finals+"},
    {"Country": "Mexico", "City": "Mexico City", "Stadium": "Estadio Azteca", "Capacity": 87523, "Role": "Opening Match (Grand)"},
    {"Country": "Canada", "City": "Toronto", "Stadium": "BMO Field", "Capacity": 45736, "Role": "Opening Match (Canada)"}
]
df_wc = pd.DataFrame(host_cities)

# 2. Global News & Strategic Brief Summary
strategic_data = [
    {"Category": "World Cup", "Intelligence": "Opening Match June 11, 2026; Final July 19, 2026. Focus on regional clusters."},
    {"Category": "Global News", "Intelligence": "Search for Nancy Guthrie ongoing; UK PM Keir Starmer apology over Mandelson/Epstein."},
    {"Category": "Geopolitics", "Intelligence": "US-Russia diplomatic maneuvers emerging; shift in public trust across Western demographics."},
    {"Category": "Project Status", "Intelligence": "NanoClaw v2.5 operational; Secure alternative to OpenClaw. WhatsApp re-auth required."}
]
df_intel = pd.DataFrame(strategic_data)

# 3. System Status
system_status = [
    {"Component": "NanoClaw Core", "Status": "Active (v2.5)"},
    {"Component": "WhatsApp Link", "Status": "Disconnected (Re-auth needed)"},
    {"Component": "Knowledge Base", "Status": "Empty (Falling back to Root Docs)"},
    {"Component": "Security Fence", "Status": "Enabled (Strict Path Validation)"}
]
df_status = pd.DataFrame(system_status)

# Save to Excel
filename = f'Knowledge_Base_Summary_{datetime.datetime.now().strftime("%Y%m%d")}.xlsx'
try:
    with pd.ExcelWriter(filename, engine='openpyxl') as writer:
        df_wc.to_excel(writer, sheet_name='WC2026_Hosts', index=False)
        df_intel.to_excel(writer, sheet_name='Strategic_Intel', index=False)
        df_status.to_excel(writer, sheet_name='System_Status', index=False)
    print(f"Report generated: {filename}")
except Exception as e:
    print(f"Error: {e}")