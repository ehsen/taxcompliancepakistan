frappe.ui.form.on('WHT Exemption', {
    onload: function(frm) {
      frm.set_query('party_type', () => {
        return {
          filters: {
            name: ['in', ['Supplier', 'Customer', 'Employee']]
          }
        };
      });
    }
  });