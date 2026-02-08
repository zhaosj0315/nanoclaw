import sqlite3
import uuid
from datetime import datetime
import os

db_path = "data/nanoclaw.db"

def setup_task():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    task_id = str(uuid.uuid4())
    group_folder = "main" # Assuming main group
    chat_jid = "8617600663150@s.whatsapp.net" # Primary JID from recent logs
    prompt = "🐾 每日GDP监测报告: [SHELL: python3 nanoclaw-lab/gdp_crawler.py CHN] 根据抓取到的数据，为我生成一份详细的Markdown日报。直接输出报告内容，不要包含中间过程。"
    schedule_type = "cron"
    schedule_value = "0 9 * * *" # Daily at 9:00 AM
    context_mode = "isolated"
    status = "active"
    created_at = datetime.now().toISOString() if hasattr(datetime.now(), 'toISOString') else datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
    
    # Calculate next run (simplified for script, the scheduler will recalculate)
    next_run = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
    
    try:
        cursor.execute("""
            INSERT INTO tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (task_id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at))
        conn.commit()
        print(f"Task created with ID: {task_id}")
    except Exception as e:
        print(f"Error creating task: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    setup_task()
