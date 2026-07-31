#!/bin/bash
echo "=== Complete In-Memory Test Flow Verification ==="
echo ""

# Start server in test mode
NODE_ENV=test npm start > /tmp/test_server.log 2>&1 &
SERVER_PID=$!
echo "Started server with PID: $SERVER_PID"

sleep 3

echo ""
echo "1. Test Dashboard Access (HTTP)"
curl -s http://localhost:5000/dashboard/live | head -c 200
echo "... (HTML truncated)"

echo ""
echo ""
echo "2. Test Dashboard API"
curl -s http://localhost:5000/api/v1/dashboard/live | python3 -m json.tool | head -30

echo ""
echo "3. Test Monnify Webhook (Telemetry Ingestion)"
curl -s -X POST http://localhost:5000/api/v1/monnify/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "SUCCESSFUL_TRANSACTION",
    "eventData": {
      "paymentStatus": "PAID",
      "transactionReference": "TXN-DOC-TEST",
      "paymentReference": "ORDER-DOC-001",
      "amountPaid": 750000,
      "paymentMethod": "ACCOUNT_TRANSFER"
    }
  }' | python3 -m json.tool

echo ""
echo "4. Test USSD Webhook (Telemetry Ingestion)"
curl -s -X POST http://localhost:5000/api/v1/ussd/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "doc-test-session",
    "serviceCode": "*992#",
    "phoneNumber": "+2348012345678",
    "text": "2*100*1"
  }' | head -c 300
echo ""

echo ""
echo "5. Test RFQ List"
curl -s http://localhost:5000/api/v1/rfqs | python3 -m json.tool | head -40

echo ""
echo "6. Test Transactions List"
curl -s http://localhost:5000/api/v1/transactions | python3 -m json.tool

echo ""
echo "=== Test Complete ==="
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
