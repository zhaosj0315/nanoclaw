import os
import platform
import datetime

def run_check():
    print(f"--- NanoClaw Diagnostic ---")
    print(f"Time: {datetime.datetime.now()}")
    print(f"System: {platform.system()} {platform.release()}")
    print(f"Arch: {platform.machine()}")
    print(f"CWD: {os.getcwd()}")
    
    # Check for docker
    docker_check = os.system("docker --version > /dev/null 2>&1")
    print(f"Docker: {'Available' if docker_check == 0 else 'Not Found'}")

if __name__ == '__main__':
    run_check()