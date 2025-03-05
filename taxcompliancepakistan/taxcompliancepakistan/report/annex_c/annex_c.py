import frappe
from frappe.utils import flt

def execute(filters=None):
    columns = [
        {"label": "Registration No", "fieldname": "customer_tax_id", "fieldtype": "Data", "width": 150},
        {"label": "Customer Name", "fieldname": "customer_name", "fieldtype": "Data", "width": 200},
        {"label": "Type", "fieldname": "tax_category", "fieldtype": "Data", "width": 100},
        {"label": "Sale Origination Province", "fieldname": "supplier_province", "fieldtype": "Data", "width": 150},
        {"label": "Destination of Supply", "fieldname": "customer_province", "fieldtype": "Data", "width": 150},
        {"label": "Document Type", "fieldname": "doc_type", "fieldtype": "Data", "width": 120},
        {"label": "Invoice Number", "fieldname": "doc_name", "fieldtype": "Data", "width": 150},
        {"label": "Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
        {"label": "HS Code Description", "fieldname": "hs_code", "fieldtype": "Data", "width": 150},
        {"label": "Sale Type", "fieldname": "tax_classification", "fieldtype": "Data", "width": 120},
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
        {"label": "Exemption Item S. No.", "fieldname": "exemption_item_sr_no", "fieldtype": "Data", "width": 100},




    ]
    
    conditions = {"docstatus": 1}
    if filters.get("from_date") and filters.get("to_date"):
        conditions["posting_date"] = ["between", [filters["from_date"], filters["to_date"]]]
    if filters.get("company"):
        conditions["company"] = filters["company"]
    
    data = []
    sales_invoices = frappe.get_all("Sales Invoice", filters=conditions, fields=[
        "name", "customer", "customer_name", "tax_category", "posting_date", "company_address",
        "custom_customer_st_status","is_return"
    ])
    for invoice in sales_invoices:
        company_address_list = frappe.get_list('Address', filters={'is_your_company_address': 1, 'address_type': 'Billing'}, fields=['custom_province'])
        company_province = company_address_list[0].get('custom_province') if company_address_list else None
        
        customer_doc = frappe.get_doc("Customer", invoice.customer)
        customer_address_doc = frappe.get_doc("Address", customer_doc.customer_primary_address)
        customer_province = customer_address_doc.custom_province
        customer_tax_id = customer_doc.tax_id if customer_doc.tax_category == "Registered" else customer_doc.custom_cnic_no
        is_return = invoice.get('is_return')
        items = frappe.get_all("Sales Invoice Item", filters={"parent": invoice.name}, fields=[
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
            item_hs_code_doc = frappe.get_doc("Customs Tariff Number", hs_code)
            fbr_desc = f"{item_hs_code_doc.tariff_number}: {item_hs_code_doc.custom_complete_description}"
            doc_type = "Credit Note" if is_return==1 else "Sales Invoice"
            data.append({
                "customer_tax_id": customer_tax_id,
                "customer_name": invoice.customer,
                "tax_category": invoice.custom_customer_st_status,
                "supplier_province": company_province,
                "customer_province": customer_province,
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
