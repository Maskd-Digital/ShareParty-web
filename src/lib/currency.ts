/** Amounts in minor units (cents) per BUILD_PLAN */
export function formatMinorAmount(minor: number, isoCurrency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: isoCurrency,
  }).format(minor / 100);
}
