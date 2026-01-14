frappe.ui.form.on("Payment Entry", {
    custom_manual_wht: function(frm) {
        // Clear the taxes table when custom_manual_wht checkbox is changed
        frm.clear_table("taxes");
        frm.refresh_field("taxes");
        
    }
});
