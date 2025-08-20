/*
This will override erpnext default Purchase Invoice Item. We need a set pattern for 
tax purposes, this will calculate ST,AT, Further Tax and any other taxes as per needs.
*/

function get_company_tax_accounts(company_name, callback) {
    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Company",
            name: company_name
        },
        callback: function(res) {
            if (res.message) {
                callback({
                    sales_tax_account: res.message.custom_vat_input || "",
                    further_tax_account: res.message.custom_vat_input || "" // Same as ST
                });
            } else {
                callback({});
            }
        }
    });
}

function calculate_row_tax_totals(frm) {
    let total_st = 0;
    let total_further_tax = 0;
    let total_inclusive = 0;
    let precision = precision("currency");
    (frm.doc.items || []).forEach(row => {
        total_st += flt(row.custom_st || 0,precision);
        total_further_tax += flt(row.custom_further_tax || 0,precision);
        total_inclusive += flt(row.custom_total_incl_tax || 0,precision);
    });

    console.log(`[calculate_row_tax_totals] Total ST: ${total_st}, Total Further Tax: ${total_further_tax}, Total Inclusive: ${total_inclusive}`);
    console.log(`[calculate_row_tax_totals] Item details:`, frm.doc.items.map(item => ({
        item_code: item.item_code,
        custom_st: item.custom_st,
        custom_further_tax: item.custom_further_tax,
        custom_total_incl_tax: item.custom_total_incl_tax
    })));
    
    return { total_st, total_further_tax, total_inclusive };
}

function fetch_item_tax_template(row, callback) {
    if (row.item_tax_template) {
        console.log(`Returning item_tax_template directly: ${row.item_tax_template}`);
        callback(row.item_tax_template);
    } else {
        // Access it from the item group
        console.log(`Fetching item group for: ${row.item_group}`);
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Item Group",
                name: row.item_group
            },
            callback: function(response) {
                console.log(`Response from item group fetch:`, response);
                if (response.message) {
                    const taxes = response.message.taxes || []; // Assuming taxes is the child table field
                    console.log(`Taxes found:`, taxes);
                    
                    if (taxes.length > 0) {
                        const salesTaxEntry = taxes[0]; // Assuming the first entry is relevant
                        console.log(`Found sales tax entry:`, salesTaxEntry);
                        
                        if (salesTaxEntry.item_tax_template) {
                            console.log(`Sales tax template in entry is ${salesTaxEntry.item_tax_template}`);
                            callback(salesTaxEntry.item_tax_template);
                        } else {
                            callback(null);
                        }
                    } else {
                        callback(null);
                    }
                } else {
                    callback(null);
                }
            }
        });
    }
}


function get_advance_tax_from_template(template_name, callback) {
    // Skip API call if no template is provided
    if (!template_name) {
        callback({
            advance_tax_rate: 0,
            advance_tax_account: ""
        });
        return;
    }

    // Determine correct template doctype based on parent document
    let template_doctype = "Purchase Taxes and Charges Template";
    if (cur_frm.doc.doctype === "Sales Invoice") {
        template_doctype = "Sales Taxes and Charges Template";
    }

    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: template_doctype,
            name: template_name
        },
        callback: function(res) {
            if (res.message && res.message.taxes) {
                let advance_tax_account = "";
                let advance_tax_rate = 0;

                res.message.taxes.forEach(tax => {
                    if (tax.custom_tax_category === "236G") {
                        advance_tax_rate = flt(tax.rate || 0);
                        advance_tax_account = tax.account_head || "";
                    }
                });

                callback({
                    advance_tax_rate,
                    advance_tax_account
                });
            } else {
                callback({
                    advance_tax_rate: 0,
                    advance_tax_account: ""
                });
            }
        },
        error: function(err) {
            console.warn("Advance tax template fetch failed:", err);
            callback({
                advance_tax_rate: 0,
                advance_tax_account: ""
            });
        }
    });
}


function getMultiplier(frm){
    
    let multiplier = 1;
    if (frm.doc.is_return === 1){
        multiplier = -1
    }
    
    return multiplier;
}

function apply_tax_summary(frm) {
    console.log(`[apply_tax_summary] Starting tax summary calculation`);
    const { total_st, total_further_tax, total_inclusive } = calculate_row_tax_totals(frm);

    get_company_tax_accounts(frm.doc.company, (accounts) => {
        get_advance_tax_from_template(frm.doc.custom_tax_template, (advance) => {
            
            // Clear old tax rows
            frm.clear_table("taxes");

            if (total_st && accounts.sales_tax_account) {
                let row = frm.add_child("taxes");
                Object.assign(row, {
                    charge_type: "Actual",
                    account_head: accounts.sales_tax_account,
                    description: "Sales Tax (Item Level)",
                    tax_amount: total_st,
                    custom_tax_category: "Sales Tax",
                    tax_category: "Sales Tax"
                });
            }

            if (total_further_tax && accounts.further_tax_account) {
                let row = frm.add_child("taxes");
                Object.assign(row, {
                    charge_type: "Actual",
                    account_head: accounts.further_tax_account,
                    description: "Further Tax (Item Level)",
                    tax_amount: total_further_tax,
                    custom_tax_category: "Further Sales Tax",
                    tax_category: "Further Sales Tax"
                });
            }

            let advance_tax = (advance.advance_tax_rate || 0) * 0.01 * total_inclusive;

            if (advance_tax && advance.advance_tax_account) {
                let row = frm.add_child("taxes");
                Object.assign(row, {
                    charge_type: "Actual",
                    account_head: advance.advance_tax_account,
                    description: "Advance Income Tax (236G)",
                    tax_amount: advance_tax,
                    custom_tax_category: "236G",
                    tax_category: "236G"
                });
            }

            // Update UI instantly
            frm.refresh_field("taxes");
            frm.doc.total_taxes_and_charges = (total_st || 0) + (total_further_tax || 0) + (advance_tax || 0);
            frm.refresh_field("total_taxes_and_charges");

            // Mark doc as dirty so it gets saved
            frm.dirty();
            
            console.log(`[apply_tax_summary] Completed tax summary with totals:`, {
                total_st,
                total_further_tax,
                advance_tax,
                total_taxes_and_charges: frm.doc.total_taxes_and_charges
            });
        });
    });
}


function calculate_taxes(frm, row) {
    if (frm.doc.custom_purchase_invoice_type === "Import") {
        return;
    }

    console.log(`[calculate_taxes] Starting calculation for item: ${row.item_code}`);

    fetch_item_tax_template(row, function(item_tax_template) {
        let sales_tax = 0;
        let further_tax = 0;
        let sales_tax_rate = 0;
        let qty = row.qty > 0 ? row.qty : 1;
        let base_amount = qty * row.rate;

        const multiplier = getMultiplier(frm);

        if (item_tax_template) {
            console.log(`[calculate_taxes] Found tax template: ${item_tax_template}`);
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item Tax Template",
                    name: item_tax_template
                },
                callback: function(response) {
                    if (response.message) {
                        const tax_rates = response.message.taxes || [];

                        tax_rates.forEach(rate => {
                            if (rate.custom_tax_category === "Sales Tax") {
                                sales_tax += multiplier * (rate.tax_rate * 0.01 * base_amount);
                                sales_tax_rate += rate.tax_rate;
                            }

                            // ✅ Apply Further Tax conditionally
                            if (
                                rate.custom_tax_category === "Further Sales Tax" &&
                                frm.doc.doctype === "Sales Invoice" &&
                                (!frm.doc.custom_customer_st_status || frm.doc.custom_customer_st_status === "Unregistered")
                            ) {
                                further_tax += multiplier * (rate.tax_rate * 0.01 * base_amount);
                            }
                        });

                        // Update row fields first
                        row.custom_st_rate = sales_tax_rate;
                        row.custom_st = sales_tax;
                        row.custom_further_tax = further_tax;
                        row.custom_at = 0;
                        row.custom_total_incl_tax = multiplier * base_amount + sales_tax + further_tax;

                        console.log(`[calculate_taxes] Updated row ${row.item_code}:`, {
                            custom_st: row.custom_st,
                            custom_further_tax: row.custom_further_tax,
                            custom_total_incl_tax: row.custom_total_incl_tax
                        });

                        // Refresh the row data first
                        frm.refresh_field("items");
                        
                        // Only call apply_tax_summary after the row is updated
                        // Use a small delay to ensure the UI has updated
                        setTimeout(() => {
                            console.log(`[calculate_taxes] Calling apply_tax_summary after row update`);
                            apply_tax_summary(frm);
                        }, 50);
                    }
                }
            });
        } else {
            console.log(`[calculate_taxes] No tax template found for item: ${row.item_code}`);
            row.custom_st_rate = 0;
            row.custom_st = 0;
            row.custom_further_tax = 0;
            row.custom_at = 0;
            row.custom_total_incl_tax = multiplier * base_amount;
            
            frm.refresh_field("items");
            
            // Call apply_tax_summary even when no template is found
            setTimeout(() => {
                console.log(`[calculate_taxes] Calling apply_tax_summary after clearing taxes`);
                apply_tax_summary(frm);
            }, 50);
        }
    });
}