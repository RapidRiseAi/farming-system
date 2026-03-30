export function customerDashboard() {
  return '/customer/dashboard';
}

export function customerVehicle(id: string) {
  return `/customer/vehicles/${id}`;
}

export function customerVehicleTimeline(id: string) {
  return `/customer/vehicles/${id}/timeline`;
}

export function customerVehicleDocuments(id: string) {
  return `/customer/vehicles/${id}/documents`;
}

export function customerVehicleNew() {
  return '/customer/vehicles/new';
}

export function workshopDashboard() {
  return '/workshop/dashboard';
}

export function farmDashboard() {
  return '/farm/dashboard';
}

export function customerInvoices() {
  return '/customer/invoices';
}
