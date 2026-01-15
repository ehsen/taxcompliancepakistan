# Tax Account Fetching Logic - Updated Implementation

## Overview
The taxation system has been refactored to fetch tax accounts from item tax templates using a hierarchical lookup based on tax classification, instead of pulling from company master records.

## Hierarchical Lookup Flow

### For Tax Accounts (Sales Tax, Further Tax):

```
Step 1: Check Sales Invoice Item Row
├─ Look for: custom_tax_classification field
├─ If Found → Proceed to Step 3
└─ If NOT Found → Proceed to Step 2

Step 2: Check Item Master
├─ Fetch Item document
├─ Look for: custom_tax_classification field
├─ If Found → Proceed to Step 3
└─ If NOT Found → No tax accounts (skip tax calculation)

Step 3: Fetch FBR Transaction Type
├─ Fetch FBR Transaction Type doc using the custom_tax_classification value
├─ Look for: tax_template field
├─ If Found → Proceed to Step 4
└─ If NOT Found → No tax accounts (skip tax calculation)

Step 4: Extract Accounts from Tax Template
├─ Fetch Item Tax Template document
├─ Loop through taxes table and extract:
│  ├─ Sales Tax: account_head where custom_tax_category = "Sales Tax"
│  ├─ Further Tax: account_head where custom_tax_category = "Further Sales Tax"
│  └─ 236G: account_head where custom_tax_category = "236G"
└─ Return accounts for use in invoice taxes table
```

## Key Functions

### 1. `get_tax_accounts_for_row(row, frm, callback)`
**Purpose**: Main entry point for fetching tax accounts for a specific invoice item row.

**Logic**:
- Checks row-level `custom_tax_classification` first
- Falls back to item master's `custom_tax_classification`
- Uses FBR Transaction Type to get the tax template
- Extracts accounts from the template

**Parameters**:
- `row`: Sales Invoice item row object
- `frm`: Form object
- `callback(accounts)`: Returns object with `sales_tax_account`, `further_tax_account`, `advance_tax_account`

### 2. `fetch_tax_template_from_fbr_type(fbr_type_name, callback)`
**Purpose**: Fetches the tax template reference from an FBR Transaction Type document.

**Parameters**:
- `fbr_type_name`: Name of the FBR Transaction Type
- `callback(template_name)`: Returns the tax template name or null

### 3. `extract_accounts_from_template(template_name, callback)`
**Purpose**: Extracts account heads from an Item Tax Template's detail rows.

**Logic**:
- Fetches the Item Tax Template
- Loops through the taxes table
- Matches `custom_tax_category` values:
  - "Sales Tax" → `sales_tax_account`
  - "Further Sales Tax" → `further_tax_account`
  - "236G" → `advance_tax_account`
- Returns all three account heads

**Parameters**:
- `template_name`: Name of the Item Tax Template
- `callback(accounts)`: Returns object with account heads

### 4. `get_advance_tax_from_template_for_row(row, frm, callback)`
**Purpose**: Fetches 236G (Advance Tax) information using the same hierarchical logic.

**Logic**:
- Similar to `get_tax_accounts_for_row` but specifically for 236G tax
- Returns `advance_tax_rate` and `advance_tax_account`

### 5. `extract_advance_tax_from_template(template_name, frm, callback)`
**Purpose**: Extracts 236G tax details from an Item Tax Template.

**Returns**:
- `advance_tax_rate`: The tax rate for 236G
- `advance_tax_account`: The account head for 236G

## Tax Calculation in `apply_tax_summary()`

1. **Calculate Total Taxes**: Sum all `custom_st`, `custom_further_tax` from items
2. **Get First Item with Taxes**: Find the first item that has calculated taxes
3. **Fetch Accounts**: Get tax accounts using hierarchical lookup for that item
4. **Create Tax Rows**: Add rows to invoice taxes table:
   - Sales Tax row if: `total_st > 0` AND `sales_tax_account` exists
   - Further Tax row if: `total_further_tax > 0` AND `further_tax_account` exists
   - 236G row if applicable based on document type

## Benefits of This Approach

✅ **Flexible**: Different items can use different tax classifications and accounts
✅ **Hierarchical**: Supports both row-level and item-level customization
✅ **Centralized**: Tax configuration managed in FBR Transaction Type and Item Tax Template
✅ **Accurate**: Accounts tied directly to tax categories, avoiding mismatches
✅ **Maintainable**: Clear separation of concerns and easy debugging

## Debugging

All functions include detailed console logging with prefixes:
- `[get_tax_accounts_for_row]`: Row-level account lookup
- `[fetch_tax_template_from_fbr_type]`: FBR type fetch operations
- `[extract_accounts_from_template]`: Template account extraction
- `[apply_tax_summary]`: Tax summary calculation
- `[calculate_row_tax_totals]`: Tax total aggregation

### Example Console Output:
```
[get_tax_accounts_for_row] Starting account lookup for item: ITEM-001
[get_tax_accounts_for_row] Row custom_tax_classification: Standard Rated
[fetch_tax_template_from_fbr_type] Fetching FBR type: Standard Rated
[fetch_tax_template_from_fbr_type] Found tax template: STD-TAX-TEMPLATE-01
[extract_accounts_from_template] Fetching accounts from template: STD-TAX-TEMPLATE-01
[extract_accounts_from_template] Row 0: Sales Tax account = 221101
[apply_tax_summary] Added Sales Tax row: 50.00 to account 221101
```

## Configuration Requirements

For the system to work, ensure:

1. **Item Master**: Has `custom_tax_classification` field filled (e.g., "Standard Rated", "Zero Rated", etc.)
2. **FBR Transaction Type**: Exists with matching name and has `tax_template` field populated
3. **Item Tax Template**: Exists and contains:
   - Taxes table with multiple rows
   - Each row has `custom_tax_category` ("Sales Tax", "Further Sales Tax", "236G")
   - Each row has `account_head` or `tax_account` field with GL account code

## Example Data Structure

```
Item: ITEM-001
├─ custom_tax_classification: "Standard Rated"

FBR Transaction Type: "Standard Rated"
├─ tax_template: "STD-TAX-TEMPLATE-01"

Item Tax Template: "STD-TAX-TEMPLATE-01"
├─ taxes[0]:
│  ├─ custom_tax_category: "Sales Tax"
│  └─ account_head: "221101"
├─ taxes[1]:
│  ├─ custom_tax_category: "Further Sales Tax"
│  └─ account_head: "221102"
└─ taxes[2]:
   ├─ custom_tax_category: "236G"
   └─ account_head: "171301"
```
