export function formatMinorCurrency(amountMinor: number, currencyCode: string): string {
  try {
    const formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
    });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / 10 ** fractionDigits);
  } catch {
    return `${currencyCode} ${amountMinor}`;
  }
}
