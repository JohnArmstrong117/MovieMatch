# Edge Functions Setup Guide

## Starting Edge Functions Server

Edge Functions must be running separately from your main Supabase instance for your app to work.

### Option 1: Manual Start (Recommended for Development)

1. **Open a new terminal window**
2. Navigate to your project root:
   ```powershell
   cd C:\Users\lasth\SoftwareDevProjects\MovieMatch
   ```
3. Start the Edge Functions server:
   ```powershell
   supabase functions serve
   ```
4. **Keep this terminal open** - the server will run until you press `Ctrl+C`

### Option 2: Using the Helper Script

Run the PowerShell script:
```powershell
.\supabase\start-functions.ps1
```

## Verifying Edge Functions Are Running

### Quick Test

Open PowerShell and run:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:54321/functions/v1/feed_movies" -Method Get
```

- **If it works**: You'll see a response (or error about auth, which is expected)
- **If it fails**: You'll see a connection error, meaning the server isn't running

### Check via Supabase Status

```powershell
supabase status
```

Look for the Edge Runtime service - it should show as running.

## Environment Variables

The Edge Functions need access to:
- `TMDB_API_KEY` - Set in `supabase/functions/.env` file
- Supabase URL and keys - Automatically available when running locally

Make sure `supabase/functions/.env` exists with:
```
TMDB_API_KEY=your_tmdb_api_key_here
```

## Troubleshooting

### "Unable to connect to remote server" Error

**Solution**: Start the Edge Functions server:
```powershell
supabase functions serve
```

### "TMDB_API_KEY not configured" Error

**Solution**: 
1. Make sure `supabase/functions/.env` exists
2. Add `TMDB_API_KEY=your_key_here`
3. Restart Supabase: `supabase stop && supabase start`
4. Restart Edge Functions server

### Edge Functions Not Hot-Reloading

**Solution**: Restart the Edge Functions server after making code changes:
```powershell
# Press Ctrl+C to stop, then:
supabase functions serve
```

## Running Multiple Services

You need **three terminals** running simultaneously:

1. **Terminal 1**: Supabase (usually auto-starts)
   ```powershell
   supabase start  # Run once, keeps running
   ```

2. **Terminal 2**: Edge Functions (MUST be running)
   ```powershell
   supabase functions serve
   ```

3. **Terminal 3**: Your Expo app
   ```powershell
   cd app
   npm start
   ```

## Production Deployment

When deploying to production, Edge Functions are automatically served by Supabase's platform. You don't need to run `supabase functions serve` in production.
