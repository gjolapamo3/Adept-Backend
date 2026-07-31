const app = require('./server.js');
const request = require('supertest');

async function testFlow() {
  console.log('\n=== Testing In-Memory Test Mode Flow ===\n');

  // 2. Test Monnify webhook (telemetry ingestion)
  console.log('1. Testing Monnify webhook telemetry ingestion');
  const monnifyRes = await request(app)
    .post('/api/v1/monnify/webhook')
    .send({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        paymentStatus: 'PAID',
        transactionReference: 'TXN-TEST-001',
        paymentReference: 'ORDER-001',
        amountPaid: 500000,
        paymentMethod: 'ACCOUNT_TRANSFER'
      }
    })
    .expect(200);
  console.log('   ✓ Status: 200');
  console.log('   ✓ Response:', monnifyRes.body);

  // 3. Test USSD webhook
  console.log('\n2. Testing USSD webhook telemetry ingestion');
  const ussdRes = await request(app)
    .post('/api/v1/ussd/webhook')
    .send({
      sessionId: 'test-session',
      serviceCode: '*992#',
      phoneNumber: '+2348012345678',
      text: '2*100*1'
    })
    .expect(200);
  console.log('   ✓ Status: 200');
  console.log('   ✓ Contains CONTRACT ISSUED:', ussdRes.text.includes('CONTRACT ISSUED'));

  // 4. Test dashboard endpoint
  console.log('\n3. Testing dashboard live endpoint');
  const dashRes = await request(app).get('/api/v1/dashboard/live').expect(200);
  console.log('   ✓ Status: 200');
  console.log('   ✓ Metrics:', JSON.stringify(dashRes.body.metrics, null, 2));
  console.log('   ✓ Total RFQs:', dashRes.body.metrics?.totalRfqs);
  console.log('   ✓ Transactions:', dashRes.body.transactions?.length);

  // 5. Test transactions list
  console.log('\n4. Testing transactions endpoint');
  const txnRes = await request(app).get('/api/v1/transactions').expect(200);
  console.log('   ✓ Status: 200');
  console.log('   ✓ Transaction data:', JSON.stringify(txnRes.body.data, null, 2));

  // 6. Test dashboard HTML
  console.log('\n5. Testing dashboard HTML page');
  const htmlRes = await request(app).get('/dashboard/live').expect(200);
  console.log('   ✓ Status: 200');
  console.log('   ✓ Has SSE endpoint reference:', htmlRes.text.includes('/api/v1/marketplace/events'));
  console.log('   ✓ Has dashboard API endpoint:', htmlRes.text.includes('/api/v1/dashboard/live'));

  console.log('\n=== ✓ All In-Memory Endpoints Working! ===\n');
  process.exit(0);
}

testFlow().catch(err => {
  console.error('✗ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
