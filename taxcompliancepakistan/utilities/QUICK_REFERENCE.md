# WHT Calculation - Quick Reference Guide

## 🔴 If WHT is NOT Calculating, Check This:

### Step 1: Check Error Log
Go to **Error Log** in Frappe and filter for messages with `[WHT]` in the title. Read them in order.

### Step 2: Find the Failure Point
Look for which `[WHT]` message appears LAST before calculation stops:

| Message | What to Check |
|---------|---------------|
| `[WHT] Early Exit` | Payment Entry party_type is not "Supplier" or "Customer" |
| `[WHT] Supplier Fetch Error` | The Supplier record doesn't exist |
| `[WHT] No Sections` | No references have `custom_wht_section` assigned |
| `[WHT] Section Not Found` | The WHT Section name doesn't exist in database |
| `[WHT] FBR Status` | **CRITICAL**: Is this "None", "Active", or "InActive"? |
| `[WHT] Rate is Zero` | Rate is 0 because FBR Status doesn't match expected values |
| `[WHT] Calculated Amount` | Amount is calculated ✅ |
| `[WHT] Tax Row Added` | Tax is added to taxes section ✅ |

---

## 🔧 The Most Common Fix

**The #1 reason WHT doesn't calculate is: `custom_party_fbr_status` is not set**

**How to fix it:**
1. Add `custom_party_fbr_status` field to Payment Entry doctype if missing
2. Set it to either:
   - `"Active"` - for active tax payers
   - `"InActive"` - for inactive tax payers
3. Make sure it's being populated when Payment Entry is created

---

## ✅ What Should Happen (Happy Path)

```
1. [WHT] Function Start → Payment Entry: PE-001, Party: Supplier-A
2. [WHT] Supplier Default Template → Default WHT Template: Section A
3. [WHT] Reference Details → Reference: PI-001, Section: Section A, Amount: 100000
4. [WHT] FBR Status → FBR Status on Payment Entry: Active ✅ (NOT None!)
5. [WHT] Applicable Rate → FBR Status: Active, Selected Rate: 2.5%
6. [WHT] Calculated Amount → Amount: 2500
7. [WHT] Tax Row Added → Tax: 2500 for Section A ✅
```

---

## 🚨 Common Failure Scenarios

### Scenario A: FBR Status is None
```
[WHT] FBR Status → FBR Status on Payment Entry: None ❌
[WHT] Unknown FBR Status → ... is neither 'Active' nor 'InActive' - returning 0
[WHT] Rate is Zero → ... - skipping
```
**Fix:** Set `custom_party_fbr_status` field

### Scenario B: Section Not Found
```
[WHT] Missing Section → Reference PI-001 has no WHT section assigned ❌
```
**Fix:** Either:
- Set `custom_wht_section` on the reference manually
- Set default template on the Supplier

### Scenario C: Section Doesn't Exist in Database
```
[WHT] Section Not Found → WHT section 'MySection' not found in database ❌
```
**Fix:** Create the WHT Section record in the database

### Scenario D: Supplier Doesn't Exist
```
[WHT] Supplier Fetch Error → Error fetching supplier Supplier-A: ... ❌
```
**Fix:** Make sure the supplier exists and is spelled correctly

---

## 📋 Configuration Checklist

Before WHT will work, ensure:

- [ ] `custom_party_fbr_status` field exists on Payment Entry doctype
- [ ] `custom_wht_section` field exists on Payment Entry reference child table
- [ ] `custom_default_wht_template` field exists on Supplier doctype
- [ ] At least one WHT Section record exists with configured rates
- [ ] Supplier record has a default template set (if using it)
- [ ] Payment Entry references have WHT sections assigned
- [ ] Payment Entry has FBR Status set to "Active" or "InActive"

---

## 🐛 Bugs Fixed in This Version

1. **Tax Amount Truncation** - Was using `int(total_wht)` which lost decimals. Now uses `float(total_wht)`
2. **Poor Logging** - Old code had confusing print statements. Now has comprehensive `[WHT]` prefixed logs
3. **Error Handling** - Added try/catch for supplier fetch and WHT section queries

---

## 🔍 Additional Logging Points

The enhanced code logs:
- ✅ When function starts
- ✅ Every reference processed and why it's skipped (if applicable)
- ✅ Every WHT section fetched from database
- ✅ Every rate calculation and which rate is chosen
- ✅ Every WHT amount calculated
- ✅ Every tax row added to the document
- ✅ Final summary before taxes are recalculated

**Use these logs to trace through exactly where the calculation stops!**


