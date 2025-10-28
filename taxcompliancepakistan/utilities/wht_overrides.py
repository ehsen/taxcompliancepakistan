import frappe
from frappe.model.document import Document
from collections import defaultdict

def calculate_withholding_tax(payment_entry):

    # Initialize default_wht_template to None
    default_wht_template = None
    
    # Only apply WHT logic for Supplier/Customer payments. Skip for Employee and others.
    if getattr(payment_entry, "party_type", None) not in ("Supplier", "Customer"):
        return

    if payment_entry.party_type == "Supplier":
        supplier = frappe.get_doc("Supplier", payment_entry.party)
        default_wht_template = supplier.get("custom_default_wht_template")

    # Populate missing WHT section in references using default template (if any)
    for ref in payment_entry.references:
        if (
            ref.reference_doctype == "Purchase Invoice"
            and not ref.custom_wht_section
            and default_wht_template
        ):
            ref.custom_wht_section = default_wht_template

    wht_sections = get_wht_sections_map(payment_entry)
    wht_summary = defaultdict(float)

    for ref in payment_entry.references:
        if ref.reference_doctype not in ("Purchase Invoice", "Sales Invoice"):
            continue

        section_name = ref.custom_wht_section
        if not section_name:
            continue

        section = wht_sections.get(section_name)
        if not section:
            continue

        # Guard against missing custom field on variants like EmployeePaymentEntry
        fbr_status = getattr(payment_entry, "custom_party_fbr_status", None)
        
        rate = get_applicable_rate(section, fbr_status)
        if not rate:
            continue

        wht_amount = ref.allocated_amount * (rate / 100.0)
        ref.custom_wht_amount = wht_amount
        ref.custom_wht_rate = rate or 0

        wht_summary[section_name] += wht_amount

    update_advance_taxes_and_charges(payment_entry, wht_summary, wht_sections, payment_entry.payment_type)

def get_wht_sections_map(payment_entry):
    section_names = {ref.custom_wht_section for ref in payment_entry.references
                     if ref.custom_wht_section and ref.reference_doctype in ("Purchase Invoice", "Sales Invoice")}
    
    if not section_names:
        return {}

    sections = frappe.get_all(
        "WHT Sections",
        filters={"name": ["in", list(section_names)]},
        fields=["name", "account_head", "tax_receivable_account_head", "active_tax_payer_rate", "inactive_tax_payer_rate"]
    )

    return {section.name: section for section in sections}

def get_applicable_rate(section, fbr_status):
    if fbr_status == "Active":
        return section.active_tax_payer_rate
    elif fbr_status == "InActive":
        return section.inactive_tax_payer_rate
    return 0

def update_advance_taxes_and_charges(doc, wht_summary, sections_map, payment_type):
    doc.set("taxes", [])  # Clear existing rows if any
    
    for section_name, total_wht in wht_summary.items():
        section = sections_map.get(section_name)
        if not section:
            continue

        account_head = section.tax_receivable_account_head if payment_type == "Pay" else section.account_head

        tax_row = doc.append("taxes", {})
        tax_row.charge_type = "Actual"
        tax_row.add_deduct_tax = "Deduct"
        tax_row.account_head = account_head
        tax_row.description = section_name
        tax_row.tax_amount = int(total_wht)


## Hooks that will be executed when a payment entry is saved

def on_payment_entry_update(doc, method):
    if doc.doctype != "Payment Entry":
        return

    calculate_withholding_tax(doc)
    doc.calculate_taxes()
    