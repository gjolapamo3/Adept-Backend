# Adept-Backend

## Test Telemetry In-Memory (No Atlas Credentials Needed)

If you just want to test the webhook logic, telemetry ingestion, and SSE live stream without touching Atlas credentials locally, start the app in test mode:

```bash
NODE_ENV=test npm start
```

Then exercise the in-memory endpoints locally:

- Open `/dashboard/live` for the dashboard UI
- Connect to `/api/v1/marketplace/events` for the SSE feed
- POST to `/api/v1/monnify/webhook` to seed transaction telemetry
- POST to `/api/v1/ussd/webhook` to seed RFQ telemetry