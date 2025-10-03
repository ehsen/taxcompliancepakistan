app_name = "taxcompliancepakistan"
app_title = "TaxCompliancePakistan"
app_publisher = "SpotLedger"
app_description = "An app to for end to end compliance with Pakistan\'s tax laws."
app_email = "ehsensiraj@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "taxcompliancepakistan",
# 		"logo": "/assets/taxcompliancepakistan/logo.png",
# 		"title": "TaxCompliancePakistan",
# 		"route": "/taxcompliancepakistan",
# 		"has_permission": "taxcompliancepakistan.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/taxcompliancepakistan/css/taxcompliancepakistan.css"
app_include_js = "/assets/taxcompliancepakistan/js/js_overrides/taxation.js"

doctype_js = {
    "Purchase Invoice": "public/js/js_overrides/purchase_invoice.js",
    "Sales Invoice": "public/js/js_overrides/sales_invoice.js"
}

# include js, css files in header of web template
# web_include_css = "/assets/taxcompliancepakistan/css/taxcompliancepakistan.css"
# web_include_js = "/assets/taxcompliancepakistan/js/taxcompliancepakistan.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "taxcompliancepakistan/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "taxcompliancepakistan/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "taxcompliancepakistan.utils.jinja_methods",
# 	"filters": "taxcompliancepakistan.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "taxcompliancepakistan.install.before_install"
# after_install = "taxcompliancepakistan.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "taxcompliancepakistan.uninstall.before_uninstall"
# after_uninstall = "taxcompliancepakistan.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "taxcompliancepakistan.utils.before_app_install"
# after_app_install = "taxcompliancepakistan.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "taxcompliancepakistan.utils.before_app_uninstall"
# after_app_uninstall = "taxcompliancepakistan.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "taxcompliancepakistan.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# TODO: Remove this once we have a proper solution for purchase invoice, 
# as calculations should come from js code not from backend, 
# in purchase data entry manual adjustments required due to rounding off diff with suppliers
doc_events = {
    "Sales Invoice": {
        "on_save": "taxcompliancepakistan.utilities.tax_overrides.sales_invoice_on_update"
    },
    #"Purchase Invoice": {
     #   "on_update": "taxcompliancepakistan.utilities.tax_overrides.purchase_invoice_on_update"
    #},
    "Payment Entry": {
        "on_update": "taxcompliancepakistan.utilities.wht_overrides.on_payment_entry_update"
    }
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"taxcompliancepakistan.tasks.all"
# 	],
# 	"daily": [
# 		"taxcompliancepakistan.tasks.daily"
# 	],
# 	"hourly": [
# 		"taxcompliancepakistan.tasks.hourly"
# 	],
# 	"weekly": [
# 		"taxcompliancepakistan.tasks.weekly"
# 	],
# 	"monthly": [
# 		"taxcompliancepakistan.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "taxcompliancepakistan.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "taxcompliancepakistan.event.get_events"
# }

# Override Payment Entry build_gl_map method
override_whitelisted_methods = {
    "erpnext.accounts.doctype.payment_entry.payment_entry.PaymentEntry.build_gl_map": "taxcompliancepakistan.utilities.tax_overrides.payment_entry_build_gl_map"
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "taxcompliancepakistan.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically caSales Taxes and Chargesncelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["taxcompliancepakistan.utils.before_request"]
# after_request = ["taxcompliancepakistan.utils.after_request"]

# Job Events
# ----------
# before_job = ["taxcompliancepakistan.utils.before_job"]
# after_job = ["taxcompliancepakistan.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"taxcompliancepakistan.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Fixtures

fixtures = [
    {
        "dt": "Custom Field",  # DocType for the fixture
        "filters": [
            ["module", "=", "TaxCompliancePakistan"]  # Only include fields from this module
        ]
    },
     {
        "dt": "Property Setter",  # DocType for the fixture
        "filters": [
            ["module", "=", "TaxCompliancePakistan"]  # Only include fields from this module
        ]
    },
    
   
]
