import frappe
# Functions in this will run when app will first install


def create_party_type(party_type, account_type):
    """
    This will create new party types in ERPNext 15 for Tax Purposes or
    simply better reporting.
    """
    try:
        
        
        doc = frappe.get_doc({
            "doctype": "Party Type",
            "party_type": party_type,
            "account_type": account_type
        })
        doc.insert()
        frappe.db.commit()
        frappe.msgprint(f"Party Type '{party_type}' created successfully.")
    except Exception as e:
        frappe.log_error(f"Error creating Party Type {party_type}: {str(e)}", "Party Type Creation Error")

