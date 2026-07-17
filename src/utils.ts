export const formatIDR = (value: number): string => {
  return 'Rp ' + Math.round(value).toLocaleString('id-ID');
};

// --------------------------------------------------------------------
// Membership / loyalty tiers
//
// Tier is intentionally NOT stored on the customer record - it's derived
// purely from visitsCount, which is already tracked automatically at
// every checkout (see checkoutController.ts). This keeps tier always
// accurate with zero migration/backfill risk. `isMember` (stored on the
// customer) only controls whether the 5% auto-discount + tier tracking
// applies at all - it's switched on once by a kasir/therapist via
// "Jadikan Member" and never automatically off.
//
// Gifts/vouchers per tier are decided and handed out manually by the
// outlet - this app only surfaces which tier a member has reached, it
// does not track whether a gift/voucher has been claimed.
// --------------------------------------------------------------------

export type MembershipTier = 'BASIC' | 'SILVER' | 'GOLD' | 'PLATINUM';

export const MEMBERSHIP_DISCOUNT_PERCENT = 5;

export const MEMBERSHIP_TIERS: Record<
  MembershipTier,
  { label: string; minVisits: number; badgeClass: string; perk: string }
> = {
  BASIC: {
    label: 'Basic',
    minVisits: 0,
    badgeClass: 'bg-slate-200 text-slate-700',
    perk: 'Diskon otomatis 5% setiap transaksi.',
  },
  SILVER: {
    label: 'Silver',
    minVisits: 10,
    badgeClass: 'bg-slate-300 text-slate-800',
    perk: 'Diskon 5% + berhak menerima gift/voucher Silver (diberikan manual oleh outlet).',
  },
  GOLD: {
    label: 'Gold',
    minVisits: 20,
    badgeClass: 'bg-[#D4AF37]/20 text-[#8a6d1a]',
    perk: 'Diskon 5% + berhak menerima gift/voucher Gold (diberikan manual oleh outlet).',
  },
  PLATINUM: {
    label: 'Platinum',
    minVisits: 30,
    badgeClass: 'bg-[#1a1c1e] text-[#D4AF37]',
    perk: 'Diskon 5% + berhak menerima gift/voucher Platinum (diberikan manual oleh outlet).',
  },
};

const TIER_ORDER: MembershipTier[] = ['BASIC', 'SILVER', 'GOLD', 'PLATINUM'];

/** Derives the membership tier from a customer's total visitsCount. */
export const getMembershipTier = (visitsCount: number): MembershipTier => {
  if (visitsCount >= MEMBERSHIP_TIERS.PLATINUM.minVisits) return 'PLATINUM';
  if (visitsCount >= MEMBERSHIP_TIERS.GOLD.minVisits) return 'GOLD';
  if (visitsCount >= MEMBERSHIP_TIERS.SILVER.minVisits) return 'SILVER';
  return 'BASIC';
};

/** How many more visits until the next tier up (null if already Platinum). */
export const visitsUntilNextTier = (
  visitsCount: number
): { nextTier: MembershipTier; visitsRemaining: number } | null => {
  const currentIndex = TIER_ORDER.indexOf(getMembershipTier(visitsCount));
  const nextTier = TIER_ORDER[currentIndex + 1];
  if (!nextTier) return null;
  return {
    nextTier,
    visitsRemaining: Math.max(0, MEMBERSHIP_TIERS[nextTier].minVisits - visitsCount),
  };
};
