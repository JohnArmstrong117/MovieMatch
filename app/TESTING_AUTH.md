# Testing Auth & Session Persistence

## Prerequisites

1. **Start Supabase locally** (if not already running):
   ```bash
   supabase start
   ```
   
   This will start the local Supabase instance at `http://127.0.0.1:54321`

2. **Start the Expo app**:
   ```bash
   cd app
   npm start
   ```

## Testing Steps

### 1. Test Sign Up
1. Open the app - you should be redirected to the login screen
2. Tap "Sign Up" to create a new account
3. Fill in:
   - Full Name: Test User
   - Email: test@example.com
   - Password: test123456
   - Confirm Password: test123456
4. Tap "Sign Up"
5. You should see a success message and be redirected to login

### 2. Test Sign In
1. On the login screen, enter:
   - Email: test@example.com
   - Password: test123456
2. Tap "Login"
3. You should be redirected to the home screen (tabs)

### 3. Test Session Persistence
1. After logging in, you should see the home screen with:
   - Auth Status showing your email and user ID
   - Test buttons for checking persistence
2. Tap "Test Session Persistence" - should show active session
3. Tap "Check Stored Session" - should show stored session data
4. **Close the app completely** (not just minimize)
5. **Reopen the app**
6. You should still be logged in automatically (session persisted!)
7. The home screen should show your auth status without needing to log in again

### 4. Test Sign Out
1. On the home screen, tap "Sign Out"
2. You should be redirected back to the login screen
3. Try to navigate back - you should be blocked from accessing authenticated routes

### 5. Test Auto-Refresh (Advanced)
1. Log in to the app
2. Wait for the session to be active
3. The tokens should automatically refresh in the background
4. Check the session expiration time in the test buttons
5. The session should remain active even after token refresh

## What to Verify

✅ **Sign Up** - Creates account successfully
✅ **Sign In** - Logs in and redirects to home
✅ **Session Persistence** - Session survives app restart
✅ **Auth Gate** - Blocks unauthenticated access
✅ **Sign Out** - Clears session and redirects to login
✅ **Auto-Refresh** - Tokens refresh automatically

## Troubleshooting

### Supabase not running
- Error: "Failed to connect to Supabase"
- Solution: Run `supabase start` in the project root

### Session not persisting
- Check if AsyncStorage is working
- Use "Check Stored Session" button to verify
- Make sure you're completely closing and reopening the app

### Can't sign up
- Check Supabase logs: `supabase logs`
- Verify email confirmation is disabled for local dev
- Check if user already exists

## Debug Information

The app includes debug information on:
- **Login Screen**: Shows Supabase URL being used
- **Home Screen**: Shows current auth status, user info, and test buttons

Use these to verify everything is working correctly!


