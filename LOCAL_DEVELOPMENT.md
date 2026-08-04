# Local browser delivery

Run the application from an HTTP origin; do not open `index.html` with `file://`.

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`. A proper localhost origin is required for private Binance requests, Supabase database and Storage access, popups, and frame messaging. Browser origin/CORS failures from `file://` are local-delivery errors and must not be treated as Binance outages. Do not bypass CORS or disable browser security.
