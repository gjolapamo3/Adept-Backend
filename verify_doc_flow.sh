#!/bin/bash
echo "=== Attempting to follow documented flow ==="
echo ""
echo "Documentation says to run: NODE_ENV=test npm start"
echo ""
echo "Starting in background..."
NODE_ENV=test npm start > /tmp/server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

sleep 3

echo ""
echo "Checking if server is listening on port 5000..."
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✓ Server IS listening on port 5000"
else
    echo "✗ Server is NOT listening on port 5000"
fi

echo ""
echo "Checking server.log output:"
cat /tmp/server.log

echo ""
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
