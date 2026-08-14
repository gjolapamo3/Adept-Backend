# Adept-Backend

The API requires a MongoDB connection string in `MONGODB_URI`. Configure this environment variable locally and in the Render web service before using `/api/auth/register` or `/api/auth/login`.

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

Then re-run your curl payload against either local webhook endpoint:

- `http://localhost:5000/api/v1/payments/monnify-webhook`
- `http://localhost:5000/api/v1/monnify/webhook`

In test mode, the app bypasses Atlas-backed order processing, seeds the in-memory telemetry store, and pushes the live update straight into the `/dashboard/live` SSE-driven experience.