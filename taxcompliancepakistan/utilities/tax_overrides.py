import frappe
from frappe.utils import flt
from frappe.model.document import Document

@frappe.whitelist()
def apply_item_level_tax_summary(doc):
    """
    Based on item-level tax fields (already calculated), apply tax summary 
    to the `taxes` child table. This includes Sales Tax, Further Tax, and Advance Tax (236G).
    """

    sales_tax_total = 0
    further_tax_total = 0
    total_inclusive = 0
    multiplier = -1 if doc.get("is_return") else 1

    for item in doc.get("items", []):
        sales_tax_total += flt(item.custom_st)
        further_tax_total += flt(item.custom_further_tax)
        total_inclusive += flt(item.custom_total_incl_tax)

    # Get account heads from Company
    company = frappe.get_doc("Company", doc.company)
    sales_tax_account = company.get("custom_vat_input") or ""
    further_tax_account = company.get("custom_further_sales_tax_account") or ""
    freight_account = company.get("custom_default_freight_expense_account") or ""
    freight_on_purchase_account = company.get("custom_freight_on_purchase_account") or ""
    cost_center = company.get("cost_center") or ""

    # Build tax summary, removing decimal places from tax amounts
    tax_summary = []

    if sales_tax_total and sales_tax_account:
        tax_summary.append({
            "charge_type": "Actual",
            "account_head": sales_tax_account,
            "description": "Sales Tax (Item Level)",
            "tax_amount": multiplier * sales_tax_total,
            "custom_tax_category": "Sales Tax",
            "tax_category": "Sales Tax",
            "category":"Total",
            "add_deduct_tax":"Add"
        })

    if further_tax_total and further_tax_account:
        tax_summary.append({
            "charge_type": "Actual",
            "account_head": further_tax_account,
            "description": "Further Tax (Item Level)",
            "tax_amount": multiplier * further_tax_total,
            "custom_tax_category": "Further Sales Tax",
            "tax_category": "Further Sales Tax",
            "category":"Total",
            "add_deduct_tax":"Add"
        })

    # 236G Advance Tax from template - Only for Sales Invoice, not Purchase Invoice
    advance_tax = 0
    advance_tax_account = ""
    advance_tax_rate = 0

    if doc.doctype == "Sales Invoice" and doc.custom_tax_template:
        template_doctype = "Sales Taxes and Charges Template"
        template = frappe.get_doc(template_doctype, doc.custom_tax_template)
        for row in template.get("taxes", []):
            if row.custom_tax_category == "236G":
                advance_tax_rate = flt(row.rate)
                advance_tax_account = row.account_head
                break

        if advance_tax_rate and advance_tax_account:
            advance_tax = advance_tax_rate * 0.01 * total_inclusive
            tax_summary.append({
                "charge_type": "Actual",
                "account_head": advance_tax_account,
                "description": "Advance Income Tax (236G)",
                "tax_amount": multiplier * advance_tax,
                "custom_tax_category": "236G",
                "tax_category": "236G",
                "cost_center":cost_center,
                "category":"Total",
                "add_deduct_tax":"Add"
            })
    
    # Preserve manually added 236G rows for Purchase Invoice
    if doc.doctype == "Purchase Invoice":
        for tax_row in doc.get("taxes", []):
            if tax_row.custom_tax_category == "236G":
                tax_summary.append({
                    "charge_type": tax_row.charge_type,
                    "account_head": tax_row.account_head,
                    "description": tax_row.description,
                    "tax_amount": tax_row.tax_amount,
                    "custom_tax_category": tax_row.custom_tax_category,
                    "tax_category": tax_row.tax_category,
                    "cost_center": tax_row.cost_center or cost_center,
                    "category": tax_row.category or "Total",
                    "add_deduct_tax": tax_row.add_deduct_tax or "Add",
                    "rate": tax_row.rate
                })
    
    # Freight Handling
    if doc.doctype == "Sales Invoice":
        if doc.custom_freight_rule == "Paid By Customer" and flt(doc.custom_freight_amount) > 0 and freight_account:
            tax_summary.append({
                "charge_type": "Actual",
                "account_head": freight_account,
                "description": "Freight (Paid by Customer)",
                "tax_amount": int(flt(doc.custom_freight_amount)),
                "custom_tax_category": "Freight",
                "tax_category": "Freight",
                'cost_center':cost_center
            })
    elif doc.doctype == "Purchase Invoice":
        if flt(doc.custom_freight_amount) > 0 and freight_on_purchase_account:
            tax_summary.append({
                "charge_type": "Actual",
                "account_head": freight_on_purchase_account,
                "description": "Freight (Paid by {company_name})".format(company_name=doc.name),
                "tax_amount": int(flt(doc.custom_freight_amount)),
                "custom_tax_category": "Freight",
                "tax_category": "Freight",
                'cost_center':cost_center,
                "category":"Total",
                "add_deduct_tax":"Add"
            })

    # Apply tax summary to doc
    doc.set("taxes", [])
    for row in tax_summary:
        doc.append("taxes", row)

    return tax_summary

def sales_invoice_on_update(doc, method=None):
    
        apply_item_level_tax_summary(doc)
        doc.calculate_taxes_and_totals()
    #doc.save(ignore_permissions=True)  # Optional: if needed to persist changes


def purchase_invoice_on_update(doc, method=None):
        
    apply_item_level_tax_summary(doc)
    doc.calculate_taxes_and_totals()
    #doc.save(ignore_permissions=True)


def payment_entry_build_gl_map(doc, method=None):
    """
    Override for Payment Entry build_gl_map function.
    Fixes the issue where bank entries include tax amounts, causing debit/credit mismatch.
    
    Solution:
    1. Bank entries are reduced by tax amounts (clean bank entries)
    2. Tax counter entries are NOT created (avoid double-counting)
    3. Tax amounts are only accounted in tax accounts
    """
    import erpnext
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_account_currency
    from frappe.utils import flt
    
    if doc.payment_type in ("Receive", "Pay") and not doc.get("party_account_field"):
        doc.setup_party_account_field()

    company_currency = erpnext.get_company_currency(doc.company)
    if doc.paid_from_account_currency != company_currency:
        doc.currency = doc.paid_from_account_currency
    elif doc.paid_to_account_currency != company_currency:
        doc.currency = doc.paid_to_account_currency

    gl_entries = []
    doc.add_party_gl_entries(gl_entries)
    
    # Custom bank GL entries - reduced by tax amounts
    if doc.payment_type in ("Pay", "Internal Transfer"):
        # Reduce bank entry by tax amount to balance with tax entries
        bank_amount = flt(doc.paid_amount) - flt(doc.total_taxes_and_charges)
        base_bank_amount = flt(doc.base_paid_amount) - flt(doc.base_total_taxes_and_charges)
        
        gl_entries.append(
            doc.get_gl_dict(
                {
                    "account": doc.paid_from,
                    "account_currency": doc.paid_from_account_currency,
                    "against": doc.party if doc.payment_type == "Pay" else doc.paid_to,
                    "credit_in_account_currency": bank_amount,
                    "credit": base_bank_amount,
                    "cost_center": doc.cost_center,
                    "post_net_value": True,
                },
                item=doc,
            )
        )
        
    if doc.payment_type in ("Receive", "Internal Transfer"):
        # Reduce bank entry by tax amount to balance with tax entries
        bank_amount = flt(doc.received_amount) - flt(doc.total_taxes_and_charges)
        base_bank_amount = flt(doc.base_received_amount) - flt(doc.base_total_taxes_and_charges)
        
        gl_entries.append(
            doc.get_gl_dict(
                {
                    "account": doc.paid_to,
                    "account_currency": doc.paid_to_account_currency,
                    "against": doc.party if doc.payment_type == "Receive" else doc.paid_from,
                    "debit_in_account_currency": bank_amount,
                    "debit": base_bank_amount,
                    "cost_center": doc.cost_center,
                },
                item=doc,
            )
        )
    
    doc.add_deductions_gl_entries(gl_entries)
    
    # Custom tax GL entries - only tax account entries, NO counter entries
    for d in doc.get("taxes"):
        account_currency = get_account_currency(d.account_head)
        if account_currency != doc.company_currency:
            frappe.throw(frappe._("Currency for {0} must be {1}").format(d.account_head, doc.company_currency))

        if doc.payment_type in ("Pay", "Internal Transfer"):
            dr_or_cr = "debit" if d.add_deduct_tax == "Add" else "credit"
            against = doc.party or doc.paid_from
        elif doc.payment_type == "Receive":
            dr_or_cr = "credit" if d.add_deduct_tax == "Add" else "debit"
            against = doc.party or doc.paid_to

        tax_amount = d.tax_amount
        base_tax_amount = d.base_tax_amount

        # Add tax account entry only - NO counter entry
        gl_entries.append(
            doc.get_gl_dict(
                {
                    "account": d.account_head,
                    "against": against,
                    dr_or_cr: tax_amount,
                    dr_or_cr + "_in_account_currency": base_tax_amount
                    if account_currency == doc.company_currency
                    else d.tax_amount,
                    "cost_center": d.cost_center,
                    "post_net_value": True,
                },
                account_currency,
                item=d,
            )
        )
    
    # Add regional GL entries
    from erpnext.accounts.doctype.payment_entry.payment_entry import add_regional_gl_entries
    add_regional_gl_entries(gl_entries, doc)
    
    return gl_entries
