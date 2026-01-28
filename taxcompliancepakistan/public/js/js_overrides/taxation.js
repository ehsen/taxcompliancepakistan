/*
This will override erpnext default Purchase Invoice Item. We need a set pattern for 
tax purposes, this will calculate ST,AT, Further Tax and any other taxes as per needs.
*/

// Global cache for tax templates to avoid redundant fetches
let tax_template_cache = {
    // Structure: { "template_name": { taxes: [...], company: "...", ... } }
};

/**
 * Store tax template in global cache
 * @param {String} template_name - Template name
 * @param {Object} template_data - Full template object
 */
function cache_tax_template(template_name, template_data) {
    tax_template_cache[template_name] = template_data;
    console.log(`[cache_tax_template] Cached template: ${template_name}`);
}

/**
 * Retrieve tax template from cache
 * @param {String} template_name - Template name
 * @returns {Object|null} - Template object or null if not cached
 */
function get_cached_tax_template(template_name) {
    const template = tax_template_cache[template_name];
    if (template) {
        console.log(`[get_cached_tax_template] Retrieved from cache: ${template_name}`);
    }
    return template || null;
}

/**
 * Extract accounts directly from template object (no fetch needed)
 * @param {Object} template_data - The template object
 * @returns {Object} - Accounts object
 */
function extract_accounts_from_cached_template(template_data) {
    const accounts = {
        sales_tax_account: "",
        further_tax_account: "",
        advance_tax_account: ""
    };

    if (!template_data || !template_data.taxes) {
        console.warn(`[extract_accounts_from_cached_template] Template data is empty`);
        return accounts;
    }

    console.log(`[extract_accounts_from_cached_template] Extracting accounts from template with ${template_data.taxes.length} tax rows`);

    template_data.taxes.forEach((tax, idx) => {
        if (tax.custom_tax_category === "Sales Tax") {
            accounts.sales_tax_account = tax.tax_type || "";
            console.log(`[extract_accounts_from_cached_template] Row ${idx}: Sales Tax - category=${tax.custom_tax_category}, tax_type (account)=${accounts.sales_tax_account}, tax_rate=${tax.tax_rate}`);
            if (!tax.tax_type) {
                console.warn(`[extract_accounts_from_cached_template] Row ${idx}: Sales Tax row is missing tax_type (Account) field! Please fill in the Account field in the template.`);
            }
        } else if (tax.custom_tax_category === "Further Sales Tax") {
            accounts.further_tax_account = tax.tax_type || "";
            console.log(`[extract_accounts_from_cached_template] Row ${idx}: Further Tax - category=${tax.custom_tax_category}, tax_type (account)=${accounts.further_tax_account}, tax_rate=${tax.tax_rate}`);
            if (!tax.tax_type) {
                console.warn(`[extract_accounts_from_cached_template] Row ${idx}: Further Tax row is missing tax_type (Account) field! Please fill in the Account field in the template.`);
            }
        } else if (tax.custom_tax_category === "236G") {
            accounts.advance_tax_account = tax.tax_type || "";
            console.log(`[extract_accounts_from_cached_template] Row ${idx}: 236G - category=${tax.custom_tax_category}, tax_type (account)=${accounts.advance_tax_account}, tax_rate=${tax.tax_rate}`);
            if (!tax.tax_type) {
                console.warn(`[extract_accounts_from_cached_template] Row ${idx}: 236G row is missing tax_type (Account) field! Please fill in the Account field in the template.`);
            }
        }
    });

    console.log(`[extract_accounts_from_cached_template] Final accounts:`, accounts);
    return accounts;
}

/**
 * Extract accounts from a tax template's detail rows
 * @param {String} template_name - The Item Tax Template name
 * @param {Function} callback - Callback with {sales_tax_account, further_tax_account, advance_tax_account}
 */
function extract_accounts_from_template(template_name, callback) {
    if (!template_name) {
        callback({
            sales_tax_account: "",
            further_tax_account: "",
            advance_tax_account: ""
        });
        return;
    }

    console.log(`[extract_accounts_from_template] Fetching accounts from template: ${template_name}`);

    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item Tax Template",
            name: template_name
        },
        callback: function(res) {
            if (res.message && res.message.taxes) {
                let accounts = {
                    sales_tax_account: "",
                    further_tax_account: "",
                    advance_tax_account: ""
                };

                console.log(`[extract_accounts_from_template] Template has ${res.message.taxes.length} tax rows`);

                // Extract account heads from tax template detail rows based on tax category
                res.message.taxes.forEach((tax, idx) => {
                    if (tax.custom_tax_category === "Sales Tax") {
                        accounts.sales_tax_account = tax.account_head || "";
                        console.log(`[extract_accounts_from_template] Row ${idx}: Sales Tax account = ${accounts.sales_tax_account}`);
                    } else if (tax.custom_tax_category === "Further Sales Tax") {
                        accounts.further_tax_account = tax.account_head || "";
                        console.log(`[extract_accounts_from_template] Row ${idx}: Further Tax account = ${accounts.further_tax_account}`);
                    } else if (tax.custom_tax_category === "236G") {
                        accounts.advance_tax_account = tax.account_head || "";
                        console.log(`[extract_accounts_from_template] Row ${idx}: 236G account = ${accounts.advance_tax_account}`);
                    }
                });

                console.log(`[extract_accounts_from_template] Final accounts:`, accounts);
                callback(accounts);
            } else {
                console.warn("[extract_accounts_from_template] Template has no taxes");
                callback({
                    sales_tax_account: "",
                    further_tax_account: "",
                    advance_tax_account: ""
                });
            }
        },
        error: function(err) {
            console.error("[extract_accounts_from_template] Error fetching tax template:", err);
            callback({
                sales_tax_account: "",
                further_tax_account: "",
                advance_tax_account: ""
            });
        }
    });
}

/**
 * Fetch tax accounts using hierarchical lookup:
 * 1. Check row-level custom_tax_classification
 * 2. Check item master's custom_tax_classification
 * 3. Fetch FBR Transaction Type and get tax template from it
 * 4. Extract accounts from the tax template
 * 
 * @param {Object} row - The sales invoice item row
 * @param {Object} frm - The form object
 * @param {Function} callback - Callback with {sales_tax_account, further_tax_account, advance_tax_account}
 */
function get_tax_accounts_for_row(row, frm, callback) {
    console.log(`[get_tax_accounts_for_row] Starting account lookup for item: ${row.item_code}`);

    // Step 1: Check if row has custom_tax_classification
    let tax_classification = row.custom_tax_classification;
    console.log(`[get_tax_accounts_for_row] Row custom_tax_classification: ${tax_classification}`);

    if (tax_classification) {
        // This is the classification, now we need to fetch FBR Transaction Type
        console.log(`[get_tax_accounts_for_row] Found tax classification at row level: ${tax_classification}`);
        fetch_tax_template_from_fbr_type(tax_classification, (template_name) => {
            if (template_name) {
                console.log(`[get_tax_accounts_for_row] Got template from FBR type: ${template_name}`);
                extract_accounts_from_template(template_name, callback);
            } else {
                console.warn(`[get_tax_accounts_for_row] No template found from FBR type`);
                callback({
                    sales_tax_account: "",
                    further_tax_account: "",
                    advance_tax_account: ""
                });
            }
        });
        return;
    }

    // Step 2: Fetch item master to get custom_tax_classification
    console.log(`[get_tax_accounts_for_row] Fetching item master to get tax classification`);
    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item",
            name: row.item_code
        },
        callback: function(item_res) {
            if (!item_res.message) {
                console.warn(`[get_tax_accounts_for_row] Failed to fetch item: ${row.item_code}`);
                callback({
                    sales_tax_account: "",
                    further_tax_account: "",
                    advance_tax_account: ""
                });
                return;
            }

            tax_classification = item_res.message.custom_tax_classification;
            console.log(`[get_tax_accounts_for_row] Item custom_tax_classification: ${tax_classification}`);

            if (!tax_classification) {
                console.warn(`[get_tax_accounts_for_row] No tax classification found in item master`);
                callback({
                    sales_tax_account: "",
                    further_tax_account: "",
                    advance_tax_account: ""
                });
                return;
            }

            // Step 3: Fetch FBR Transaction Type to get tax template
            console.log(`[get_tax_accounts_for_row] Fetching FBR Transaction Type: ${tax_classification}`);
            fetch_tax_template_from_fbr_type(tax_classification, (template_name) => {
                if (template_name) {
                    console.log(`[get_tax_accounts_for_row] Got template from FBR type: ${template_name}`);
                    extract_accounts_from_template(template_name, callback);
                } else {
                    console.warn(`[get_tax_accounts_for_row] No template found from FBR type`);
                    callback({
                        sales_tax_account: "",
                        further_tax_account: "",
                        advance_tax_account: ""
                    });
                }
            });
        },
        error: function(err) {
            console.error(`[get_tax_accounts_for_row] Error fetching item:`, err);
            callback({
                sales_tax_account: "",
                further_tax_account: "",
                advance_tax_account: ""
            });
        }
    });
}

/**
 * Fetch tax template from FBR Transaction Type document
 * @param {String} fbr_type_name - The FBR Transaction Type name
 * @param {Function} callback - Callback with template name or null
 */
function fetch_tax_template_from_fbr_type(fbr_type_name, callback) {
    console.log(`[fetch_tax_template_from_fbr_type] Fetching FBR type: ${fbr_type_name}`);

    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "FBR Transaction Type",
            name: fbr_type_name
        },
        callback: function(res) {
            if (res.message && res.message.tax_template) {
                console.log(`[fetch_tax_template_from_fbr_type] Found tax template: ${res.message.tax_template}`);
                callback(res.message.tax_template);
            } else {
                console.warn(`[fetch_tax_template_from_fbr_type] No tax_template field in FBR type: ${fbr_type_name}`);
                callback(null);
            }
        },
        error: function(err) {
            console.error(`[fetch_tax_template_from_fbr_type] Error fetching FBR type:`, err);
            callback(null);
        }
    });
}

function calculate_row_tax_totals(frm) {
    let total_st = 0;
    let total_further_tax = 0;
    let total_inclusive = 0;
    let precision = frappe.boot.sysdefaults.currency_precision || 2;
    
    console.log(`[calculate_row_tax_totals] Processing ${(frm.doc.items || []).length} items`);
    
    (frm.doc.items || []).forEach((row, idx) => {
        const st = flt(row.custom_st || 0, precision);
        const ft = flt(row.custom_further_tax || 0, precision);
        const incl = flt(row.custom_total_incl_tax || 0, precision);
        
        total_st += st;
        total_further_tax += ft;
        total_inclusive += incl;
        
        console.log(`[calculate_row_tax_totals] Item ${idx} (${row.item_code}): ST=${st}, FT=${ft}, Total=${incl}`);
    });

    console.log(`[calculate_row_tax_totals] TOTALS: ST=${total_st}, FT=${total_further_tax}, Inclusive=${total_inclusive}`);
    
    return { total_st, total_further_tax, total_inclusive };
}

function fetch_item_tax_template(row, callback) {
    if (row.item_tax_template) {
        console.log(`[fetch_item_tax_template] Returning item_tax_template directly: ${row.item_tax_template}`);
        callback(row.item_tax_template);
        return;
    }

    // Fetch the Item master
    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item",
            name: row.item_code
        },
        callback: function(item_response) {
            if (!item_response.message) {
                console.warn(`[fetch_item_tax_template] Failed to fetch item: ${row.item_code}`);
                callback(null);
                return;
            }

            const item_data = item_response.message;
            console.log(`[fetch_item_tax_template] Fetched item: ${row.item_code}`, item_data);

            // Step 1: Check Item master's taxes table for Sales Tax category
            const item_taxes = item_data.taxes || [];
            console.log(`[fetch_item_tax_template] Item has ${item_taxes.length} tax rows`);

            for (let tax_row of item_taxes) {
                if (tax_row.tax_category === "Sales Tax") {
                    const template = tax_row.item_tax_template;
                    console.log(`[fetch_item_tax_template] Found Sales Tax template in Item taxes table: ${template}`);
                    if (template) {
                        callback(template);
                        return;
                    }
                }
            }

            // Step 2: If not found in Item taxes, check FBR Transaction Type
            const fbr_classification = row.custom_tax_classification || item_data.custom_tax_classification;
            console.log(`[fetch_item_tax_template] No Sales Tax template in Item. Checking FBR Transaction Type: ${fbr_classification}`);

            if (!fbr_classification) {
                console.warn(`[fetch_item_tax_template] No FBR Transaction Type found`);
                callback(null);
                return;
            }

            // Fetch FBR Transaction Type to get custom_tax_template
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "FBR Transaction Type",
                    name: fbr_classification
                },
                callback: function(fbr_response) {
                    if (fbr_response.message && fbr_response.message.tax_template) {
                        const template = fbr_response.message.tax_template;
                        console.log(`[fetch_item_tax_template] Found template in FBR Transaction Type: ${template}`);
                        callback(template);
                    } else {
                        console.warn(`[fetch_item_tax_template] No custom_tax_template in FBR Transaction Type: ${fbr_classification}`);
                        callback(null);
                    }
                },
                error: function(err) {
                    console.error(`[fetch_item_tax_template] Error fetching FBR Transaction Type:`, err);
                    callback(null);
                }
            });
        },
        error: function(err) {
            console.error(`[fetch_item_tax_template] Error fetching item:`, err);
            callback(null);
        }
    });
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

/**
 * Fetch advance tax (236G) from template using hierarchical lookup
 * @param {Object} row - The sales invoice item row
 * @param {Object} frm - The form object
 * @param {Function} callback - Callback with {advance_tax_rate, advance_tax_account}
 */
function get_advance_tax_from_template_for_row(row, frm, callback) {
    console.log(`[get_advance_tax_from_template_for_row] Fetching 236G tax for item: ${row.item_code}`);

    // Step 1: Check row-level custom_tax_classification
    let tax_classification = row.custom_tax_classification;
    console.log(`[get_advance_tax_from_template_for_row] Row custom_tax_classification: ${tax_classification}`);

    if (tax_classification) {
        fetch_tax_template_from_fbr_type(tax_classification, (template_name) => {
            if (template_name) {
                extract_advance_tax_from_template(template_name, frm, callback);
            } else {
                console.warn(`[get_advance_tax_from_template_for_row] No template found from FBR type`);
                callback({
                    advance_tax_rate: 0,
                    advance_tax_account: ""
                });
            }
        });
        return;
    }

    // Step 2: Fetch item master to get custom_tax_classification
    console.log(`[get_advance_tax_from_template_for_row] Fetching item master`);
    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item",
            name: row.item_code
        },
        callback: function(item_res) {
            if (!item_res.message) {
                console.warn(`[get_advance_tax_from_template_for_row] Failed to fetch item: ${row.item_code}`);
                callback({
                    advance_tax_rate: 0,
                    advance_tax_account: ""
                });
                return;
            }

            tax_classification = item_res.message.custom_tax_classification;
            console.log(`[get_advance_tax_from_template_for_row] Item custom_tax_classification: ${tax_classification}`);

            if (!tax_classification) {
                console.warn(`[get_advance_tax_from_template_for_row] No tax classification found in item master`);
                callback({
                    advance_tax_rate: 0,
                    advance_tax_account: ""
                });
                return;
            }

            // Fetch FBR Transaction Type to get tax template
            fetch_tax_template_from_fbr_type(tax_classification, (template_name) => {
                if (template_name) {
                    extract_advance_tax_from_template(template_name, frm, callback);
                } else {
                    console.warn(`[get_advance_tax_from_template_for_row] No template found from FBR type`);
                    callback({
                        advance_tax_rate: 0,
                        advance_tax_account: ""
                    });
                }
            });
        },
        error: function(err) {
            console.error(`[get_advance_tax_from_template_for_row] Error fetching item:`, err);
            callback({
                advance_tax_rate: 0,
                advance_tax_account: ""
            });
        }
    });
}

/**
 * Extract 236G tax from an Item Tax Template
 * @param {String} template_name - The Item Tax Template name
 * @param {Object} frm - The form object
 * @param {Function} callback - Callback with {advance_tax_rate, advance_tax_account}
 */
function extract_advance_tax_from_template(template_name, frm, callback) {
    console.log(`[extract_advance_tax_from_template] Fetching 236G from template: ${template_name}`);

    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item Tax Template",
            name: template_name
        },
        callback: function(res) {
            if (res.message && res.message.taxes) {
                let advance_tax_account = "";
                let advance_tax_rate = 0;

                res.message.taxes.forEach(tax => {
                    if (tax.custom_tax_category === "236G") {
                        advance_tax_rate = flt(tax.tax_rate || 0);
                        advance_tax_account = tax.account_head || tax.tax_account || "";
                        console.log(`[extract_advance_tax_from_template] Found 236G: rate=${advance_tax_rate}, account=${advance_tax_account}`);
                    }
                });

                callback({
                    advance_tax_rate,
                    advance_tax_account
                });
            } else {
                console.warn(`[extract_advance_tax_from_template] Template has no taxes`);
                callback({
                    advance_tax_rate: 0,
                    advance_tax_account: ""
                });
            }
        },
        error: function(err) {
            console.error(`[extract_advance_tax_from_template] Error:`, err);
            callback({
                advance_tax_rate: 0,
                advance_tax_account: ""
            });
        }
    });
}


function getMultiplier(frm, row){
    let multiplier = 1;
    if (frm.doc.is_return === 1 || (row && row.qty < 0)){
        multiplier = -1
    }
    return multiplier;
}

/**
 * Calculate taxes for 3rd Schedule Goods using simplified calculation
 * 3rd Schedule: Tax is calculated on notified/retail price
 * 
 * Algorithm:
 * 1. Get the taxable base = MAX(custom_fixed_notified_value, custom_retail_price)
 * 2. Multiply qty with the taxable base to get the total taxable amount
 * 3. Calculate tax by simply multiplying with ST rate: ST = (qty * taxable_base * ST_rate) / 100
 * 4. Calculate further tax if applicable (same logic)
 * 5. Calculate total inclusive of taxes
 * 
 * @param {Object} row - The invoice item row
 * @param {Object} itemData - Item master data (custom_fixed_notified_value, custom_retail_price)
 * @param {Object} templateData - Tax template data with tax rates
 * @param {Object} frm - The parent form
 * @param {Number} multiplier - Direction multiplier (1 or -1)
 * @param {Number} qty - Absolute quantity
 * @param {Number} precision - Currency precision
 * @returns {Object} Calculated tax object with st, st_rate, further_tax, ft_rate, ex_sales_tax_value, total_incl_tax
 */
function calculate_third_schedule_taxes(row, itemData, templateData, frm, multiplier, qty, precision) {
    const result = {
        st: 0,
        st_rate: 0,
        further_tax: 0,
        ft_rate: 0,
        ex_sales_tax_value: 0,
        total_incl_tax: 0
    };

    console.log(`[calculate_third_schedule_taxes] Starting 3rd Schedule calculation for item: ${row.item_code}`);

    // Step 1: Determine taxable base - use the higher of notified value or retail price
    const fixedNotifiedValue = flt(itemData.custom_fixed_notified_value || 0, precision);
    const retailPrice = flt(itemData.custom_retail_price || 0, precision);
    const taxableBase = Math.max(fixedNotifiedValue, retailPrice);

    if (taxableBase <= 0) {
        console.warn(`[calculate_third_schedule_taxes] No valid taxable base for 3rd Schedule item: ${row.item_code}`);
        result.total_incl_tax = multiplier * qty * flt(row.rate || 0, precision);
        return result;
    }

    console.log(`[calculate_third_schedule_taxes] Taxable base determined:`, {
        fixed_notified_value: fixedNotifiedValue,
        retail_price: retailPrice,
        taxable_base: taxableBase
    });

    // Step 2: Calculate total taxable amount = qty * taxable_base
    const totalTaxableAmount = qty * taxableBase;
    console.log(`[calculate_third_schedule_taxes] Total taxable amount: ${totalTaxableAmount} (qty: ${qty} * base: ${taxableBase})`);

    // Step 3: Extract sales tax rate from template and calculate tax
    let salestaxRate = 0;
    let salesTax = 0;
    if (templateData && templateData.taxes) {
        templateData.taxes.forEach(tax => {
            if (tax.custom_tax_category === "Sales Tax") {
                salestaxRate = flt(tax.tax_rate || 0, precision);
            }
        });
    }

    // Calculate sales tax: ST = (total_taxable_amount * ST_rate) / 100
    if (salestaxRate > 0) {
        salesTax = multiplier * (totalTaxableAmount * salestaxRate / 100);
        salesTax = flt(salesTax, precision);
    }

    console.log(`[calculate_third_schedule_taxes] Sales tax calculation:`, {
        sales_tax_rate: salestaxRate,
        sales_tax: salesTax,
        total_taxable_amount: totalTaxableAmount
    });

    // Step 4: Calculate further tax based on total taxable amount (if applicable)
    let furtherTax = 0;
    let furtherTaxRate = 0;
    if (templateData && templateData.taxes) {
        templateData.taxes.forEach(tax => {
            if (
                tax.custom_tax_category === "Further Sales Tax" &&
                frm.doc.doctype === "Sales Invoice" &&
                frm.doc.custom_sales_tax_status === "Unregistered"
            ) {
                furtherTaxRate = flt(tax.tax_rate || 0, precision);
                furtherTax = multiplier * (totalTaxableAmount * furtherTaxRate / 100);
                furtherTax = flt(furtherTax, precision);
            }
        });
    }

    // Step 5: Calculate total inclusive of taxes
    // total_incl_tax = base_amount (qty * rate) + custom_st + custom_further_tax
    const baseAmount = multiplier * qty * flt(row.rate || 0, precision);
    const totalInclTax = baseAmount + salesTax + furtherTax;

    result.st = flt(salesTax, precision);
    result.st_rate = flt(salestaxRate, precision);
    result.further_tax = flt(furtherTax, precision);
    result.ft_rate = flt(furtherTaxRate, precision);
    result.ex_sales_tax_value = multiplier * (qty * taxableBase);
    result.total_incl_tax = flt(totalInclTax, precision);

    console.log(`[calculate_third_schedule_taxes] 3rd Schedule calculation complete:`, {
        st: result.st,
        st_rate: result.st_rate,
        further_tax: result.further_tax,
        ft_rate: result.ft_rate,
        ex_sales_tax_value: result.ex_sales_tax_value,
        total_incl_tax: result.total_incl_tax
    });

    return result;
}

function apply_tax_summary(frm) {
    console.log(`[apply_tax_summary] Starting tax summary calculation`);
    console.log(`[apply_tax_summary] Document type: ${frm.doc.doctype}`);
    
    const { total_st, total_further_tax, total_inclusive } = calculate_row_tax_totals(frm);

    // Need to fetch accounts for each item row to group taxes by account
    // For now, we'll use a simpler approach: fetch account from first item that has taxes
    
    if (!frm.doc.items || frm.doc.items.length === 0) {
        console.log(`[apply_tax_summary] No items found, skipping tax calculation`);
        return;
    }

    // We need to process items sequentially to get their accounts
    let items_with_taxes = frm.doc.items.filter(item => {
        return flt(item.custom_st || 0) > 0 || flt(item.custom_further_tax || 0) > 0;
    });

    console.log(`[apply_tax_summary] Found ${items_with_taxes.length} items with taxes`);

    if (items_with_taxes.length === 0) {
        console.log(`[apply_tax_summary] No items with taxes, clearing tax rows`);
        frm.clear_table("taxes");
        frm.refresh_field("taxes");
        return;
    }

    // Use cached template to extract accounts (no need to fetch again!)
    const first_item = items_with_taxes[0];
    const cached_template = get_cached_tax_template(`template_${first_item.item_code}`);
    let accounts = {
        sales_tax_account: "",
        further_tax_account: "",
        advance_tax_account: ""
    };
    
    if (cached_template) {
        console.log(`[apply_tax_summary] Using cached template for item: ${first_item.item_code}`);
        accounts = extract_accounts_from_cached_template(cached_template);
    } else {
        console.warn(`[apply_tax_summary] No cached template found. Falling back to account lookup for item: ${first_item.item_code}`);
        // Fallback to original method
        get_tax_accounts_for_row(first_item, frm, (retrieved_accounts) => {
            accounts = retrieved_accounts;
            perform_tax_summary_update();
        });
        return;
    }
    
    perform_tax_summary_update();
    
    function perform_tax_summary_update() {
        console.log(`[apply_tax_summary] Retrieved accounts:`, accounts);
        
        get_advance_tax_from_template_for_row(items_with_taxes[0], frm, (advance) => {
            console.log(`[apply_tax_summary] Retrieved advance tax:`, advance);
            
            // Preserve manually added 236G rows for Purchase Invoice
            let preserved_236g_rows = [];
            if (frm.doc.doctype === "Purchase Invoice") {
                (frm.doc.taxes || []).forEach(tax => {
                    if (tax.custom_tax_category === "236G" || tax.tax_category === "236G") {
                        preserved_236g_rows.push({
                            charge_type: tax.charge_type,
                            account_head: tax.account_head,
                            description: tax.description,
                            tax_amount: tax.tax_amount,
                            custom_tax_category: tax.custom_tax_category,
                            tax_category: tax.tax_category,
                            cost_center: tax.cost_center,
                            rate: tax.rate
                        });
                    }
                });
            }
            
            // Clear old tax rows
            frm.clear_table("taxes");
            console.log(`[apply_tax_summary] Cleared taxes table`);

            // Add Sales Tax row if we have both amount and account
            if (total_st > 0 && accounts.sales_tax_account) {
                let row = frm.add_child("taxes");
                Object.assign(row, {
                    charge_type: "Actual",
                    account_head: accounts.sales_tax_account,
                    description: "Sales Tax (Item Level)",
                    tax_amount: total_st,
                    custom_tax_category: "Sales Tax",
                    tax_category: "Sales Tax"
                });
                console.log(`[apply_tax_summary] Added Sales Tax row: ${total_st} to account ${accounts.sales_tax_account}`);
            } else {
                if (total_st <= 0) {
                    console.log(`[apply_tax_summary] Skipping Sales Tax: amount is ${total_st}`);
                }
                if (!accounts.sales_tax_account) {
                    console.log(`[apply_tax_summary] Skipping Sales Tax: no account configured`);
                }
            }

            // Add Further Tax row if we have both amount and account
            if (total_further_tax > 0 && accounts.further_tax_account) {
                let row = frm.add_child("taxes");
                Object.assign(row, {
                    charge_type: "Actual",
                    account_head: accounts.further_tax_account,
                    description: "Further Tax (Item Level)",
                    tax_amount: total_further_tax,
                    custom_tax_category: "Further Sales Tax",
                    tax_category: "Further Sales Tax"
                });
                console.log(`[apply_tax_summary] Added Further Tax row: ${total_further_tax} to account ${accounts.further_tax_account}`);
            } else {
                if (total_further_tax <= 0) {
                    console.log(`[apply_tax_summary] Skipping Further Tax: amount is ${total_further_tax}`);
                }
                if (!accounts.further_tax_account) {
                    console.log(`[apply_tax_summary] Skipping Further Tax: no account configured`);
                }
            }

            // Apply 236G tax from template
            let advance_tax = 0;
            
            // Calculate base for 236G: total invoice value including taxes
            let tax_base_for_236g = total_inclusive;
            console.log(`[apply_tax_summary] Tax base for 236G: ${tax_base_for_236g}`);
            
            if (frm.doc.doctype === "Sales Invoice") {
                // For Sales Invoice: Calculate 236G on total inclusive amount
                advance_tax = (advance.advance_tax_rate || 0) * 0.01 * tax_base_for_236g;
                console.log(`[apply_tax_summary] Sales Invoice 236G: rate=${advance.advance_tax_rate}, base=${tax_base_for_236g}, calculated=${advance_tax}`);

                if (advance_tax > 0 && advance.advance_tax_account) {
                    let row = frm.add_child("taxes");
                    Object.assign(row, {
                        charge_type: "Actual",
                        account_head: advance.advance_tax_account,
                        description: "Advance Income Tax (236G)",
                        tax_amount: advance_tax,
                        custom_tax_category: "236G",
                        tax_category: "236G"
                    });
                    console.log(`[apply_tax_summary] Added 236G row: ${advance_tax} to account ${advance.advance_tax_account}`);
                }
            } else if (frm.doc.doctype === "Purchase Invoice") {
                // For Purchase Invoice: Apply 236G from template if available, otherwise restore preserved rows
                if (advance.advance_tax_rate && advance.advance_tax_account) {
                    // Template has 236G defined - calculate on total inclusive amount
                    advance_tax = (advance.advance_tax_rate || 0) * 0.01 * tax_base_for_236g;
                    console.log(`[apply_tax_summary] Purchase Invoice 236G from template: rate=${advance.advance_tax_rate}, calculated=${advance_tax}`);
                    
                    if (advance_tax > 0) {
                        let row = frm.add_child("taxes");
                        Object.assign(row, {
                            charge_type: "Actual",
                            account_head: advance.advance_tax_account,
                            description: "Withholding Tax (236G)",
                            tax_amount: advance_tax,
                            custom_tax_category: "236G",
                            tax_category: "236G",
                            rate: advance.advance_tax_rate
                        });
                        console.log(`[apply_tax_summary] Added 236G row: ${advance_tax} to account ${advance.advance_tax_account}`);
                    }
                } else if (preserved_236g_rows.length > 0) {
                    // No template or template has no 236G - restore manually added rows
                    preserved_236g_rows.forEach(preserved_row => {
                        let row = frm.add_child("taxes");
                        Object.assign(row, preserved_row);
                        advance_tax += flt(preserved_row.tax_amount || 0);
                    });
                    console.log(`[apply_tax_summary] Restored ${preserved_236g_rows.length} manually added 236G row(s)`);
                }
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
                total_taxes_and_charges: frm.doc.total_taxes_and_charges,
                accounts: accounts
            });
        });
    }
}


/**
 * Handle calculation for 3rd Schedule Goods items
 * Routes to either manual override or standard 3rd Schedule calculation
 * 
 * @param {Object} frm - The parent form
 * @param {Object} row - The invoice item row
 * @param {String} manual_override_field - The field being manually overridden (if any)
 */
function handle_third_schedule_item_calculation(frm, row, manual_override_field) {
    const qty = Math.abs(row.qty || 0);
    const multiplier = getMultiplier(frm, row);
    const precision = frappe.boot.sysdefaults.currency_precision || 2;

    console.log(`[handle_third_schedule_item_calculation] Processing 3rd Schedule item: ${row.item_code}`);

    // Fetch item master data and tax template
    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item",
            name: row.item_code
        },
        callback: function(itemResponse) {
            if (!itemResponse.message) {
                console.error(`[handle_third_schedule_item_calculation] Failed to fetch item: ${row.item_code}`);
                return;
            }

            const itemData = itemResponse.message;
            console.log(`[handle_third_schedule_item_calculation] Fetched item data:`, {
                custom_fixed_notified_value: itemData.custom_fixed_notified_value,
                custom_retail_price: itemData.custom_retail_price
            });

            // Fetch tax template
            fetch_item_tax_template(row, function(itemTaxTemplate) {
                let templateData = null;

                if (!itemTaxTemplate) {
                    console.warn(`[handle_third_schedule_item_calculation] No tax template found for 3rd Schedule item: ${row.item_code}`);
                    // For 3rd Schedule, template is mandatory - but we proceed with zero taxes
                    apply_third_schedule_taxes_to_row(frm, row, {
                        st: 0,
                        st_rate: 0,
                        further_tax: 0,
                        ft_rate: 0,
                        ex_sales_tax_value: 0,
                        total_incl_tax: multiplier * qty * flt(row.rate || 0, precision)
                    });
                    return;
                }

                // Fetch template data
                frappe.call({
                    method: "frappe.client.get",
                    args: {
                        doctype: "Item Tax Template",
                        name: itemTaxTemplate
                    },
                    callback: function(templateResponse) {
                        if (!templateResponse.message) {
                            console.error(`[handle_third_schedule_item_calculation] Failed to fetch template: ${itemTaxTemplate}`);
                            return;
                        }

                        templateData = templateResponse.message;

                        // Calculate taxes using 3rd Schedule logic
                        const taxResult = calculate_third_schedule_taxes(row, itemData, templateData, frm, multiplier, qty, precision);
                        
                        // Apply calculated taxes to row
                        apply_third_schedule_taxes_to_row(frm, row, taxResult);
                    },
                    error: function(err) {
                        console.error(`[handle_third_schedule_item_calculation] Error fetching template:`, err);
                    }
                });
            });
        },
        error: function(err) {
            console.error(`[handle_third_schedule_item_calculation] Error fetching item:`, err);
        }
    });
}

/**
 * Apply calculated 3rd Schedule taxes to the row and refresh
 * 
 * @param {Object} frm - The parent form
 * @param {Object} row - The invoice item row
 * @param {Object} taxResult - Result from calculate_third_schedule_taxes
 */
function apply_third_schedule_taxes_to_row(frm, row, taxResult) {
    const precision = frappe.boot.sysdefaults.currency_precision || 2;

    row.custom_st_rate = flt(taxResult.st_rate, precision);
    row.custom_st = flt(taxResult.st, precision);
    row.custom_ft_rate = flt(taxResult.ft_rate, precision);
    row.custom_further_tax = flt(taxResult.further_tax, precision);
    row.custom_at = 0;
    row.custom_total_incl_tax = flt(taxResult.total_incl_tax, precision);

    console.log(`[apply_third_schedule_taxes_to_row] Applied 3rd Schedule taxes to ${row.item_code}:`, {
        custom_st: row.custom_st,
        custom_st_rate: row.custom_st_rate,
        custom_further_tax: row.custom_further_tax,
        custom_ft_rate: row.custom_ft_rate,
        custom_total_incl_tax: row.custom_total_incl_tax
    });

    frm.refresh_field("items");

    // Trigger tax summary recalculation after row update
    setTimeout(() => {
        console.log(`[apply_third_schedule_taxes_to_row] Calling apply_tax_summary after 3rd Schedule calculation`);
        apply_tax_summary(frm);
    }, 50);
}

function calculate_taxes(frm, row, manual_override_field) {
    if (frm.doc.custom_purchase_invoice_type === "Import") {
        return;
    }

    if (frm.doc.custom_supplier_st_status === "Unregistered") {
        console.log(`[calculate_taxes] Skipping calculation for item: ${row.item_code} because supplier is unregistered`);

        // Clear all tax fields for unregistered supplier
        let qty = Math.abs(row.qty || 0);
        let base_amount = qty * row.rate;
        const multiplier = getMultiplier(frm, row);
        
        row.custom_st_rate = 0;
        row.custom_ft_rate = 0;
        row.custom_st = 0;
        row.custom_further_tax = 0;
        row.custom_at = 0;
        row.custom_total_incl_tax = multiplier * base_amount;
        
        frm.refresh_field("items");
        
        // Call apply_tax_summary to recalculate taxes table
        setTimeout(() => {
            console.log(`[calculate_taxes] Calling apply_tax_summary after clearing taxes for unregistered supplier`);
            apply_tax_summary(frm);
        }, 50);
        
        return;
    }

    if (frm.doc.custom_sales_tax_invoice === 0) {
        console.log(`[calculate_taxes] Skipping calculation for item: ${row.item_code} because its not a sales tax invoice`);

        // Clear all tax fields for unregistered supplier
        let qty = Math.abs(row.qty || 0);
        let base_amount = qty * row.rate;
        const multiplier = getMultiplier(frm, row);
        
        row.custom_st_rate = 0;
        row.custom_st = 0;
        row.custom_ft_rate = 0;
        row.custom_further_tax = 0;
        row.custom_at = 0;
        row.custom_total_incl_tax = multiplier * base_amount;
        
        frm.refresh_field("items");
        
        // Call apply_tax_summary to recalculate taxes table
        setTimeout(() => {
            console.log(`[calculate_taxes] Calling apply_tax_summary after clearing taxes for unregistered supplier`);
            apply_tax_summary(frm);
        }, 50);
        
        return;
    }

    console.log(`[calculate_taxes] Starting calculation for item: ${row.item_code}, manual_override_field: ${manual_override_field}`);

    let qty = Math.abs(row.qty || 0);
    let base_amount = qty * row.rate;
    const multiplier = getMultiplier(frm, row);
    let precision = frappe.boot.sysdefaults.currency_precision || 2;

    // Check if item is 3rd Schedule Goods - handle separately with reverse calculation
    if (row.custom_tax_classification === "3rd Schedule Goods") {
        console.log(`[calculate_taxes] Detected 3rd Schedule Goods: ${row.item_code} - routing to dedicated handler`);
        handle_third_schedule_item_calculation(frm, row, manual_override_field);
        return;
    }

    // Handle manual override scenarios
    if (manual_override_field === "custom_st") {
        // User manually changed the sales tax amount
        console.log(`[calculate_taxes] Manual override: custom_st = ${row.custom_st}`);
        
        let sales_tax = flt(row.custom_st || 0, precision);
        
        // Reverse calculate the rate from amount
        let sales_tax_rate = 0;
        if (base_amount !== 0) {
            sales_tax_rate = (sales_tax / (multiplier * base_amount)) * 100;
        }
        
        row.custom_st_rate = flt(sales_tax_rate, precision);
        row.custom_st = sales_tax;
        
        // Recalculate total including tax
        fetch_item_tax_template(row, function(item_tax_template) {
            let further_tax = 0;
            
            if (item_tax_template) {
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
                                if (
                                    rate.custom_tax_category === "Further Sales Tax" &&
                                    frm.doc.doctype === "Sales Invoice" &&
                                    frm.doc.custom_sales_tax_status === "Unregistered"
                                ) {
                                    further_tax += multiplier * (rate.tax_rate * 0.01 * base_amount);
                                }
                            });
                        }

                        row.custom_further_tax = further_tax;
                        row.custom_at = 0;
                        row.custom_total_incl_tax = multiplier * base_amount + sales_tax + further_tax;

                        frm.refresh_field("items");
                        setTimeout(() => {
                            apply_tax_summary(frm);
                        }, 50);
                    }
                });
            } else {
                row.custom_further_tax = 0;
                row.custom_at = 0;
                row.custom_total_incl_tax = multiplier * base_amount + sales_tax;
                
                frm.refresh_field("items");
                setTimeout(() => {
                    apply_tax_summary(frm);
                }, 50);
            }
        });
        
        return;
    }
    
    if (manual_override_field === "custom_st_rate") {
        // User manually changed the sales tax rate
        console.log(`[calculate_taxes] Manual override: custom_st_rate = ${row.custom_st_rate}`);

        let sales_tax_rate = flt(row.custom_st_rate || 0, precision);
        let sales_tax = multiplier * (sales_tax_rate * 0.01 * base_amount);

        row.custom_st_rate = sales_tax_rate;
        row.custom_st = flt(sales_tax, precision);

        // Recalculate total including tax
        fetch_item_tax_template(row, function(item_tax_template) {
            let further_tax = 0;

            if (item_tax_template) {
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
                                if (
                                    rate.custom_tax_category === "Further Sales Tax" &&
                                    frm.doc.doctype === "Sales Invoice" &&
                                    frm.doc.custom_sales_tax_status === "Unregistered"
                                ) {
                                    further_tax += multiplier * (rate.tax_rate * 0.01 * base_amount);
                                }
                            });
                        }

                        row.custom_further_tax = further_tax;
                        row.custom_at = 0;
                        row.custom_total_incl_tax = multiplier * base_amount + sales_tax + further_tax;

                        frm.refresh_field("items");
                        setTimeout(() => {
                            apply_tax_summary(frm);
                        }, 50);
                    }
                });
            } else {
                row.custom_further_tax = 0;
                row.custom_at = 0;
                row.custom_total_incl_tax = multiplier * base_amount + sales_tax;

                frm.refresh_field("items");
                setTimeout(() => {
                    apply_tax_summary(frm);
                }, 50);
            }
        });

        return;
    }

    if (manual_override_field === "custom_ft_rate") {
        // User manually changed the further tax rate
        console.log(`[calculate_taxes] Manual override: custom_ft_rate = ${row.custom_ft_rate}`);

        let further_tax_rate = flt(row.custom_ft_rate || 0, precision);
        let further_tax = multiplier * (further_tax_rate * 0.01 * base_amount);

        console.log(`[calculate_taxes] Calculated further_tax: ${further_tax} from rate: ${further_tax_rate}, base_amount: ${base_amount}, multiplier: ${multiplier}`);

        row.custom_ft_rate = further_tax_rate;
        row.custom_further_tax = flt(further_tax, precision);

        // Calculate sales tax (if any)
        let sales_tax = flt(row.custom_st || 0, precision);

        row.custom_at = 0;
        row.custom_total_incl_tax = multiplier * base_amount + sales_tax + further_tax;

        console.log(`[calculate_taxes] Updated row - further_tax: ${row.custom_further_tax}, total_incl_tax: ${row.custom_total_incl_tax}`);

        frm.refresh_field("items");
        setTimeout(() => {
            apply_tax_summary(frm);
        }, 50);
                
        return;
    }
 
    // Normal flow: fetch from tax template
    fetch_item_tax_template(row, function(item_tax_template) {
        let sales_tax = 0;
        let further_tax = 0;
        let sales_tax_rate = 0;
        let further_tax_rate = 0;

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
                        // ✅ CACHE THE TEMPLATE FOR LATER USE IN apply_tax_summary()
                        cache_tax_template(`template_${row.item_code}`, response.message);
                        console.log(`[calculate_taxes] Cached template for item: ${row.item_code}`);
                        
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
                                frm.doc.custom_sales_tax_status === "Unregistered"
                            ) {
                                further_tax += multiplier * (rate.tax_rate * 0.01 * base_amount);
                                further_tax_rate = rate.tax_rate;
                            }
                        });

                        // Update row fields first
                        row.custom_st_rate = flt(sales_tax_rate, precision);
                        row.custom_st = flt(sales_tax, precision);
                        row.custom_ft_rate = flt(further_tax_rate, precision);
                        row.custom_further_tax = flt(further_tax, precision);
                        row.custom_at = 0;
                        row.custom_total_incl_tax = flt(multiplier * base_amount + sales_tax + further_tax, precision);

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
            row.custom_ft_rate = 0;
            row.custom_further_tax = 0;
            row.custom_at = 0;
            row.custom_total_incl_tax = flt(multiplier * base_amount, precision);
            
            frm.refresh_field("items");
            
            // Call apply_tax_summary even when no template is found
            setTimeout(() => {
                console.log(`[calculate_taxes] Calling apply_tax_summary after clearing taxes`);
                apply_tax_summary(frm);
            }, 50);
        }
    });
}