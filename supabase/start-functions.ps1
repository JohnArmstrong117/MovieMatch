# PowerShell script to start Supabase Edge Functions server
# Run this in a separate terminal window to keep Edge Functions running

Write-Host "Starting Supabase Edge Functions server...`n" -ForegroundColor Cyan
Write-Host "This will keep running until you press Ctrl+C`n" -ForegroundColor Yellow
Write-Host "Keep this terminal open while developing.`n" -ForegroundColor White

supabase functions serve
