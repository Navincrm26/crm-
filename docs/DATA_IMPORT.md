# Reviewed data import

Do not connect this importer directly to a live Sites/Supabase database. It reads a local, reviewed JSON file in the explicit `navin-mern-v1` format. Admin's **Export CRM records** generates that format from this MERN app. Raw old CRM exports need a separate mapping step because field names, relationships and identity IDs differ.

Each record has a UUID `id`, `type` (`customer`, `enquiry`, `task`, `quotation`, `master`), a mapped `ownerId`, `data`, and optional `customerId`, `enquiryId`, `department`, `assigneeIds`, timestamps and history. Include referenced customers. Create/activate destination owners first; map old owner/assignee IDs explicitly. Never carry over plaintext passwords, password hashes, tokens or devices from an export.

Example shape (the UUIDs must be mapped to real destination users for `--apply`):

```json
{
  "format": "navin-mern-v1",
  "records": [{
    "id": "11111111-1111-4111-8111-111111111111",
    "type": "customer",
    "ownerId": "00000000-0000-4000-8000-000000000001",
    "data": {"name": "TEST example company", "notes": "Dummy example only"}
  }]
}
```

Validate without writing:

```bash
npm run import -- ./reviewed-export.json
```

After backing up and reviewing the destination `.env`, explicitly allow the transaction:

```bash
ALLOW_DATA_IMPORT=yes npm run import -- ./reviewed-export.json --apply
```

On PowerShell set `$env:ALLOW_DATA_IMPORT="yes"`, run the import command, then remove that environment variable. This is insert-only: conflicting IDs roll back the transaction; it will not merge or overwrite records. Keep batches small enough for Atlas transaction limits. File bytes, users and authentication data are deliberately not imported. Reattach files or perform a separately verified GridFS migration. Imported quotation numbers do not advance the new quotation counter; review/reconcile numbering before creating new quotes after import.
