/**
 * Standard date utilities.
 */
export const DateUtils = {
  /**
   * Returns current date in ISO format.
   */
  now(): string {
    return new Date().toISOString();
  },

  /**
   * Formats a date string to a specific locale.
   */
  formatLocale(date: string | Date, locale: string = 'en-US'): string {
    return new Date(date).toLocaleDateString(locale);
  },

  /**
   * Returns if a date is expired.
   */
  isExpired(date: string | Date): boolean {
    return new Date(date).getTime() < Date.now();
  },

  /**
   * Add minutes to a date.
   */
  addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60000);
  },
};
