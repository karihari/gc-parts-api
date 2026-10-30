export enum Generation {
  WK = 'WK',
  WK2 = 'WK2',
  WL = 'WL',
}

// Values match what the shop already stores in orders.status.
export enum OrderStatus {
  NEW = 'New',
  READY_FOR_PICKUP = 'Ready for pickup',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

// Values match what the shop already stores in enquiries.status.
export enum EnquiryStatus {
  NEW = 'New',
  RESOLVED = 'Resolved',
}

export enum PaymentMethod {
  CARD = 'card',
  CASH = 'cash',
}

export enum AdminRole {
  // Everything, including managing other admin users.
  ADMIN = 'admin',
  // Products, images and orders.
  STAFF = 'staff',
}

export enum SessionRevokeReason {
  LOGOUT = 'logout',
  ROTATED = 'rotated',
  REUSE_DETECTED = 'reuse_detected',
  PASSWORD_CHANGED = 'password_changed',
  USER_DISABLED = 'user_disabled',
  LOGOUT_ALL = 'logout_all',
}
