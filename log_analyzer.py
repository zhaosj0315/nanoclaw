import os
import glob
import re
from datetime import datetime

def analyze_system_logs(log_dir="logs"):
    print(f"[*] Initializing NanoClaw Self-Analysis Protocol at {datetime.now()}")
    if not os.path.exists(log_dir):
        print(f"[!] Log directory '{log_dir}' not found. Creating empty summary.")
        os.makedirs(log_dir, exist_ok=True)
    
    log_files = glob.glob(os.path.join(log_dir, "*.log"))
    
    summary = {
        "total_events": 0,
        "errors": 0,
        "warnings": 0,
        "task_completions": 0
    }

    for log_file in log_files:
        try:
            with open(log_file, 'r') as f:
                content = f.read()
                summary["total_events"] += len(re.findall(r"INFO", content))
                summary["errors"] += len(re.findall(r"ERROR", content))
                summary["warnings"] += len(re.findall(r"WARN", content))
                summary["task_completions"] += len(re.findall(r"completed", content))
        except Exception as e:
            print(f"[!] Error reading {log_file}: {e}")

    print(f"\n[📊 TACTICAL SUMMARY]")
    print(f">> Total Events: {summary['total_events']}")
    print(f">> Critical Errors: {summary['errors']}")
    print(f">> Warnings: {summary['warnings']}")
    print(f">> Task Completions: {summary['task_completions']}")

if __name__ == "__main__":
    analyze_system_logs()
