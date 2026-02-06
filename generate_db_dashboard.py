import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import sqlite3
import pandas as pd
import os

# Database path
db_path = 'data/nanoclaw.db'

def get_data():
    conn = sqlite3.connect(db_path)
    # 1. Message Volume by Day
    df_vol = pd.read_sql_query("SELECT substr(timestamp, 1, 10) as day, count(*) as count FROM messages GROUP BY day ORDER BY day DESC LIMIT 10", conn)
    
    # 2. Top Senders
    df_senders = pd.read_sql_query("SELECT COALESCE(sender_name, 'Unknown') as name, count(*) as count FROM messages GROUP BY name ORDER BY count DESC LIMIT 5", conn)
    
    # 3. Memory Categories
    df_mem = pd.read_sql_query("SELECT category, count(*) as count FROM memories GROUP BY category", conn)
    
    # 4. Total Stats
    total_msgs = conn.execute("SELECT count(*) FROM messages").fetchone()[0]
    total_chats = conn.execute("SELECT count(*) FROM chats").fetchone()[0]
    total_tasks = conn.execute("SELECT count(*) FROM tasks").fetchone()[0]
    total_mems = conn.execute("SELECT count(*) FROM memories").fetchone()[0]
    
    conn.close()
    return df_vol, df_senders, df_mem, (total_msgs, total_chats, total_tasks, total_mems)

df_vol, df_senders, df_mem, stats = get_data()

# Styling
plt.style.use('dark_background')
fig = plt.figure(figsize=(15, 10))
gs = gridspec.GridSpec(2, 2, height_ratios=[1, 1])
c_primary = '#00f2ff'  # Cyber Blue
c_secondary = '#7000ff' # Purple
c_accent = '#00ff9d'    # Matrix Green
c_bg = '#0a0a0b'

fig.patch.set_facecolor(c_bg)

# 1. Message Volume (Timeline)
ax1 = plt.subplot(gs[0, 0])
ax1.set_facecolor(c_bg)
if not df_vol.empty:
    df_vol = df_vol.sort_values('day')
    ax1.plot(df_vol['day'], df_vol['count'], marker='o', color=c_primary, linewidth=2, markersize=8)
    ax1.fill_between(df_vol['day'], df_vol['count'], alpha=0.2, color=c_primary)
ax1.set_title('📊 Message Activity (Last 10 Days)', fontsize=14, color='white', pad=20)
ax1.tick_params(axis='x', rotation=45)
ax1.grid(True, linestyle='--', alpha=0.1)

# 2. Top Senders (Bar)
ax2 = plt.subplot(gs[0, 1])
ax2.set_facecolor(c_bg)
bars = ax2.barh(df_senders['name'], df_senders['count'], color=c_secondary)
ax2.set_title('👥 Top Communication Nodes', fontsize=14, color='white', pad=20)
ax2.bar_label(bars, padding=5, color='white')
ax2.invert_yaxis()

# 3. Memory & Knowledge (Pie)
ax3 = plt.subplot(gs[1, 0])
ax3.set_facecolor(c_bg)
if not df_mem.empty:
    ax3.pie(df_mem['count'], labels=df_mem['category'], autopct='%1.1f%%', colors=[c_accent, c_primary, c_secondary], textprops={'color':"w"})
else:
    ax3.text(0.5, 0.5, 'No Memories Yet', ha='center', va='center', color='gray')
ax3.set_title('🧠 Knowledge Base Distribution', fontsize=14, color='white', pad=20)

# 4. System Overview (Infographic)
ax4 = plt.subplot(gs[1, 1])
ax4.set_facecolor(c_bg)
ax4.axis('off')
msg_t, chat_t, task_t, mem_t = stats
overview_text = "TOTAL MESSAGES: {:,}\n\nACTIVE CHATS: {}\n\nSCHEDULED TASKS: {}\n\nSAVED MEMORIES: {}".format(msg_t, chat_t, task_t, mem_t)
ax4.text(0.1, 0.5, overview_text, fontsize=18, color=c_accent, fontweight='bold', va='center', fontfamily='monospace')
ax4.set_title('🛡️ NanoClaw System Status', fontsize=14, color='white', pad=20)

plt.tight_layout()
output_path = 'nanoclaw_db_dashboard_20260206.png'
plt.savefig(output_path, dpi=200, bbox_inches='tight', facecolor=c_bg)
print(f"Dashboard saved to: {output_path}")
