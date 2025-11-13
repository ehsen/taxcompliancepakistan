# WHT Calculation - Debugging Flowchart

## Visual Debug Flow

```
START: Payment Entry Saved
    ↓
[WHT] Function Start logged?
    ├─ NO → Hook not being called
    │       └─ CHECK: Is hook registered in hooks.py?
    │
    └─ YES → Continue
        ↓
[WHT] Early Exit logged?
    ├─ YES → Party type is not "Supplier" or "Customer"
    │       └─ FIX: Use correct party type
    │
    └─ NO → Continue
        ↓
[WHT] Supplier Fetch Error logged?
    ├─ YES → Supplier doesn't exist
    │       └─ FIX: Create/verify Supplier record
    │
    └─ NO → Continue
        ↓
[WHT] No Sections logged?
    ├─ YES → No references have WHT section
    │       └─ FIX: Set custom_wht_section on references
    │           OR set default template on Supplier
    │
    └─ NO → Continue
        ↓
[WHT] Section Not Found logged?
    ├─ YES → WHT Section doesn't exist in database
    │       └─ FIX: Create the WHT Section record
    │
    └─ NO → Continue
        ↓
[WHT] Missing Section logged?
    ├─ YES → Some references don't have WHT section
    │       └─ FIX: Set section on those references
    │
    └─ NO → Continue
        ↓
[WHT] FBR Status logged?
    ├─ Value is None?
    │   └─ FIX: Set custom_party_fbr_status to "Active" or "InActive"
    │
    ├─ Value is "active" or "ACTIVE"?
    │   └─ FIX: Case matters! Must be exactly "Active"
    │
    ├─ Value is something else?
    │   └─ FIX: Must be "Active" or "InActive" exactly
    │
    └─ Value is "Active" or "InActive"?
        ↓ YES
[WHT] Unknown FBR Status logged?
    ├─ YES → FBR Status has invalid value
    │       └─ FIX: Must be exactly "Active" or "InActive"
    │
    └─ NO → Continue
        ↓
[WHT] Rate is Zero logged?
    ├─ YES → WHT section rates are 0
    │       └─ FIX: Check WHT Section rates:
    │           - active_tax_payer_rate > 0?
    │           - inactive_tax_payer_rate > 0?
    │
    └─ NO → Continue
        ↓
[WHT] Calculated Amount logged?
    ├─ YES → WHT is being calculated! ✅
    │       └─ Check amount is correct
    │
    └─ NO → Continue
        ↓
[WHT] Tax Row Added logged?
    ├─ YES → WHT is in taxes section! ✅
    │       └─ SUCCESS: WHT calculation complete
    │
    └─ NO → Tax row not being added
            └─ FIX: Check account_head configuration
```

---

## Error Log Search Strategy

### Quick Search Pattern
Go to Error Log and search for:
- **Title contains:** `WHT`
- **Sort by:** Newest first

### Reading the Logs (from newest to oldest)
1. Start with the NEWEST `[WHT]` message
2. Read backwards to find where it stopped
3. Last successful message = where it failed next

### Example Log Sequence

```
[1] [WHT] Hook Complete                      ← Latest
[2] [WHT] Tax Row Added                      ← Tax was added ✅
[3] [WHT] Calculated Amount                  ← Amount calculated ✅
[4] [WHT] Applicable Rate → Active, 2.5%     ← Rate applied ✅
[5] [WHT] FBR Status → Active                ← Status found ✅
[6] [WHT] Processing Reference               ← Processing started ✅
...
[N] [WHT] Function Start                     ← Oldest, entry point
```

If the log stops at message [5], then FBR Status was found but rate selection failed.

---

## Configuration Verification Checklist

### Step 1: Check Custom Fields Exist
```sql
-- Check if custom fields are created (from Frappe console)
db.get_all('Custom Field', {
    filters: {
        'dt': 'Payment Entry',
        'fieldname': 'custom_party_fbr_status'
    }
})
```

### Step 2: Check Field Values
```python
# In Frappe console:
pe = frappe.get_doc('Payment Entry', 'PE-001')
print(f"FBR Status: {pe.custom_party_fbr_status}")
for ref in pe.references:
    print(f"Reference: {ref.reference_name}, Section: {ref.custom_wht_section}")
```

### Step 3: Check WHT Sections
```python
# In Frappe console:
sections = frappe.get_all('WHT Sections', fields=['name', 'active_tax_payer_rate', 'inactive_tax_payer_rate'])
for s in sections:
    print(f"{s.name}: Active={s.active_tax_payer_rate}, Inactive={s.inactive_tax_payer_rate}")
```

### Step 4: Check Supplier Configuration
```python
# In Frappe console:
supplier = frappe.get_doc('Supplier', 'SUP-001')
print(f"Default WHT Template: {supplier.get('custom_default_wht_template')}")
```

---

## Common Error Messages & Solutions

| Error Log Message | Meaning | Solution |
|---|---|---|
| `[WHT] Early Exit` | Party is not Supplier/Customer | Use correct party type |
| `[WHT] Supplier Fetch Error` | Supplier not found | Create the Supplier record |
| `[WHT] No Sections` | No references have section | Set sections on references |
| `[WHT] Section Not Found` | Section name doesn't exist | Create WHT Section record |
| `[WHT] FBR Status → None` | Field not set | Set to "Active" or "InActive" |
| `[WHT] Unknown FBR Status` | Wrong value | Check spelling: must be exact |
| `[WHT] Rate is Zero` | Rates not configured | Set rates > 0 on section |
| `[WHT] Calculated Amount` | All good! | Check amount = allocated × rate% |
| `[WHT] Tax Row Added` | Success! | Check taxes section has new row |

---

## Quick Fixes (In Order of Likelihood)

### Fix #1 (Most Likely): Set FBR Status
```python
# In Payment Entry, set the field to:
custom_party_fbr_status = "Active"  # or "InActive"
```

### Fix #2: Set WHT Section on References
In Payment Entry references, set:
```python
custom_wht_section = "Section 1"  # or whatever section name
```

### Fix #3: Set Default on Supplier
In the Supplier record, set:
```python
custom_default_wht_template = "Section 1"
```

### Fix #4: Verify WHT Section Rates
In WHT Sections, ensure:
```python
active_tax_payer_rate = 2.5     # Must be > 0
inactive_tax_payer_rate = 5.0   # Must be > 0
```

---

## Success Indicators

✅ **You'll know it's working when:**
1. Error log shows `[WHT] Calculated Amount`
2. Error log shows `[WHT] Tax Row Added`
3. Payment Entry taxes section has new row
4. Tax amount = allocated amount × rate%
5. Tax description shows WHT section name

---

## Performance Notes

- **Logging is asynchronous** - Doesn't slow down Payment Entry
- **All logs are marked [WHT]** - Easy to filter
- **No duplicate queries** - Uses batch fetch
- **Safe for production** - Won't cause errors

---

## Testing Workflow

```
1. Open Payment Entry form
   ↓
2. Fill in:
   - Party Type: Supplier
   - Party: Choose a supplier
   - Custom FBR Status: "Active"
   ↓
3. Add reference:
   - Reference: Purchase Invoice
   - Allocated Amount: 100,000
   - Custom WHT Section: "Section 1"
   ↓
4. Save
   ↓
5. Check Error Log for [WHT] messages
   ↓
6. Look for [WHT] Calculated Amount and [WHT] Tax Row Added
   ↓
7. Check taxes section for new WHT tax row
   ↓
8. Expected tax amount:
   100,000 × 2.5% = 2,500 ✅
```

---

## Still Not Working?

If WHT still doesn't calculate after checking all the above:

1. **Take screenshot of last [WHT] log message**
2. **Check if field exists:** Go to Payment Entry doctype, search for "custom_party_fbr_status"
3. **Check custom fields:** Ensure `custom_wht_section` exists on References table
4. **Verify hook is registered:** Check `hooks.py` has the on_payment_entry_update hook
5. **Restart Frappe:** `bench restart` might be needed for hook registration

---

## Questions to Ask Before Debugging

1. Are custom fields created?
2. Is the hook registered?
3. Is FBR Status exactly "Active" or "InActive"?
4. Do WHT Sections exist with rates?
5. Are rates > 0?
6. Is allocated_amount > 0?
7. Is party_type "Supplier"?

If all answers are YES, WHT will calculate! 🚀


