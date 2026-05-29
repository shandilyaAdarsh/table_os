export class TimeBucketTracker {
  private buckets: Map<number, number> = new Map();
  private bucketSizeMs: number;

  constructor(bucketSizeMs: number = 5000) {
    this.bucketSizeMs = bucketSizeMs;
  }

  public increment(amount: number = 1, timestampMs: number = Date.now()) {
    const bucketKey = Math.floor(timestampMs / this.bucketSizeMs) * this.bucketSizeMs;
    const current = this.buckets.get(bucketKey) || 0;
    this.buckets.set(bucketKey, current + amount);
  }

  public getSumInWindow(windowSizeMs: number, currentTimestampMs: number = Date.now()): number {
    const cutoff = currentTimestampMs - windowSizeMs;
    let sum = 0;
    
    // Clean up old buckets while we iterate
    const keysToDelete: number[] = [];
    
    for (const [key, value] of this.buckets.entries()) {
      if (key < cutoff) {
        keysToDelete.push(key);
      } else {
        sum += value;
      }
    }
    
    for (const key of keysToDelete) {
      this.buckets.delete(key);
    }
    
    return sum;
  }
}
