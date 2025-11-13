# WHT Calculation - Debug Analysis

## Issues Identified

### 1. **CRITICAL BUG: Tax Amount Truncation** ⚠️
**Location:** Line 97 (old code)
```python
tax_row.tax_amount = int(total_wht)  # WRONG - Truncates decimals!
```
**Problem:** Using `int()` truncates decimal values. If WHT is 1500.50, it becomes 1500.
**Fix:** Changed to `float(total_wht)` to preserve decimal places.

---

### 2. **FBR Status Not Set** ⚠️
**Location:** Line 46 (payment_entry.custom_party_fbr_status)
**Problem:** If the Payment Entry doesn't have `custom_party_fbr_status` set, the function returns `None`, which then fails the rate check at line 49:
```python
fbr_status = getattr(payment_entry, "custom_party_fbr_status", None)
rate = get_applicable_rate(section, fbr_status)
if not rate:
    continue  # SKIPS THIS INVOICE!
```
**Root Cause:** `get_applicable_rate()` only returns a rate if `fbr_status == "Active"` or `fbr_status == "InActive"`. Any other value (including `None`) returns 0, which causes the calculation to skip.

**What to Check:**
- Is `custom_party_fbr_status` field present on the Payment Entry doctype?
- Is it being populated when Payment Entry is created?
- What are the valid values? ("Active", "InActive", or something else?)

---

### 3. **WHT Section Not Found**
**Location:** References might not have `custom_wht_section` assigned
**Problem:** If:
- No default WHT template is set on the Supplier, AND
- The reference doesn't have `custom_wht_section` manually set
Then the calculation won't run.

**What to Check:**
- Is `custom_wht_section` being set on Payment Entry references?
- Is the default template on the Supplier configured?
- Are custom fields present on Payment Entry and its references?

---

### 4. **WHT Sections Not Found in Database**
**Problem:** If the section name exists in references but not in the "WHT Sections" doctype, it will be skipped.

---

### 5. **Confusing Log Message**
**Location:** Line 18 (old code)
```python
print("Skipped at supplier")  # MISLEADING - It didn't skip!
```
The message says "skipped" but the code continues processing. This was replaced with clear logging.

---

## How to Debug

When you test a Payment Entry, check the **Error Log** for messages with titles starting with `[WHT]`. They will tell you:

1. ✅ Function started and which payment entry
2. ✅ Party type and party being processed
3. ✅ Supplier's default WHT template (if set)
4. ✅ Each reference being processed
5. ✅ Which references are skipped and why
6. ✅ WHT sections being fetched from database
7. ✅ FBR Status being used
8. ✅ Rate selection (Active/InActive)
9. ✅ Final WHT amounts calculated
10. ✅ Tax rows being added

---

## Most Likely Root Cause

Based on typical implementations, the **#1 most common issue** is:

**`custom_party_fbr_status` field is NOT SET on the Payment Entry**

This causes:
```
FBR Status on Payment Entry: None
↓
get_applicable_rate() returns 0 (not "Active" or "InActive")
↓
if not rate: continue  ← SKIPS CALCULATION
↓
NO WHT IS CALCULATED
```

---

## Other Common Issues

2. **Custom fields not created** - `custom_wht_section` or `custom_party_fbr_status` might not exist
3. **WHT Sections not in database** - The section names referenced don't exist
4. **Default template not set** - Supplier doesn't have `custom_default_wht_template`

---

## Testing Steps

1. Create a Payment Entry with a Supplier
2. Add a Purchase Invoice reference with amount
3. Check Error Log - Look for all `[WHT]` messages
4. Verify in order:
   - ✅ Party type is "Supplier"
   - ✅ Supplier's default template shows (if expected)
   - ✅ FBR Status is either "Active" or "InActive"
   - ✅ WHT section is found and has rates configured
   - ✅ WHT amount is calculated
   - ✅ Tax row is added to the Payment Entry

If any step is missing, that's your issue!


