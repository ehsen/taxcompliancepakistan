# 3rd Schedule Goods Implementation Checklist

## Pre-Requisites

### Item Master Fields (Custom Fields)
- [ ] `custom_tax_classification` (Data/String)
  - Direct string field (NOT a Link)
  - Value: "3rd Schedule Goods" (or other classification names)
  - This field determines if item uses 3rd Schedule reverse calculation
  
- [ ] `custom_fixed_notified_value` (Currency)
  - Notified/regulated price set by government
  
- [ ] `custom_retail_price` (Currency)
  - Actual selling/retail price

### Item Tax Template Configuration
- [ ] Create or update Item Tax Template with:
  - [ ] Sales Tax row with `custom_tax_category = "Sales Tax"`
  - [ ] Verify `tax_rate` field (e.g., 17)
  - [ ] Further Sales Tax row (optional) with `custom_tax_category = "Further Sales Tax"`

### Tax Classification Setup
- [ ] Set `custom_tax_classification` field on Items with value: "3rd Schedule Goods"
  - This is a simple string field, no separate doctype needed
  - You can use any classification names as needed

### Invoice Document Fields
- [ ] Verify `custom_customer_st_status` field exists (for further tax eligibility)
- [ ] Verify `custom_sales_tax_invoice` field exists
- [ ] Verify `custom_purchase_invoice_type` field exists (for Import exclusion)

---

## Code Integration

### File: taxation.js
- [x] ✅ `calculate_third_schedule_taxes()` function added (Line 192)
- [x] ✅ `handle_third_schedule_item_calculation()` function added (Line 421)
- [x] ✅ `apply_third_schedule_taxes_to_row()` function added (Line 505)
- [x] ✅ 3rd Schedule detection in `calculate_taxes()` added (Line 597)
- [x] ✅ Syntax validation passed (Node.js check)

### Custom Field Mappings
Ensure these custom fields exist on the Item doctype:

```
Item (doctype) - Custom Fields:
  - custom_tax_classification → Data/String field (e.g., "3rd Schedule Goods")
  - custom_fixed_notified_value → Currency field (₨ or your currency)
  - custom_retail_price → Currency field (₨ or your currency)
```

---

## Testing Workflow

### Step 1: Create Test Item (3rd Schedule)
```
Item Code: TEST-3RD-SCH-001
Item Name: Test 3rd Schedule Item
Item Group: Any (doesn't matter)
Default Unit: Pieces
custom_tax_classification: 3rd Schedule Goods [type this exact string]
custom_fixed_notified_value: 100.00
custom_retail_price: 95.00  (system will use MAX, so 100)
```

### Step 2: Create Item Tax Template
```
Item Tax Template: TEST-3RD-SCH-TAXES
Taxes Table:
  Row 1:
    - tax_rate: 17
    - tax_type: Select or enter (e.g., "Sales Tax")
    - custom_tax_category: Sales Tax
    - account_head: [your ST account]
  
  Row 2 (Optional for unregistered customers):
    - tax_rate: 5
    - custom_tax_category: Further Sales Tax
    - account_head: [your FT account]
```

Link template to Item:
```
Item (TEST-3RD-SCH-001):
  Item Tax: [Link TEST-3RD-SCH-TAXES]
```

### Step 3: Create Test Sales Invoice
```
Document Type: Sales Invoice
Company: Your Company
Customer: Unregistered Customer [if you want further tax]
  custom_customer_st_status: Unregistered

Items Table:
  - Item Code: TEST-3RD-SCH-001
  - Qty: 5
  - Rate: [any value - will be overridden by notified value]
  - Item Tax Template: TEST-3RD-SCH-TAXES
```

### Step 4: Verify Calculations

Open browser Developer Console (F12) and watch for logs:

```
[calculate_taxes] Detected 3rd Schedule Goods: TEST-3RD-SCH-001 - routing to dedicated handler
[handle_third_schedule_item_calculation] Processing 3rd Schedule item: TEST-3RD-SCH-001
[handle_third_schedule_item_calculation] Fetched item data: {
  custom_fixed_notified_value: 100,
  custom_retail_price: 95
}
[calculate_third_schedule_taxes] Starting 3rd Schedule calculation for item: TEST-3RD-SCH-001
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
  st: 72.65,        // 14.53 × 5 qty
  st_rate: 17,
  further_tax: 21.37,  // 85.47 × 5 × 5% (if unregistered)
  ft_rate: 5,
  ex_sales_tax_value: 85.47,
  total_incl_tax: 433.62  // (85.47 + 14.53) × 5 + further_tax
}
```

### Step 5: Expected Results

For item: Qty=5, Fixed=100, Retail=95, ST=17%, FT=5% (unregistered)

**Per Unit:**
- Taxable Base: 100 (MAX of 100 and 95)
- Extracted ST: 14.53
- Ex-ST Value: 85.47
- Further Tax: 4.27 (85.47 × 5%)
- Total: 104.27

**For Qty=5:**
- ST: 72.65 (14.53 × 5)
- Further Tax: 21.35 (4.27 × 5)
- Subtotal: 500
- **Total Invoice: 593.65**

---

## Troubleshooting

### Issue: Item not recognized as 3rd Schedule
**Solution**: 
1. Check if `custom_tax_classification` field exists on Item
2. Verify value is set and linked to correct classification
3. Check browser console for errors in `handle_third_schedule_item_calculation`
4. Ensure classification `.strip` property equals "3rd Schedule Goods"

### Issue: Taxes showing as 0
**Solution**:
1. Check if Tax Template is linked to item
2. Verify template has rows with `custom_tax_category` = "Sales Tax"
3. Verify `tax_rate` is not 0
4. Check console logs for "No tax template found" message

### Issue: Wrong calculated amounts
**Solution**:
1. Verify `custom_fixed_notified_value` and `custom_retail_price` are correct
2. Check currency precision in system settings (usually 2)
3. Review console logs for intermediate calculation values
4. Manually verify: `100 / 1.17 = 85.47` (for 17% ST)

### Issue: Further tax not applying
**Solution**:
1. Verify `custom_customer_st_status = "Unregistered"`
2. Check if Tax Template has "Further Sales Tax" row
3. Verify row has `custom_tax_category = "Further Sales Tax"`
4. Check if it's Sales Invoice (further tax only for SI, not PI)

---

## Deployment Steps

1. **Deploy taxation.js**
   - Place updated file in: `apps/taxcompliancepakistan/taxcompliancepakistan/public/js/js_overrides/taxation.js`
   
2. **Clear Browser Cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   
3. **Verify in ERPNext UI**
   - Create test invoice with 3rd Schedule item
   - Watch browser console for function calls
   
4. **Monitor in Production**
   - Check all 3rd Schedule items calculate correctly
   - Review console logs in multiple browsers/devices

---

## Documentation References

- **Full Details**: See `THIRD_SCHEDULE_REFACTORING.md`
- **Function Details**: 
  - `calculate_third_schedule_taxes()` - Core algorithm
  - `handle_third_schedule_item_calculation()` - Orchestration
  - `apply_third_schedule_taxes_to_row()` - UI update

---

## Sign-Off

- [ ] Code review completed
- [ ] Syntax validation passed
- [ ] Test invoice created and verified
- [ ] Documentation reviewed
- [ ] Deployed to production
- [ ] Verified in 2+ environments
- [ ] Monitoring enabled

**Deployment Date**: _________________
**Tested By**: _________________
**Approved By**: _________________

