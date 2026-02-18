# Troubleshooting - Swipe Feature Not Showing

## Common Issues

### 1. Icons Not Showing
✅ **Fixed**: Added missing icon mappings (`heart.fill`, `star.fill`, `gear`)

### 2. Tabs Not Appearing
If you don't see the new tabs (Swipe, Matches, Preferences):

1. **Reload the app**:
   - Shake your device
   - Tap "Reload" in Expo Go
   - Or press `r` in the terminal where Expo is running

2. **Clear Metro cache**:
   ```bash
   cd app
   npx expo start --clear
   ```

3. **Restart Expo Go app**:
   - Close Expo Go completely
   - Reopen it
   - Scan the QR code again

### 3. "Setup Required" Screen
If you see "Setup Required" on the Swipe screen:

1. Go to the **Preferences** tab
2. Select at least one streaming service
3. Select at least one genre
4. Tap "Save Preferences"
5. Go back to the Swipe tab

### 4. No Titles Showing
If the Swipe screen loads but shows "No More Titles":

1. Make sure you've set up preferences (see above)
2. Check if you've already swiped on all available mock titles
3. Try refreshing or resetting the app

### 5. 503 / "Invalid Refresh Token" / App Stuck
If you see **503** or **Invalid Refresh Token: Refresh Token Not Found** when opening the app:

1. **Supabase was restarted** – Stored refresh tokens are no longer valid. The app will clear session and show the login screen; **sign in again**.
2. **Supabase not running** – Start it: `cd` to project root, run `supabase start`. Then reload the app.
3. **"Route named login not handled"** – Fixed in app: we use a declarative redirect. Reload the app after pulling the fix.

### 6. "Could not find the table 'user_genres' / 'tmdb_providers_movie'"
PostgREST’s schema cache is missing those tables (e.g. after Supabase restart from an old backup). **Apply migrations:**

```bash
cd path/to/MovieMatch
supabase db reset
```

Then reload the app and sign in again (DB was recreated). To keep existing data, run only pending migrations instead: `supabase migration up` (if linked) or run the SQL from `supabase/migrations/20240102000002_tmdb_views_functions.sql` in Supabase Studio → SQL Editor.

### 7. App Crashes or Other Errors
Check the terminal for error messages. Common issues:

- **Database connection errors**: Make sure Supabase is running (`supabase start`)
- **Import errors**: Make sure all files are saved correctly
- **Type errors**: Check TypeScript compilation

## Testing Checklist

- [ ] Can you see 4 tabs: Home, Swipe, Matches, Preferences?
- [ ] Can you navigate to each tab?
- [ ] Do the icons show correctly in the tab bar?
- [ ] Can you access the Preferences screen?
- [ ] Can you select services and genres in Preferences?
- [ ] Can you save preferences?
- [ ] Does the Swipe screen show cards after setting preferences?
- [ ] Can you swipe cards left/right?
- [ ] Do swipes save to the database?

## Still Not Working?

1. Check the Expo terminal for any error messages
2. Make sure all dependencies are installed: `cd app && npm install`
3. Try restarting Supabase: `supabase stop && supabase start`
4. Check if you're logged in (should see auth status on Home tab)

 