/*
This will override erpnext default Sales Invoice Item. We need a set pattern for 
tax purposes, this will calculate ST, Further Tax and any other taxes as per needs.
*/

// Track manual override mode to prevent re-calculation loops
let manual_override_in_progress_sales = false;

frappe.ui.form.on("Sales Invoice Item", {
    
    item_code: function(frm, cdt, cdn) {
        if (manual_override_in_progress_sales) return;
        const row = locals[cdt][cdn];
        calculate_taxes(frm, row);
    },
    
    qty: function(frm, cdt, cdn) {
        if (manual_override_in_progress_sales) return;
        const row = locals[cdt][cdn];
        calculate_taxes(frm, row);
    },
    
    rate: function(frm, cdt, cdn) {
        if (manual_override_in_progress_sales) return;
        const row = locals[cdt][cdn];
        calculate_taxes(frm, row);
    },
    
    discount_percentage: function(frm, cdt, cdn) {
        if (manual_override_in_progress_sales) return;
        const row = locals[cdt][cdn];
        calculate_taxes(frm, row);
    },
    
    custom_st_rate: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        console.log(`[custom_st_rate] User manually changed ST Rate to: ${row.custom_st_rate}`);
        
        // Set flag to prevent other events from interfering
        manual_override_in_progress_sales = true;
        
        calculate_taxes(frm, row, "custom_st_rate");
        
        // Reset flag after a delay
        setTimeout(() => {
            manual_override_in_progress_sales = false;
        }, 50);
    },
    
    custom_st: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        console.log(`[custom_st] User manually changed ST Amount to: ${row.custom_st}`);
        
        // Set flag to prevent other events from interfering
        manual_override_in_progress_sales = true;
        
        calculate_taxes(frm, row, "custom_st");
        
        // Reset flag after a delay
        setTimeout(() => {
            manual_override_in_progress_sales = false;
        }, 50);
    }
});

frappe.ui.form.on("Sales Invoice", {
    custom_tax_template: function(frm) {
        apply_tax_summary(frm);
    }
});

