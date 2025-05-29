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
    further_tax_account = company.get("custom_vat_input") or ""
    freight_account = company.get("custom_default_freight_expense_account") or ""
    cost_center = company.get("default_cost_center") or ""

    # Build tax summary
    tax_summary = []

    if sales_tax_total and sales_tax_account:
        tax_summary.append({
            "charge_type": "Actual",
            "account_head": sales_tax_account,
            "description": "Sales Tax (Item Level)",
            "tax_amount": multiplier * sales_tax_total,
            "custom_tax_category": "Sales Tax",
            "tax_category": "Sales Tax"
        })

    if further_tax_total and further_tax_account:
        tax_summary.append({
            "charge_type": "Actual",
            "account_head": further_tax_account,
            "description": "Further Tax (Item Level)",
            "tax_amount": multiplier * further_tax_total,
            "custom_tax_category": "Further Sales Tax",
            "tax_category": "Further Sales Tax"
        })

    # 236G Advance Tax from template
    advance_tax = 0
    advance_tax_account = ""
    advance_tax_rate = 0

    if doc.custom_tax_template:
        template_doctype = "Sales Taxes and Charges Template" if doc.doctype == "Sales Invoice" else "Purchase Taxes and Charges Template"
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
            "cost_center":cost_center
        })
    
    # Freight Handling
    if doc.custom_freight_rule == "Paid By Customer" and flt(doc.custom_freight_amount) > 0 and freight_account:
        tax_summary.append({
            "charge_type": "Actual",
            "account_head": freight_account,
            "description": "Freight (Paid by Customer)",
            "tax_amount": flt(doc.custom_freight_amount),
            "custom_tax_category": "Freight",
            "tax_category": "Freight",
            'cost_center':cost_center
        })

    # Apply tax summary to doc
    doc.set("taxes", [])
    for row in tax_summary:
        doc.append("taxes", row)

    return tax_summary

def sales_invoice_on_update(doc, method=None):
    if isinstance(doc, str):
        doc = frappe.get_doc("Sales Invoice", doc)
        

    apply_item_level_tax_summary(doc)
    doc.calculate_taxes_and_totals()
    #doc.save(ignore_permissions=True)  # Optional: if needed to persist changes


def purchase_invoice_on_update(doc, method=None):
    if isinstance(doc, str):
        doc = frappe.get_doc("Purchase Invoice", doc)

    apply_item_level_tax_summary(doc)
    doc.calculate_taxes_and_totals()
    #doc.save(ignore_permissions=True)
