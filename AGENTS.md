# Agent rules

- Edge functions that write shared fund data (process-workbook, sync-onedrive, fetch-fund-data action=full) must call `requireAdmin` from `supabase/functions/_shared/auth.ts`; user-cost endpoints call `requireUser`. Why: admin is decided server-side only (service-role bearer or `ADMIN_USER_IDS` secret), never by browser flags.
- Workbook parsing must go through `supabase/functions/_shared/workbookParser.ts` (header-driven, '--' = NA, '--X' = negative). Why: fixed column positions corrupted categories and dropped negative returns.
- The browser only reads fund data (`fetch-fund-data?action=cached`, legacy `mfapi`); it never triggers shared refreshes. Why: refreshes overwrite data for every user.
- Generated (non-source) charts must show `IllustrativeBadge`. Why: synthetic data must never look like actual fund data.
