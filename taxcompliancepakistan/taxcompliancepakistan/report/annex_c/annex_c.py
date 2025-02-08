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
        {"label": "Further Tax", "fieldname": "further_tax", "fieldtype": "Currency", "width": 120}
    ]
    
    conditions = {"docstatus": 1}
    if filters.get("from_date") and filters.get("to_date"):
        conditions["posting_date"] = ["between", [filters["from_date"], filters["to_date"]]]
    if filters.get("company"):
        conditions["company"] = filters["company"]
    
    data = []
    sales_invoices = frappe.get_all("Sales Invoice", filters=conditions, fields=[
        "name", "customer", "customer_name", "tax_category", "posting_date", "company_address"
    ])
    
    for invoice in sales_invoices:
        company_address_list = frappe.get_list('Address', filters={'is_your_company_address': 1, 'address_type': 'Billing'}, fields=['address_line1', 'city', 'state', 'country', 'phone','custom_province'])
        company_address = company_address_list[0] if company_address_list else None
        company_province = company_address.get('custom_province')
        customer_doc = frappe.get_doc("Customer",invoice.customer)
        customer_address_doc = frappe.get_doc("Address",customer_doc.customer_primary_address)
        customer_tax_id = None
        if customer_doc.tax_category == "Registered":
             customer_tax_id = customer_doc.tax_id
        elif customer_doc.tax_category == "Unregistered":
             customer_tax_id = customer_doc.custom_cnic_no
        
        
        customer_province = customer_address_doc.custom_province
        
        
        items = frappe.get_all("Sales Invoice Item", filters={"parent": invoice.name}, fields=[
            "item_code", "description", "tax_classification", "customer_sales_tax_rate", "qty", "uom", "amount", "custom_further_tax",
            "custom_hs_code","item_group"
        ])
        
        for item in items:
            data.append({
                "customer_tax_id": frappe.get_value("Customer", invoice.customer, "tax_id"),
                "customer_name": invoice.customer,
                "tax_category": invoice.customer_st_status,
                "supplier_province": company_province,
                "customer_province": customer_province,
                "doc_type": "Sales Invoice",
                "doc_name": invoice.name,
                "posting_date": invoice.posting_date,
                "hs_code": frappe.get_cached_doc("Customs Tariff Number",item.get('custom_hs_code')).custom_complete_description or None,
                "tax_classification": item['item_group'],
                "sales_tax_rate": item["customer_st_rate"],
                "qty": item["qty"],
                "uom": item["uom"],
                "amount": item["amount"],
                "further_tax": item["custom_further_tax"]
            })
    
    return columns, data
