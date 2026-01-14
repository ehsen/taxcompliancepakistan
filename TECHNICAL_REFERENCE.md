# 3rd Schedule Goods - Technical Reference

## Quick Reference

### Detection Logic
```javascript
// Simple string comparison - NO link, NO nested property
if (row.custom_tax_classification === "3rd Schedule Goods") {
    // 3rd Schedule calculation
}
```

### Flow Diagram
```
Invoice Item Added/Changed
    ↓
calculate_taxes(frm, row, manual_override_field)
    ↓
Check: row.custom_tax_classification === "3rd Schedule Goods"?
    ├─ YES → handle_third_schedule_item_calculation()
    │         ├─ Fetch Item Master
    │         ├─ Get notified/retail prices
    │         ├─ Fetch Tax Template
    │         ├─ calculate_third_schedule_taxes()
    │         │  ├─ Get MAX(notified, retail)
    │         │  ├─ Extract ST via reverse formula
    │         │  ├─ Calculate ex-ST value
    │         │  ├─ Calculate further tax
    │         │  └─ Return result object
    │         └─ apply_third_schedule_taxes_to_row()
    │            └─ Update item fields & refresh UI
    │
    └─ NO → Normal calculation flow (existing code)
```

---

## Function Reference

### 1. `calculate_third_schedule_taxes(row, itemData, templateData, frm, multiplier, qty, precision)`

**Pure calculation function - NO side effects**

#### Input Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `row` | Object | Invoice item row |
| `itemData` | Object | Item master doc (has custom_fixed_notified_value, custom_retail_price) |
| `templateData` | Object | Tax template doc (has taxes array) |
| `frm` | Object | Parent form |
| `multiplier` | Number | 1 or -1 (for returns) |
| `qty` | Number | Quantity (absolute value) |
| `precision` | Number | Currency precision (usually 2) |

#### Output:
```javascript
{
    st: Number,                    // Sales tax amount
    st_rate: Number,              // Sales tax rate (%)
    further_tax: Number,          // Further sales tax amount
    ft_rate: Number,              // Further tax rate (%)
    ex_sales_tax_value: Number,   // Base price after ST extraction
    total_incl_tax: Number        // Total including all taxes
}
```

#### Algorithm:
```javascript
1. taxableBase = MAX(itemData.custom_fixed_notified_value, itemData.custom_retail_price)
2. salestaxRate = extract from templateData.taxes where custom_tax_category === "Sales Tax"
3. extractedSalesTax = taxableBase - (taxableBase / (1 + salestaxRate/100))
4. exSalesTaxValue = taxableBase - extractedSalesTax
5. furtherTaxRate = extract from templateData.taxes where custom_tax_category === "Further Sales Tax"
6. furtherTax = exSalesTaxValue * (furtherTaxRate / 100) * multiplier [if conditions met]
7. totalPerUnit = exSalesTaxValue + extractedSalesTax + furtherTax
8. Return object with all values multiplied by qty
```

#### Example:
```javascript
const result = calculate_third_schedule_taxes(
    row,
    {
        custom_fixed_notified_value: 100,
        custom_retail_price: 95
    },
    {
        taxes: [
            { custom_tax_category: "Sales Tax", tax_rate: 17 },
            { custom_tax_category: "Further Sales Tax", tax_rate: 5 }
        ]
    },
    frm,
    1,     // normal invoice
    5,     // qty = 5
    2      // precision = 2
);

// Result:
// {
//   st: 72.65,
//   st_rate: 17,
//   further_tax: 21.35,
//   ft_rate: 5,
//   ex_sales_tax_value: 85.47,
//   total_incl_tax: 594.00
// }
```

---

### 2. `handle_third_schedule_item_calculation(frm, row, manual_override_field)`

**Orchestration function - Fetches data and coordinates calculation**

#### Responsibilities:
1. **Fetch Item Master** - Gets custom_fixed_notified_value, custom_retail_price
2. **Fetch Tax Template** - Gets tax rates
3. **Calculate** - Calls calculate_third_schedule_taxes()
4. **Apply** - Calls apply_third_schedule_taxes_to_row()

#### API Calls:
```javascript
// Call 1: Fetch Item Master
frappe.call({
    method: "frappe.client.get",
    args: { doctype: "Item", name: row.item_code }
});

// Call 2: Fetch Tax Template
frappe.call({
    method: "frappe.client.get",
    args: { doctype: "Item Tax Template", name: itemTaxTemplate }
});
```

#### Data Flow:
```
Item doctype fields:
  - custom_fixed_notified_value (Currency)
  - custom_retail_price (Currency)
  - item_tax_template (Link) or derived from item_group

Tax Template doctype fields:
  - taxes[].tax_rate (Numeric)
  - taxes[].custom_tax_category (String: "Sales Tax", "Further Sales Tax")
```

---

### 3. `apply_third_schedule_taxes_to_row(frm, row, taxResult)`

**UI update function - Applies results to row and refreshes display**

#### Actions:
```javascript
row.custom_st_rate = taxResult.st_rate
row.custom_st = taxResult.st
row.custom_ft_rate = taxResult.ft_rate
row.custom_further_tax = taxResult.further_tax
row.custom_at = 0
row.custom_total_incl_tax = taxResult.total_incl_tax

frm.refresh_field("items")
apply_tax_summary(frm)  // recalculate header taxes
```

---

## 3rd Schedule Calculation Math

### The Reverse Calculation Problem

**Normal (inclusive) calculation:**
```
Price = 100 (includes 17% ST)
ST = 100 × 17% = 17
Exclusive = 100 - 17 = 83
```

**WRONG! Because 83 + 17 = 100, but 83 × 1.17 ≠ 100**

**Correct (3rd Schedule) reverse calculation:**
```
Price = 100 (includes 17% ST)
Exclusive = 100 / 1.17 = 85.47
ST = 100 - 85.47 = 14.53

Verify: 85.47 × 1.17 = 100.00 ✓
```

### Formula
For inclusive price P with tax rate R%:
```
Exclusive = P / (1 + R/100)
Tax = P - Exclusive
```

### Further Tax Calculation
Further tax applies to EXCLUSIVE amount:
```
ex_sales_tax_value = 85.47  (already calculated)
further_tax_rate = 5%
further_tax = 85.47 × 5% = 4.27
```

### Multi-Quantity Example
Item: Qty=5, Notified Price=100, ST=17%, FT=5% (unregistered)

```
Per Unit:
  Taxable Base: 100
  Extracted ST: 14.53
  Ex-ST Value: 85.47
  Further Tax: 4.27
  Total per unit: 100 + 4.27 = 104.27

For Qty=5:
  ST: 14.53 × 5 = 72.65
  Further Tax: 4.27 × 5 = 21.35
  Subtotal (qty × ex_st): 85.47 × 5 = 427.35
  TOTAL: 427.35 + 72.65 + 21.35 = 521.35
```

---

## Field Mapping

### Item Doctype Fields (Required)
```
Field Name: custom_tax_classification
Type: Data
Value: "3rd Schedule Goods" (string)

Field Name: custom_fixed_notified_value
Type: Currency
Value: Government notified price

Field Name: custom_retail_price
Type: Currency
Value: Market/retail price
```

### Item Tax Template Fields (Required)
```
Taxes Table:
  Row 1:
    tax_rate: 17 (or applicable rate)
    custom_tax_category: "Sales Tax" (string)
    account_head: [your ST account]

  Row 2 (optional):
    tax_rate: 5 (or applicable rate)
    custom_tax_category: "Further Sales Tax" (string)
    account_head: [your FT account]
```

### Invoice Fields (Must Exist)
```
Field: custom_customer_st_status
Type: Select
Values: "Registered", "Unregistered"
Purpose: Determines if Further Tax applies

Field: doctype
Default: "Sales Invoice" or "Purchase Invoice"
Purpose: Determines calculation logic
```

---

## Conditions & Constraints

### 3rd Schedule Recognition
```javascript
// TRUE = 3rd Schedule calculation
row.custom_tax_classification === "3rd Schedule Goods"

// FALSE = Normal calculation
row.custom_tax_classification === "Regular"
row.custom_tax_classification === null
row.custom_tax_classification === ""
row.custom_tax_classification === undefined
```

### Further Tax Applicability
Further tax is calculated ONLY if ALL conditions met:
```javascript
✓ Tax rate has custom_tax_category === "Further Sales Tax"
✓ frm.doc.doctype === "Sales Invoice" (not Purchase Invoice)
✓ frm.doc.custom_customer_st_status === "Unregistered"
```

### No Manual Override
Currently, 3rd Schedule items route to dedicated handler and SKIP all manual override checks:
```javascript
if (manual_override_field === "custom_st") {
    // Skipped for 3rd Schedule
}
if (manual_override_field === "custom_st_rate") {
    // Skipped for 3rd Schedule
}
```

---

## Debugging Guide

### Console Logs (Watch Browser DevTools)

**Level 1: Function Entry**
```
[calculate_taxes] Detected 3rd Schedule Goods: TEST-ITEM-001 - routing to dedicated handler
[handle_third_schedule_item_calculation] Processing 3rd Schedule item: TEST-ITEM-001
```

**Level 2: Data Fetch**
```
[handle_third_schedule_item_calculation] Fetched item data: {
  custom_fixed_notified_value: 100,
  custom_retail_price: 95
}
```

**Level 3: Calculation**
```
[calculate_third_schedule_taxes] Taxable base determined: {
  fixed_notified_value: 100,
  retail_price: 95,
  taxable_base: 100
}

[calculate_third_schedule_taxes] Sales tax extraction: {
  sales_tax_rate: 17,
  extracted_sales_tax: 14.53,
  ex_sales_tax_value: 85.47
}

[calculate_third_schedule_taxes] 3rd Schedule calculation complete: {
  st: 72.65,
  st_rate: 17,
  further_tax: 21.35,
  ft_rate: 5,
  ex_sales_tax_value: 85.47,
  total_incl_tax: 521.35
}
```

**Level 4: Application**
```
[apply_third_schedule_taxes_to_row] Applied 3rd Schedule taxes to TEST-ITEM-001: {
  custom_st: 72.65,
  custom_st_rate: 17,
  custom_further_tax: 21.35,
  custom_ft_rate: 5,
  custom_total_incl_tax: 521.35
}

[apply_third_schedule_taxes_to_row] Calling apply_tax_summary after 3rd Schedule calculation
```

### Troubleshooting Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Not detected | `console.log('classification:', row.custom_tax_classification)` | Verify exact string match "3rd Schedule Goods" |
| No tax template | Check console for "No tax template found" | Link item to tax template or set in item group |
| Wrong amount | Check "Taxable base determined" log | Verify notified/retail prices in item |
| ST = 0 | Check template has "Sales Tax" row | Add sales tax row with custom_tax_category |
| FT not calculated | Check unregistered status | Set custom_customer_st_status = "Unregistered" |
| Return negative | Check multiplier | Verify is_return flag or negative qty |

---

## Code Locations

| Component | File | Lines |
|-----------|------|-------|
| Detection | taxation.js | 597 |
| 3rd Schedule calc | taxation.js | 192-287 |
| Handler | taxation.js | 421-496 |
| Row apply | taxation.js | 505-529 |
| Normal calc flow | taxation.js | 603+ |

---

## Performance Notes

### API Calls Per Item
- 2 frappe.call() per item (Item master + Tax Template)
- Calls are sequential, not parallel
- Each ~100-500ms depending on network

### Optimization Opportunities
1. **Cache Item Data** - Store fetched item/template data
2. **Batch Calls** - For multi-item invoices
3. **Parallel Fetch** - Item + Template simultaneously

### Current Behavior
- Single item edit → 2 API calls
- 10 items → potentially 20 API calls (if no cache)
- Acceptable for normal workflow, consider optimization for bulk operations

---

## Migration Path

### From Normal to 3rd Schedule
```javascript
// Before: Normal calculation on rate
rate = 100, qty = 5
total = 100 × 5 = 500

// After: 3rd Schedule calculation on notified price
custom_fixed_notified_value = 100
qty = 5
total = 104.27 × 5 = 521.35  // Includes ST + FT
```

### Data Requirements
1. Set `custom_tax_classification = "3rd Schedule Goods"` on items
2. Populate `custom_fixed_notified_value` and `custom_retail_price`
3. Link tax template with ST and FT rates
4. Next edit → automatic 3rd Schedule calculation

### Rollback
Simply change `custom_tax_classification` to anything else (e.g., "Regular")
- Next edit → normal calculation resumes

---

## Compliance

### Pakistani Tax Law - 3rd Schedule
- ✓ Goods with government-notified fixed prices
- ✓ ST calculated on notified/retail price (inclusive)
- ✓ Reverse calculation to extract ST from inclusive price
- ✓ Further tax applies to ex-tax amount only
- ✓ Scope: Sales invoices to unregistered customers

### Implementation Compliance
- ✓ All 3rd Schedule items must use this function (no exceptions)
- ✓ No manual overrides allowed (per law)
- ✓ Tax amounts must match reverse formula exactly
- ✓ Audit trail via console logs (for compliance review)


