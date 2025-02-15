/*
This will override erpnext default Purchase Invoice Item. We need a set pattern for 
tax purposes, this will calculate ST,AT, Further Tax and any other taxes as per needs.
*/
frappe.ui.form.on("Purchase Invoice Item", {
    
    
    item_code: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        calculate_taxes(frm, row);
    },
qty: function(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    calculate_taxes(frm, row);
},
rate: function(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    calculate_taxes(frm, row);
    
},
    
    

discount_percentage: function(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    calculate_taxes(frm, row);
}
});

function getMultiplier(frm){
    
    let multiplier = 1;
    if (frm.doc.is_return === 1){
        multiplier = -1
    }
    
    return multiplier;
}
// Function to calculate taxes based on the conditions specified
function calculate_taxes(frm, row) {
    if (frm.doc.custom_purchase_invoice_type === "Import"){
        return;
    }
    const item_tax_template = row.item_tax_template; // Assuming this is the field for item tax template
    let sales_tax = 0;
    let sales_tax_rate = 0;
    let further_sales_tax = 0;
    let advance_tax = 0;
    let multiplier = getMultiplier(frm);
    let qty = 1;
    if (row.qty > 0){
        qty = row.qty
    }

    if (item_tax_template) {
        // Fetch the item tax template details
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Item Tax Template",
                name: item_tax_template
            },
            callback: function(response) {
                if (response.message) {
                    const tax_rates = response.message.taxes; // Assuming tax_rates is a field in the template
                    console.log($`Qty is ${row}`);
                    // Calculate Sales Tax from item tax template
                    tax_rates.forEach(rate => {
                        if (rate.custom_tax_category === "Sales Tax") {
                            console.log(`tax rate detected ${rate.tax_rate}`);
                            sales_tax += (rate.tax_rate * 0.01 * (qty * row.rate));
                            sales_tax_rate += rate.tax_rate
                        }
                    });

                    // Now calculate remaining taxes from Sales Taxes and Charges Template
                    calculate_additional_taxes(frm, row, sales_tax,sales_tax_rate);
                }
            }
        });
    } else {
        // If no item tax template, calculate all taxes from Sales Taxes and Charges Template
        calculate_additional_taxes(frm, row, sales_tax,sales_tax_rate);
    }
}

// Function to calculate additional taxes from Sales Taxes and Charges Template
function calculate_additional_taxes(frm, row, sales_tax,sales_tax_rate) {
    let qty = 1;
    if (row.qty > 0){
        qty = row.qty
    }
    const sales_taxes_and_charges_template = frm.doc.taxes_and_charges; // Assuming this is the field for sales taxes and charges template
    
    if (sales_taxes_and_charges_template) {
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Purchase Taxes and Charges Template",
                name: sales_taxes_and_charges_template
            },
            callback: function(response) {
                if (response.message) {
                    const tax_rates = response.message.taxes; // Assuming tax_rates is a field in the template
                    console.log("Tax Rates from Template:", tax_rates); // Debugging line

                    // Initialize tax variables
                    let further_sales_tax = 0;
                    let advance_tax = 0;

                    // Calculate additional taxes
                    tax_rates.forEach(rate => {
                        console.log("Processing Rate:", rate); // Debugging line
                        if (rate.custom_tax_category === "Further Sales Tax") {
                            further_sales_tax += (rate.rate * 0.01  * (qty * row.rate));
                            console.log("Further Sales Tax Calculated:", further_sales_tax); // Debugging line
                        } 
                        /*
                        else if (rate.custom_tax_category === "236G") {
                            advance_tax += (rate.tax_rate * 0.01 * (row.qty * row.rate));
                            console.log("Advance Tax Calculated:", advance_tax); // Debugging line
                        }*/ // 236G Skipped in row taxes
                    });

                    // Set the calculated values to the custom fields
                    row.custom_st_rate = sales_tax_rate;
                    row.custom_st = sales_tax; // Using custom_st for Sales Tax
                    row.custom_further_tax = further_sales_tax; // Using custom_further_sales_tax for Further Sales Tax
                    row.custom_at = advance_tax; // Using custom_at for Advance Tax
                    row.custom_total_incl_tax = (row.qty*row.rate)+sales_tax+further_sales_tax;
                    frm.refresh_field("items")
                    

                    // Debugging output for final tax values
                    console.log("Sales Tax rate:", sales_tax_rate);
                    console.log("Final Sales Tax:", sales_tax);
                    console.log("Final Further Sales Tax:", further_sales_tax);
                    console.log("Final Advance Tax:", advance_tax);
                } else {
                    console.error("No message in response:", response); // Debugging line
                }
            },
            error: function(err) {
                console.error("Error fetching Sales Taxes and Charges Template:", err); // Debugging line
            }
        });
    } else {
        console.warn("No Sales Taxes and Charges Template found."); // Debugging line
    }
}