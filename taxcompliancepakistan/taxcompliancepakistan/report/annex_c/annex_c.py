import frappe
from frappe.utils import flt,fmt_money

def execute(filters=None):
    # ----------------------------
    # Columns
    # ----------------------------
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
        {"label": "Exemption Item S. No.", "fieldname": "exemption_item_sr_no", "fieldtype": "Data", "width": 100}
    ]

    # ----------------------------
    # Filters
    # ----------------------------
    conditions = {"docstatus": 1}
    if filters.get("from_date") and filters.get("to_date"):
        conditions["posting_date"] = ["between", [filters["from_date"], filters["to_date"]]]
    if filters.get("company"):
        conditions["company"] = filters["company"]

    # ----------------------------
    # Pre-fetch data
    # ----------------------------
    sales_invoices = frappe.get_all(
        "Sales Invoice",
        filters=conditions,
        fields=[
            "name", "customer", "tax_category", "posting_date",
            "custom_customer_st_status", "is_return"
        ]
    )

    if not sales_invoices:
        return columns, [], None, None, []

    invoice_names = [inv.name for inv in sales_invoices]
    customer_names = list({inv.customer for inv in sales_invoices})

    # Company province (fetched once)
    company_province = None
    company_address_list = frappe.get_all(
        'Address',
        filters={'is_your_company_address': 1, 'address_type': 'Billing'},
        fields=['custom_province'],
        limit=1
    )
    if company_address_list:
        company_province = company_address_list[0].custom_province

    # Fetch customers
    customers = frappe.get_all(
        "Customer",
        filters={"name": ["in", customer_names]},
        fields=["name", "tax_id", "custom_cnic_no", "tax_category", "customer_primary_address"]
    )
    customer_map = {c.name: c for c in customers}

    # Fetch addresses for customers
    address_names = [c.customer_primary_address for c in customers if c.customer_primary_address]
    addresses = frappe.get_all(
        "Address",
        filters={"name": ["in", address_names]},
        fields=["name", "custom_province"]
    )
    address_map = {a.name: a for a in addresses}

    # Fetch items for all invoices
    items = frappe.get_all(
        "Sales Invoice Item",
        filters={"parent": ["in", invoice_names]},
        fields=[
            "parent", "custom_hs_code", "item_group",
            "custom_st_rate", "qty", "uom", "amount",
            "custom_further_tax", "custom_st"
        ]
    )

    # Fetch HS code descriptions in bulk
    hs_codes = list({i.custom_hs_code for i in items if i.custom_hs_code})
    hs_code_docs = frappe.get_all(
        "Customs Tariff Number",
        filters={"name": ["in", hs_codes]},
        fields=["name", "tariff_number", "custom_complete_description"]
    )
    hs_map = {h.name: f"{h.tariff_number}: {h.custom_complete_description}" for h in hs_code_docs}

    # ----------------------------
    # Build data rows
    # ----------------------------
    data = []
    for inv in sales_invoices:
        cust = customer_map.get(inv.customer)
        if not cust:
            continue

        cust_address = address_map.get(cust.customer_primary_address)
        customer_province = cust_address.custom_province if cust_address else None

        # Tax ID logic
        if cust.tax_category in ("Registered", "Registered Customers"):
            customer_tax_id = cust.tax_id
        else:
            customer_tax_id = cust.custom_cnic_no

        # Normalize tax category for FBR
        tax_category_value = inv.custom_customer_st_status
        if tax_category_value == "Registered Customers":
            tax_category_value = "Registered"

        doc_type = "Credit Note" if inv.is_return else "Sales Invoice"

        # Group items by HS code per invoice
        invoice_items = [it for it in items if it.parent == inv.name]
        grouped_items = {}
        for it in invoice_items:
            hs_code = None
            if it.custom_hs_code:
                try:
                    hs_code = frappe.get_cached_doc("Customs Tariff Number", it.custom_hs_code).description
                except frappe.DoesNotExistError:
                    hs_code = None
            
            if hs_code not in grouped_items:
                grouped_items[hs_code] = {
                    "qty": 0, "amount": 0, "further_tax": 0,
                    "st_amount": 0, "sales_tax_rate": it.custom_st_rate,
                    "uom": it.uom, "tax_classification": it.item_group
                }
            grouped_items[hs_code]["qty"] += flt(it.qty)
            grouped_items[hs_code]["amount"] += flt(it.amount)
            grouped_items[hs_code]["further_tax"] += flt(it.custom_further_tax)
            grouped_items[hs_code]["st_amount"] += flt(it.custom_st)

        for hs_code, values in grouped_items.items():
            fbr_desc = hs_map.get(hs_code, hs_code)
            data.append({
                "customer_tax_id": customer_tax_id,
                "customer_name": inv.customer,
                "tax_category": tax_category_value,
                "supplier_province": company_province,
                "customer_province": customer_province,
                "doc_type": doc_type,
                "doc_name": inv.name,
                "posting_date": inv.posting_date,
                "hs_code": fbr_desc,
                "tax_classification": values["tax_classification"],
                "sales_tax_rate": values["sales_tax_rate"],
                "qty": abs(values["qty"]),
                "uom": values["uom"],
                "amount": abs(values["amount"]),
                "further_tax": abs(values["further_tax"]),
                "st_amount": abs(values["st_amount"])
            })
    
        # Calculate totals
    total_qty = sum(d["qty"] for d in data)
    total_amount = sum(d["amount"] for d in data)
    total_further_tax = sum(d["further_tax"] for d in data)
    total_st_amount = sum(d["st_amount"] for d in data)

    # Append totals row
    
    """
    data.append({
        "customer_tax_id": "",
        "customer_name": "",
        "tax_category": "Total",
        "supplier_province": "",
        "customer_province": "",
        "doc_type": "",
        "doc_name": "",
        "posting_date": "",
        "hs_code": "",
        "tax_classification": "",
        "sales_tax_rate": "",
        "qty": total_qty,
        "uom": "",
        "amount": total_amount,
        "further_tax": total_further_tax,
        "st_amount": total_st_amount
        
    })
    """

    # ----------------------------
    # Report Totals (Summary Bar)
    # ----------------------------
    

    report_summary = [
        {"label": "Total Amount", "value": fmt_money(round(total_amount,0)), "indicator": "Green"},
        {"label": "Total ST Amount", "value": fmt_money(round(total_st_amount,0)), "indicator": "Blue"},
        {"label": "Total Further Tax", "value": fmt_money(round(total_further_tax,0)), "indicator": "Orange"}
    ]

    return columns, data, None, None, report_summary
