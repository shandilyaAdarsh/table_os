import React, { useState } from 'react';
import { useConnectivityStore } from '../../store/connectivityStore';
import { useRuntimeIdentityStore } from '../../store/runtimeIdentityStore';
import { useMutationCoordinator } from '../../store/mutationCoordinator';
import { useProjectionCoordinator } from '../../store/projectionCoordinator';

export default function RuntimeDiagnostics() {
  const [isOpen, setIsOpen] = useState(false);

  const { isOnline, lastHeartbeat, lastSuccessfulPing } = useConnectivityStore();
  const { deviceId, terminalId, branchId, runtimeSessionId } = useRuntimeIdentityStore();
  const { queue, isDraining } = useMutationCoordinator();
  const { lastAppliedSequence, isReplaying, isFetchingSnapshot, pendingInvalidations } = useProjectionCoordinator();

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 z-50"
      >
        Diag
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-96 max-h-[80vh] overflow-y-auto bg-slate-900 text-green-400 font-mono text-xs p-4 shadow-2xl z-50 rounded-tl-lg border-t border-l border-slate-700">
      <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
        <h3 className="font-bold text-white">Runtime Diagnostics</h3>
        <button onClick={() => setIsOpen(false)} className="text-red-400 hover:text-red-300">Close</button>
      </div>

      <Section title="Connectivity">
        <div>Status: <span className={isOnline ? 'text-green-500' : 'text-red-500'}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span></div>
        <div>Last Heartbeat: {new Date(lastHeartbeat).toLocaleTimeString()}</div>
        <div>Last API Ping: {new Date(lastSuccessfulPing).toLocaleTimeString()}</div>
      </Section>

      <Section title="Identity">
        <div>Device ID: {deviceId.slice(0,8)}...</div>
        <div>Terminal ID: {terminalId || 'Not Registered'}</div>
        <div>Branch ID: {branchId || 'None'}</div>
        <div>Session ID: {runtimeSessionId.slice(0,8)}...</div>
      </Section>

      <Section title="Mutation Coordinator">
        <div>Draining: {isDraining ? 'Yes' : 'No'}</div>
        <div>Queue Size: {queue.length}</div>
        <div className="mt-2 space-y-1">
          {queue.map(m => (
            <div key={m.mutation_id} className="pl-2 border-l border-green-800">
              <span className="text-blue-400">[{m.status}]</span> {m.type} (Seq: {m.mutation_sequence})
            </div>
          ))}
        </div>
      </Section>

      <Section title="Projection Coordinator">
        <div>Sequence: {lastAppliedSequence}</div>
        <div>Replaying: {isReplaying ? 'Yes' : 'No'}</div>
        <div>Fetching Snapshot: {isFetchingSnapshot ? 'Yes' : 'No'}</div>
        <div>Pending Invalidations: {Array.from(pendingInvalidations).join(', ') || 'None'}</div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <h4 className="text-blue-300 font-semibold mb-1 uppercase tracking-wider">{title}</h4>
      <div className="pl-2 space-y-1 opacity-90">
        {children}
      </div>
    </div>
  );
}
