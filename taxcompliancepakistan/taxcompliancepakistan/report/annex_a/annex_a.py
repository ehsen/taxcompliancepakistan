import frappe
from frappe.utils import flt

def execute(filters=None):
    columns = [
        {"label": "Registration No", "fieldname": "supplier_tax_id", "fieldtype": "Data", "width": 150},
        {"label": "Supplier Name", "fieldname": "supplier_name", "fieldtype": "Data", "width": 200},
        {"label": "Type", "fieldname": "tax_category", "fieldtype": "Data", "width": 100},
        {"label": "Purchase Origination Province", "fieldname": "supplier_province", "fieldtype": "Data", "width": 150},
        {"label": "Destination of Supply", "fieldname": "company_province", "fieldtype": "Data", "width": 150},
        {"label": "Document Type", "fieldname": "doc_type", "fieldtype": "Data", "width": 120},
        {"label": "Invoice Number", "fieldname": "doc_name", "fieldtype": "Data", "width": 150},
        {"label": "Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
        {"label": "HS Code Description", "fieldname": "hs_code", "fieldtype": "Data", "width": 150},
        {"label": "Purchase Type", "fieldname": "tax_classification", "fieldtype": "Data", "width": 120},
        {"label": "Rate", "fieldname": "sales_tax_rate", "fieldtype": "Percent", "width": 100},
        {"label": "Qty", "fieldname": "qty", "fieldtype": "Float", "width": 100},
        {"label": "UOM", "fieldname": "uom", "fieldtype": "Data", "width": 100},
        {"label": "Value Excl. Sales Tax", "fieldname": "amount", "fieldtype": "Currency", "width": 150},
        {"label": "Sales Tax/ FED in ST Mode", "fieldname": "st_amount", "fieldtype": "Currency", "width": 150},
        {"label": "Fixed / notified value or Retail Price / Higher of actual and minimum fixed value of supplies", "fieldname": "fixed_notified_rate", "fieldtype": "Currency", "width": 150},
        {"label": "Extra Tax", "fieldname": "extra_tax", "fieldtype": "Currency", "width": 100},
        {"label": "Further Tax", "fieldname": "further_tax", "fieldtype": "Currency", "width": 120},
        {"label": "Total Value of Sales (In case of PFAD only)", "fieldname": "total_value_of_sales_pfad_only", "fieldtype": "Currency", "width": 120},
        {"label": "ST Withheld at Source", "fieldname": "st_wh_at_source", "fieldtype": "Currency", "width": 120},
        {"label": "Exemption SRO No./ Schedule No.", "fieldname": "exemption_sro_schedule", "fieldtype": "Data", "width": 120},
        {"label": "Exemption Item S. No.", "fieldname": "exemption_item_sr_no", "fieldtype": "Data", "width": 100}
    ]
    
    conditions = {"docstatus": 1,"custom_purchase_invoice_type":"Local Purchase"}
    if filters.get("from_date") and filters.get("to_date"):
        conditions["posting_date"] = ["between", [filters["from_date"], filters["to_date"]]]
    if filters.get("company"):
        conditions["company"] = filters["company"]
    
    data = []
    purchase_invoices = frappe.get_all("Purchase Invoice", filters=conditions, fields=[
        "name", "supplier", "supplier_name", "tax_category", "posting_date", "billing_address",
        "is_return"
    ])
    
    for invoice in purchase_invoices:
        company_address_list = frappe.get_list('Address', filters={'is_your_company_address': 1, 'address_type': 'Billing'}, fields=['custom_province'])
        company_province = company_address_list[0].get('custom_province') if company_address_list else None
        
        supplier_doc = frappe.get_doc("Supplier", invoice.supplier)
        supplier_address_doc = frappe.get_doc("Address", supplier_doc.supplier_primary_address)
        supplier_province = supplier_address_doc.custom_province
        supplier_tax_id = supplier_doc.tax_id if supplier_doc.tax_category == "Registered" else supplier_doc.custom_cnic_no
        is_return = invoice.get('is_return')
        
        items = frappe.get_all("Purchase Invoice Item", filters={"parent": invoice.name}, fields=[
            "custom_hs_code", "item_group", "custom_st_rate", "qty", "uom", "amount", "custom_further_tax", "custom_st"
        ])
        
        grouped_items = {}
        for item in items:
            hs_code = item["custom_hs_code"]
            if hs_code not in grouped_items:
                grouped_items[hs_code] = {
                    "qty": 0, "amount": 0, "further_tax": 0, "st_amount": 0, "sales_tax_rate": item["custom_st_rate"],
                    "uom": item["uom"], "tax_classification": item["item_group"]
                }
            
            grouped_items[hs_code]["qty"] += flt(item["qty"])
            grouped_items[hs_code]["amount"] += flt(item["amount"])
            grouped_items[hs_code]["further_tax"] += flt(item["custom_further_tax"])
            grouped_items[hs_code]["st_amount"] += flt(item["custom_st"])
        
        for hs_code, values in grouped_items.items():
            if hs_code is not None:
                item_hs_code_doc = frappe.get_doc("Customs Tariff Number", hs_code)
                fbr_desc = f"{item_hs_code_doc.tariff_number}: {item_hs_code_doc.custom_complete_description}"
            else:
                
                fbr_desc = "Missing HS Code"
            doc_type = "Debit Note" if is_return==1 else "Purchase Invoice"
            data.append({
                "supplier_tax_id": supplier_tax_id,
                "supplier_name": invoice.supplier,
                "tax_category": supplier_doc.tax_category,
                "supplier_province": supplier_province,
                "company_province": company_province,
                "doc_type": doc_type,
                "doc_name": invoice.name,
                "posting_date": invoice.posting_date,
                "hs_code": fbr_desc,
                "tax_classification": values["tax_classification"],
                "sales_tax_rate": values["sales_tax_rate"],
                "qty": abs(values["qty"]),
                "uom": values["uom"],
                "amount": abs(values["amount"]),
                "further_tax": abs(values["further_tax"]),
                "st_amount": abs(values["st_amount"])
            })
    
    return columns, data
