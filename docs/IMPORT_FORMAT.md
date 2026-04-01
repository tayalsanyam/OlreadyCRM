# Lead Import Format (CSV)

## Column order

Use **comma or tab** as delimiter. First row can be a header (name, city, etc.).

| Col | Field | Required | Notes |
|-----|-------|----------|-------|
| 0 | name | Yes | Lead name |
| 1 | city | Yes | City |
| 2 | company | | Company |
| 3 | email | | Email |
| 4 | phone | | Phone (duplicate check) |
| 5 | insta_id | | Instagram ID |
| 6 | bdm | Yes | BDM name (must exist in Config) |
| 7 | plan | Yes | Plan name (must exist in Config) |
| 8 | status | | UNTOUCHED, CONTACTED, FOLLOW UP/DETAILS SHARED, CONFIRMED, PAID, DENIED |
| 9 | remarks | | Notes |
| 10 | connected_on | | YYYY-MM-DD |
| 11 | next_follow_up | | YYYY-MM-DD |
| 12 | committed_date | | YYYY-MM-DD |
| 13 | original_price | | Number |
| 14 | discount | | Number |
| 15 | amount_paid | | Number |
| 16 | payment_status | | PENDING, PARTIAL, COMPLETE |
| 17 | payment_mode | | CASH, BANK, UPI, etc. |

## Sample CSV

```csv
name,city,company,email,phone,insta_id,bdm,plan,status,remarks,connected_on,next_follow_up,committed_date,original_price,discount,amount_paid,payment_status,payment_mode
John Doe,Mumbai,TechCo,john@example.com,9876543210,,GAURAV,Basic 10k,CONTACTED,Called client,2026-02-01,2026-02-15,,,0,,,,
Jane Smith,Delhi,DesignCo,,9123456789,,GURKIRAN,Pro 20k,UNTOUCHED,,,2026-02-20,,,20000,2000,,,,
```

## Column mapping

If your CSV has different column order, use the **Import** tab to map each field to the correct column index before importing.
