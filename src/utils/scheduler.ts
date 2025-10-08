// AbortController is available globally in Node.js 15+

export interface SchedulerOptions {
  onOverrun?: "skip" | "wait" | "parallel";
  jitterMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ScheduledTask {
  stop: () => void;
  isRunning: () => boolean;
  lastRun: () => Date | null;
  nextRun: () => Date | null;
}

/**
 * Safe scheduler wrapper that prevents overlapping runs and provides timeouts
 */
export function every(
  label: string,
  intervalMs: number,
  task: () => Promise<void>,
  options: SchedulerOptions = {}
): ScheduledTask {
  const {
    onOverrun = "skip",
    jitterMs = 5000,
    timeoutMs = 20000,
    maxRetries = 2,
  } = options;

  let isRunning = false;
  let lastRun: Date | null = null;
  let nextRun: Date | null = null;
  let intervalId: NodeJS.Timeout | null = null;
  let retryCount = 0;

  const addJitter = () => {
    if (jitterMs > 0) {
      return Math.random() * jitterMs;
    }
    return 0;
  };

  const executeTask = async () => {
    if (isRunning) {
      switch (onOverrun) {
        case "skip":
          console.log(`[SCHED:${label}] SKIP - previous run still active`);
          return;
        case "wait":
          console.log(
            `[SCHED:${label}] WAIT - waiting for previous run to complete`
          );
          while (isRunning) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          break;
        case "parallel":
          console.log(
            `[SCHED:${label}] PARALLEL - running alongside previous run`
          );
          break;
      }
    }

    isRunning = true;
    const startTime = Date.now();
    const abortController = new AbortController();

    try {
      console.log(`[SCHED:${label}] START`);

      // Set timeout
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      await task();

      clearTimeout(timeoutId);
      lastRun = new Date();
      retryCount = 0; // Reset retry count on success

      const duration = Date.now() - startTime;
      console.log(`[SCHED:${label}] DONE - ${duration}ms`);
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.name === "AbortError") {
        console.error(`[SCHED:${label}] TIMEOUT after ${duration}ms`);
      } else {
        console.error(
          `[SCHED:${label}] ERROR after ${duration}ms:`,
          error.message || error
        );

        // Retry logic for non-abort errors
        if (retryCount < maxRetries) {
          retryCount++;
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
          console.log(
            `[SCHED:${label}] RETRY ${retryCount}/${maxRetries} in ${retryDelay}ms`
          );

          setTimeout(() => {
            if (!isRunning) {
              executeTask();
            }
          }, retryDelay);
        } else {
          console.error(
            `[SCHED:${label}] MAX_RETRIES exceeded, skipping this cycle`
          );
        }
      }
    } finally {
      isRunning = false;
      nextRun = new Date(Date.now() + intervalMs + addJitter());
    }
  };

  const start = () => {
    if (intervalId) return; // Already running

    // Initial run with jitter
    const initialDelay = intervalMs + addJitter();
    nextRun = new Date(Date.now() + initialDelay);

    setTimeout(() => {
      void executeTask();

      // Start regular interval
      intervalId = setInterval(() => {
        void executeTask();
      }, intervalMs);
    }, initialDelay);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // Start immediately
  start();

  return {
    stop,
    isRunning: () => isRunning,
    lastRun: () => lastRun,
    nextRun: () => nextRun,
  };
}
