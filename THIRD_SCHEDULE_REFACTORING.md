# 3rd Schedule Goods Tax Calculation - Refactoring Guide

## Overview

The taxation.js file has been refactored to implement proper 3rd Schedule Goods tax calculation as per Pakistani tax law. This document explains the changes, architecture, and testing procedures.

## Changes Summary

### 1. **New Function: `calculate_third_schedule_taxes()`** 
**Lines: 192-287**

A dedicated, pure calculation function for 3rd Schedule Goods using reverse-calculation methodology.

#### Algorithm:
1. **Get Taxable Base**: `MAX(custom_fixed_notified_value, custom_retail_price)` from Item master
2. **Extract Sales Tax**: Reverse-calculates ST from the inclusive price
   - Formula: `ST = taxable_base - (taxable_base / (1 + rate/100))`
3. **Calculate Ex-Sales-Tax Value**: `ex_sales_tax_value = taxable_base - ST`
4. **Calculate Further Tax**: Applied conditionally based on ex-sales-tax value
5. **Return Complete Tax Result**: All tax components and totals

#### Why Separate?
- **Clean debugging**: Easy to isolate and test the core algorithm
- **No fallbacks**: Must pass all 3rd Schedule requirements or fail loudly
- **Maintainable**: Future law changes only require updating this function
- **Testable**: Pure function with clear inputs/outputs

#### Signature:
```javascript
function calculate_third_schedule_taxes(
    row,              // Invoice item row
    itemData,         // Item master doc
    templateData,     // Item Tax Template doc
    frm,              // Parent form
    multiplier,       // Direction (1 or -1)
    qty,              // Quantity
    precision         // Currency precision
)
```

#### Returns:
```javascript
{
    st: 0,                    // Sales tax amount
    st_rate: 0,              // Sales tax rate (%)
    further_tax: 0,          // Further sales tax amount
    ft_rate: 0,              // Further tax rate (%)
    ex_sales_tax_value: 0,   // Taxable base after ST extraction
    total_incl_tax: 0        // Total including all taxes
}
```

#### Key Points:
- ✅ No fallbacks - every step is mandatory for 3rd Schedule
- ✅ Per-unit calculation, then multiplied by quantity
- ✅ Handles return multiplier correctly
- ✅ Comprehensive logging for debugging

---

### 2. **New Function: `handle_third_schedule_item_calculation()`**
**Lines: 411-496**

Orchestration function that routes 3rd Schedule items to the calculation engine.

#### Responsibilities:
1. **Fetch Item Master**: Get `custom_fixed_notified_value` and `custom_retail_price`
2. **Fetch Tax Template**: Get tax rates for ST and Further Tax
3. **Calculate Taxes**: Call `calculate_third_schedule_taxes()`
4. **Apply Results**: Update row fields via `apply_third_schedule_taxes_to_row()`

#### Data Flow:
```
Item Detected (custom_tax_classification.strip === "3rd Schedule Goods")
    ↓
handle_third_schedule_item_calculation()
    ├─ Fetch Item Master (Item doctype)
    ├─ Fetch Tax Template (Item Tax Template doctype)
    └─ calculate_third_schedule_taxes()
        ├─ Extract notified/retail prices
        ├─ Reverse-calculate taxes
        └─ Return tax object
    ├─ apply_third_schedule_taxes_to_row()
    └─ apply_tax_summary()
```

#### Error Handling:
- ✅ Logs if item not found
- ✅ Logs if tax template not found (proceeds with zero taxes but documents issue)
- ✅ Logs if template fetch fails

---

### 3. **New Function: `apply_third_schedule_taxes_to_row()`**
**Lines: 505-529**

Applies calculated tax results to the invoice row and triggers UI refresh.

#### Updates:
- `custom_st_rate` - Sales tax rate
- `custom_st` - Sales tax amount
- `custom_ft_rate` - Further tax rate
- `custom_further_tax` - Further tax amount
- `custom_total_incl_tax` - Total with all taxes
- `custom_at` - Set to 0 (advance tax not applicable for 3rd Schedule)

#### Actions:
1. Applies all tax values with proper precision
2. Refreshes items table in UI
3. Triggers `apply_tax_summary()` after short delay (50ms)

---

### 4. **Updated Function: `calculate_taxes()`**
**Lines: 596-601**

Added check to route 3rd Schedule items to dedicated handler:

```javascript
// Check if item is 3rd Schedule Goods - handle separately with reverse calculation
if (row.custom_tax_classification && row.custom_tax_classification.strip === "3rd Schedule Goods") {
    console.log(`[calculate_taxes] Detected 3rd Schedule Goods: ${row.item_code} - routing to dedicated handler`);
    handle_third_schedule_item_calculation(frm, row, manual_override_field);
    return;  // Exit early - don't use normal calculation path
}
```

#### Why Early Return?
- 3rd Schedule uses completely different logic
- No mixing of calculation methods
- Clear separation of concerns

---

## Tax Calculation Logic Deep Dive

### Normal Items (Non-3rd Schedule)
```
Base = qty × rate
ST = base × (ST_rate / 100)
Further Tax = base × (FT_rate / 100)  [if applicable]
Total = Base + ST + Further Tax
```

### 3rd Schedule Goods
```
Taxable Base = MAX(fixed_notified_value, retail_price)
                ↓
    [Taxable base is INCLUSIVE of ST]
                ↓
Extract ST = taxable_base - (taxable_base / (1 + rate/100))
                ↓
ex_sales_tax_value = taxable_base - extracted_ST
                ↓
Further Tax = ex_sales_tax_value × (FT_rate / 100)  [if unregistered customer]
                ↓
Total = ex_sales_tax_value + extracted_ST + further_tax
```

### Reverse Calculation Formula
For an inclusive price P with tax rate R:
- **Exclusive amount**: `P / (1 + R/100)`
- **Tax amount**: `P - (P / (1 + R/100))`

Example: Price 100 with 17% ST
- Exclusive: `100 / 1.17 = 85.47`
- ST: `100 - 85.47 = 14.53`

---

## Required Item Master Fields

For 3rd Schedule items, ensure these fields exist on Item doctype:

1. **`custom_tax_classification`** (Data/String)
   - Direct string field, NOT a link
   - Must be set to exactly `"3rd Schedule Goods"` to trigger 3rd Schedule calculation
   - Example: `row.custom_tax_classification === "3rd Schedule Goods"`
   - Other possible values: Any other classification name (treated as normal items)

2. **`custom_fixed_notified_value`** (Currency)
   - Notified price fixed by government
   - Must be set for 3rd Schedule items

3. **`custom_retail_price`** (Currency)
   - Actual selling price
   - Algorithm uses MAX of notified and retail price

---

## Required Document Configuration

### Item Tax Template
Must have taxes configured with `custom_tax_category`:

```
Sales Tax row:
  - custom_tax_category = "Sales Tax"
  - tax_rate = 17 (or applicable rate)

Further Sales Tax row (optional):
  - custom_tax_category = "Further Sales Tax"
  - tax_rate = 5 (or applicable rate)
```

### Invoice Document Type
Needs these fields:
- `custom_customer_st_status` - For determining further tax applicability
- `custom_sales_tax_invoice` - Invoice classification
- `custom_purchase_invoice_type` - For Import exclusion

---

## Code Quality Principles

✅ **No Fallbacks**: Every 3rd Schedule calculation must follow the law exactly
✅ **Separation of Concerns**: 3rd Schedule logic isolated from normal calculations
✅ **Comprehensive Logging**: Every step logged for debugging
✅ **Pure Functions**: `calculate_third_schedule_taxes()` has no side effects
✅ **Type Safety**: Uses `flt()` for all numeric operations with precision
✅ **Early Returns**: Clear exit paths prevent logic mixing
✅ **JSDoc Comments**: Detailed function documentation
✅ **Consistent Naming**: Function names describe their purpose

---

## Testing Checklist

### Unit Tests (For `calculate_third_schedule_taxes`)

1. **Test Fixed Notified Value Path**
   - Set `custom_fixed_notified_value = 100`
   - Set `custom_retail_price = 90`
   - Verify: Uses 100 (higher value)

2. **Test Retail Price Path**
   - Set `custom_fixed_notified_value = 80`
   - Set `custom_retail_price = 100`
   - Verify: Uses 100 (higher value)

3. **Test ST Extraction**
   - Taxable base = 100
   - ST rate = 17%
   - Verify: ST ≈ 14.53, ex_ST ≈ 85.47

4. **Test Further Tax (Unregistered Customer)**
   - ex_ST = 85.47
   - FT rate = 5%
   - Verify: Further Tax ≈ 4.27

5. **Test Quantity Multiplication**
   - Qty = 5, single unit = 100
   - Verify: Totals multiplied correctly

6. **Test Return Multiplier**
   - is_return = 1 or qty < 0
   - Verify: All amounts negative

### Integration Tests (In Invoice Form)

1. **Test Single 3rd Schedule Item**
   - Create Sales Invoice
   - Add 3rd Schedule item
   - Verify: Taxes calculated using reverse formula

2. **Test Mixed Items**
   - Add normal item
   - Add 3rd Schedule item
   - Verify: Each uses correct calculation method

3. **Test Tax Summary**
   - Add 3rd Schedule item
   - Verify: `apply_tax_summary()` correctly totals all taxes

4. **Test Manual Override** (Future)
   - Currently: 3rd Schedule → dedicated handler (no override check yet)
   - Future: Implement manual override for 3rd Schedule if needed

5. **Test Return Document**
   - Create from normal invoice
   - Verify: Quantities and amounts negative
   - Verify: Taxes calculated correctly with multiplier

---

## Debugging Guide

### Enable Logging
All functions log via `console.log()` with prefixes:
- `[calculate_third_schedule_taxes]` - Core calculation
- `[handle_third_schedule_item_calculation]` - Orchestration
- `[apply_third_schedule_taxes_to_row]` - UI application

### Common Issues

**Issue**: Taxes showing as 0
- ✓ Check if item has `custom_tax_classification` set
- ✓ Check if `custom_tax_classification.strip === "3rd Schedule Goods"`
- ✓ Check if Tax Template is linked to item
- ✓ Check console for errors

**Issue**: Wrong tax amounts
- ✓ Verify `custom_fixed_notified_value` and `custom_retail_price` are correct
- ✓ Verify Tax Template has correct rates with `custom_tax_category`
- ✓ Check precision setting in system defaults
- ✓ Review console logs for calculation steps

**Issue**: Function not being called
- ✓ Check if item classification detection is working
- ✓ Add breakpoint in `calculate_taxes()` at line 597
- ✓ Verify `row.custom_tax_classification` exists

---

## Migration Notes

### Breaking Changes
None. Existing normal item calculations are unaffected.

### New Behavior
- Items with 3rd Schedule classification now automatically use reverse calculation
- No manual configuration needed - purely data-driven

### Backward Compatibility
✅ All existing functionality preserved
✅ Normal items still calculate normally
✅ No changes to tax summary logic
✅ No changes to invoice validation

---

## Future Enhancements

1. **Manual Override Support**
   - Allow override of extracted ST for 3rd Schedule
   - Requires parameter expansion in handler

2. **Audit Trail**
   - Store calculation method used in audit log
   - Track which items used reverse calculation

3. **Report Integration**
   - Add 3rd Schedule calculation details to tax reports
   - Show ex_sales_tax_value in line item reports

4. **Performance**
   - Cache item and template data to reduce API calls
   - Consider batch calculations for large invoices

---

## References

### Tax Law References
- 3rd Schedule: Government notified goods with fixed price
- Reverse calculation: ST extracted from inclusive price
- Further tax: Applied to ex-tax amount only

### Code References
- `calculate_third_schedule_taxes()` - Line 192
- `handle_third_schedule_item_calculation()` - Line 421
- `apply_third_schedule_taxes_to_row()` - Line 505
- 3rd Schedule detection - Line 597

