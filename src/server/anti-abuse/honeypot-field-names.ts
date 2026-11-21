import { randomInt } from "node:crypto";

export const honeypotFieldNames = [
  "account_reference", "billing_contact_code", "billing_department", "business_category", "business_extension",
  "business_fax", "business_profile", "business_region", "company_alias", "company_directory",
  "company_division", "company_extension", "company_fax", "company_number", "company_office",
  "company_profile", "company_registration", "company_size", "contact_department", "contact_extension",
  "contact_fax", "contact_position", "contact_reference", "contact_timezone", "customer_category",
  "customer_code", "customer_reference", "department_code", "department_name", "directory_listing",
  "division_name", "emergency_contact", "employment_status", "industry_segment", "invoice_reference",
  "legal_entity", "office_extension", "office_location", "organisation_unit", "preferred_contact",
  "registration_code", "sales_region", "service_category", "tax_reference", "team_department",
  "trade_reference", "visitor_company", "work_department", "work_extension", "work_location",
] as const;

export function selectHoneypotFieldName() {
  return honeypotFieldNames[randomInt(honeypotFieldNames.length)]!;
}
