import { create } from 'zustand';

// ─── Lease Timing Constants ───────────────────────────────────────────────────
const IS_DEV = import.meta.env.DEV ?? true;

const LEADER_HEARTBEAT_INTERVAL = IS_DEV ? 3_000 : 20_000;
const STALE_LEASE_TTL           = IS_DEV ? 8_000 : 45_000;
const BROADCAST_CHANNEL_NAME    = 'orderlyy-kds-leadership';

let _broadcastChannel = null;

function getBroadcastChannel() {
  if (!_broadcastChannel && typeof BroadcastChannel !== 'undefined') {
    _broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
  return _broadcastChannel;
}

// Global runtime epoch for this specific module evaluation/session
const RUNTIME_EPOCH = `${Date.now()}-${crypto.randomUUID()}`;
let hmrReplacementCount = 0;

if (import.meta.hot) {
  hmrReplacementCount = import.meta.hot.data?.hmrReplacementCount || 0;
  import.meta.hot.data.hmrReplacementCount = hmrReplacementCount + 1;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useLeadershipStore = create((set, get) => ({
  isLeader: false,
  isAttemptingLock: false,
  lockName: null,
  leaderHeartbeatAge: 0,
  lastHeartbeatAt: null,
  leaderRuntimeEpoch: null, // Track the epoch of the current leader
  
  // Diagnostic state
  runtimeEpoch: RUNTIME_EPOCH,
  hmrReplacementCount,
  activeIntervals: 0,
  activeListeners: 0,
  isDisposed: false,

  // Internal handles
  _abortController: null,
  _heartbeatBroadcastTimer: null,
  _staleLeaseCheckTimer: null,
  _lockResolve: null,

  requestLeadership: (stationId) => {
    if (get().isDisposed) {
      console.warn('[Leadership] Cannot request lock — runtime is disposed.');
      return;
    }

    if (!navigator.locks) {
      console.warn('[Leadership] Web Locks API not supported. Falling back to multi-active mode.');
      set({ isLeader: true });
      return;
    }

    const { isAttemptingLock, isLeader, lockName } = get();

    if ((isAttemptingLock || isLeader) && lockName === `kds-station-${stationId || 'global'}`) {
      return;
    }

    const resolvedLockName = `kds-station-${stationId || 'global'}`;
    const controller = new AbortController();

    get()._abortController?.abort();
    set({ isAttemptingLock: true, lockName: resolvedLockName, isLeader: false });
    Object.assign(useLeadershipStore, { _abortController: controller });

    console.info(`[Leadership] Requesting exclusive lock: ${resolvedLockName} (TTL: ${STALE_LEASE_TTL}ms)`);

    _startStaleLeaseWatcher(stationId);

    navigator.locks.request(
      resolvedLockName,
      { mode: 'exclusive', signal: controller.signal },
      (lock) => {
        if (get().isDisposed) {
          console.warn('[Leadership] Lock acquired but runtime is disposed. Releasing immediately.');
          return Promise.resolve(); // Release immediately
        }

        set({ isLeader: true, isAttemptingLock: false, leaderRuntimeEpoch: RUNTIME_EPOCH });
        console.info(`[Leadership] ✅ Lock acquired: ${resolvedLockName}. This tab is LEADER (Epoch: ${RUNTIME_EPOCH}).`);

        _stopStaleLeaseWatcher();
        _startLeaderHeartbeat(resolvedLockName);

        return new Promise((resolve) => {
          Object.assign(useLeadershipStore, { _lockResolve: resolve });
        });
      }
    ).catch((err) => {
      if (err.name === 'AbortError') {
        console.info(`[Leadership] Lock request for ${resolvedLockName} aborted.`);
      } else {
        console.error('[Leadership] Lock request failed:', err);
      }
      set({ isAttemptingLock: false });
    });
  },

  releaseLeadership: () => {
    if (get().isDisposed) return;
    
    console.info(`[Leadership] Releasing leadership manually...`);
    const { lockName } = get();

    _stopLeaderHeartbeat();
    _stopStaleLeaseWatcher();

    const resolve = useLeadershipStore._lockResolve;
    if (resolve) {
      resolve();
      Object.assign(useLeadershipStore, { _lockResolve: null });
    }

    const controller = useLeadershipStore._abortController;
    if (controller) {
      controller.abort();
      Object.assign(useLeadershipStore, { _abortController: null });
    }

    set({ isLeader: false, isAttemptingLock: false, lockName: null, leaderRuntimeEpoch: null });
  },

  forceLeadershipRecovery: (stationId) => {
    if (get().isDisposed) return;
    console.warn('[Leadership] ⚡ Force leadership recovery triggered.');

    // 1. Ask current leader to step down immediately
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage({
        type: 'FORCE_YIELD',
        stationId,
        epoch: RUNTIME_EPOCH
      });
    }

    // 2. Release any of our own pending lock acquisitions
    get().releaseLeadership();

    // 3. Request lock again
    setTimeout(() => {
      if (!get().isDisposed) {
        get().requestLeadership(stationId);
      }
    }, 300);
  },

  // ── Centralized Runtime Disposal ──
  disposeLeadership: () => {
    if (get().isDisposed) return; // Idempotent guard
    
    console.warn(`[Leadership] 🛑 Disposing runtime epoch ${RUNTIME_EPOCH}...`);

    // 1. Mark as disposed immediately to intercept async callbacks
    set({ isDisposed: true });

    // 2. Stop timers & listeners
    _stopLeaderHeartbeat();
    _stopStaleLeaseWatcher();
    
    // 3. Close BroadcastChannel
    if (_broadcastChannel) {
      _broadcastChannel.close();
      _broadcastChannel = null;
    }

    // 4. Release Web Locks
    const resolve = useLeadershipStore._lockResolve;
    if (resolve) {
      resolve();
      Object.assign(useLeadershipStore, { _lockResolve: null });
    }

    // 5. Abort pending lock acquisitions
    const controller = useLeadershipStore._abortController;
    if (controller) {
      controller.abort();
      Object.assign(useLeadershipStore, { _abortController: null });
    }

    // 6. Clear transient ownership state
    set({
      isLeader: false,
      isAttemptingLock: false,
      lockName: null,
      leaderRuntimeEpoch: null,
      activeIntervals: 0,
      activeListeners: 0
    });

    console.info(`[Leadership] ✅ Runtime epoch ${RUNTIME_EPOCH} disposed.`);
  },
  
  // Dev utility
  restartRuntime: () => {
    const stationId = get().lockName?.replace('kds-station-', '') || null;
    get().disposeLeadership();
    
    // Simulate a hard restart after brief delay
    setTimeout(() => {
      set({ isDisposed: false, runtimeEpoch: `${Date.now()}-${crypto.randomUUID()}` });
      if (stationId) {
        get().requestLeadership(stationId);
      }
    }, 500);
  }
}));

// ─── Lifecycle Event Listeners ───────────────────────────────────────────────

const beforeUnloadHandler = () => {
  // Best-effort synchronous cleanup on tab close
  const state = useLeadershipStore.getState();
  if (state.isLeader && !state.isDisposed) {
    console.info('[Leadership] Window closing — releasing lock (best-effort).');
    const resolve = useLeadershipStore._lockResolve;
    if (resolve) resolve();
  }
};

window.addEventListener('beforeunload', beforeUnloadHandler);

// ─── Leader Heartbeat (BroadcastChannel) ─────────────────────────────────────

function _startLeaderHeartbeat(lockName) {
  _stopLeaderHeartbeat();

  const channel = getBroadcastChannel();
  if (!channel) return;

  const broadcast = () => {
    if (useLeadershipStore.getState().isDisposed || !useLeadershipStore.getState().isLeader) {
      _stopLeaderHeartbeat();
      return;
    }
    channel.postMessage({
      type: 'LEADER_HEARTBEAT',
      lockName,
      ts: Date.now(),
      epoch: RUNTIME_EPOCH
    });
  };

  const onMessage = (event) => {
    if (useLeadershipStore.getState().isDisposed) return;
    if (event.data?.type === 'FORCE_YIELD') {
      console.warn(`[Leadership] ⚠️ Received FORCE_YIELD command from epoch ${event.data.epoch}. Stepping down.`);
      useLeadershipStore.getState().releaseLeadership();
    }
  };

  channel.addEventListener('message', onMessage);
  broadcast(); // immediate ping
  const timer = setInterval(broadcast, LEADER_HEARTBEAT_INTERVAL);

  Object.assign(useLeadershipStore, { 
    _heartbeatBroadcastTimer: timer,
    _leaderMessageListener: onMessage
  });
  useLeadershipStore.setState(s => ({ 
    activeIntervals: s.activeIntervals + 1,
    activeListeners: s.activeListeners + 1 
  }));
}

function _stopLeaderHeartbeat() {
  const timer = useLeadershipStore._heartbeatBroadcastTimer;
  if (timer) {
    clearInterval(timer);
    Object.assign(useLeadershipStore, { _heartbeatBroadcastTimer: null });
    useLeadershipStore.setState(s => ({ activeIntervals: Math.max(0, s.activeIntervals - 1) }));
  }

  const channel = _broadcastChannel;
  const listener = useLeadershipStore._leaderMessageListener;
  if (channel && listener) {
    channel.removeEventListener('message', listener);
    Object.assign(useLeadershipStore, { _leaderMessageListener: null });
    useLeadershipStore.setState(s => ({ activeListeners: Math.max(0, s.activeListeners - 1) }));
  }
}

// ─── Stale Lease Watcher (standby side) ──────────────────────────────────────

function _startStaleLeaseWatcher(stationId) {
  _stopStaleLeaseWatcher();

  const channel = getBroadcastChannel();
  if (!channel) return;

  let lastHeartbeatAt = Date.now();
  let currentLeaderEpoch = null;

  const onMessage = (event) => {
    if (useLeadershipStore.getState().isDisposed) return;
    
    if (event.data?.type === 'LEADER_HEARTBEAT') {
      lastHeartbeatAt = Date.now();
      
      if (currentLeaderEpoch !== event.data.epoch) {
        currentLeaderEpoch = event.data.epoch;
        useLeadershipStore.setState({ leaderRuntimeEpoch: currentLeaderEpoch });
      }

      useLeadershipStore.setState({
        leaderHeartbeatAge: 0,
        lastHeartbeatAt,
      });
    }
  };

  channel.addEventListener('message', onMessage);
  useLeadershipStore.setState(s => ({ activeListeners: s.activeListeners + 1 }));

  const checkTimer = setInterval(() => {
    const state = useLeadershipStore.getState();

    if (state.isDisposed) {
      _stopStaleLeaseWatcher();
      return;
    }

    if (state.isLeader) {
      _stopStaleLeaseWatcher();
      return;
    }

    const age = Date.now() - lastHeartbeatAt;
    useLeadershipStore.setState({ leaderHeartbeatAge: age });

    if (age > STALE_LEASE_TTL) {
      console.warn(`[Leadership] ⚠️ Stale lease detected — no heartbeat for ${age}ms. Triggering recovery...`);
      _stopStaleLeaseWatcher();
      state.forceLeadershipRecovery(stationId);
    }
  }, 1_000);

  Object.assign(useLeadershipStore, { 
    _staleLeaseCheckTimer: checkTimer,
    _messageListener: onMessage // Store reference for removal
  });
  useLeadershipStore.setState(s => ({ activeIntervals: s.activeIntervals + 1 }));
}

function _stopStaleLeaseWatcher() {
  const timer = useLeadershipStore._staleLeaseCheckTimer;
  if (timer) {
    clearInterval(timer);
    Object.assign(useLeadershipStore, { _staleLeaseCheckTimer: null });
    useLeadershipStore.setState(s => ({ activeIntervals: Math.max(0, s.activeIntervals - 1) }));
  }

  const channel = _broadcastChannel;
  const listener = useLeadershipStore._messageListener;
  if (channel && listener) {
    channel.removeEventListener('message', listener);
    Object.assign(useLeadershipStore, { _messageListener: null });
    useLeadershipStore.setState(s => ({ activeListeners: Math.max(0, s.activeListeners - 1) }));
  }
}

// ─── HMR Cleanup Hook ────────────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    useLeadershipStore.getState().disposeLeadership();
  });
}
