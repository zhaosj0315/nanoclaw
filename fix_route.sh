#!/bin/bash
echo "🔧 Applying route fix for Backup Server (10.0.0.5)..."
echo "Targeting Interface: utun4 (198.18.0.1)"
sudo route add -net 10.0.0.0/8 -interface utun4
echo "✅ Route command executed. Please verify connectivity with: ping -c 3 10.0.0.5"
