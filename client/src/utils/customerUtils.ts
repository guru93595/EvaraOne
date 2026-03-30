/**
 * Standardized customer name resolution utility.
 * Enforces the "display_name || full_name" priority rule across the application.
 */
export const getCustomerName = (customer: any): string => {
  if (!customer) return "Unknown Customer";
  const name = customer.display_name || customer.displayName || customer.full_name || customer.fullName || customer.name;
  return name || "Unnamed Customer";
};

export const getZoneName = (zone: any): string => {
  if (!zone) return "No Zone Assigned";
  return zone.zoneName || zone.name || "Unnamed Zone";
};
