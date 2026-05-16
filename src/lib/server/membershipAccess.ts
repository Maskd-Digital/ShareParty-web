export type MembershipRow = {
  status: string;
  payment_status: string;
};

export type LibraryPaymentRow = {
  requires_paid_membership: boolean;
};

/** Member may browse catalog / request loans when membership is active and payment satisfied. */
export function hasCatalogAccess(membership: MembershipRow, library: LibraryPaymentRow): boolean {
  if (membership.status !== "active") return false;
  if (!library.requires_paid_membership) return true;
  return membership.payment_status === "paid";
}
