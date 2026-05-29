// ============================================================
// src/modules/observability/runtime-incident.registry.ts
// Centralized operational source of truth for runtime incidents.
// ============================================================

import { TelemetrySeverity, TelemetryEventType, RuntimeEventTelemetry } from './telemetry.types';

export type IncidentState = 'OPEN' | 'ACKNOWLEDGED' | 'MITIGATING' | 'STABLE' | 'RESOLVED' | 'ARCHIVED';
export type EscalationLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DriftClassification = 'ACUTE' | 'CHRONIC' | 'NONE';

export interface IncidentStateTransition {
  state: IncidentState;
  timestamp: string;
  note?: string;
  engineer?: string;
}

export interface RuntimeIncident {
  incident_id: string;
  tenant_id: string;
  state: IncidentState;
  severity: TelemetrySeverity;
  primary_event_type: TelemetryEventType;
  escalation_level: EscalationLevel;
  drift_classification: DriftClassification;
  
  parent_incident_id?: string;
  related_incident_ids: string[];
  
  created_at: string;
  updated_at: string;
  
  // Operational Annotations
  owned_by?: string;
  assigned_engineer?: string;
  mitigation_notes: string[];
  resolution_summary?: string;
  state_transitions: IncidentStateTransition[];
  
  // Tracing
  linked_certification_runs: string[];
  divergence_group_id?: string;
  replay_chains: string[];
  
  // Telemetry fragments
  events_count: number;
  last_event_timestamp: string;
}

export class RuntimeIncidentRegistry {
  private static incidents: Map<string, RuntimeIncident> = new Map();
  // Optional: keep raw events here or rely on the aggregator
  private static incidentEvents: Map<string, RuntimeEventTelemetry[]> = new Map();

  public static createIncident(
    tenant_id: string,
    event: RuntimeEventTelemetry
  ): RuntimeIncident {
    const incident_id = event.incident_id || `inc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    
    const incident: RuntimeIncident = {
      incident_id,
      tenant_id,
      state: 'OPEN',
      severity: event.severity,
      primary_event_type: event.event_type,
      escalation_level: this.determineInitialEscalation(event.event_type, event.severity),
      drift_classification: this.determineDriftClassification(event.event_type),
      related_incident_ids: [],
      created_at: now,
      updated_at: now,
      state_transitions: [{ state: 'OPEN', timestamp: now }],
      mitigation_notes: [],
      linked_certification_runs: event.certification_run_id ? [event.certification_run_id] : [],
      replay_chains: event.replay_chain_id ? [event.replay_chain_id] : [],
      events_count: 1,
      last_event_timestamp: event.event_timestamp
    };

    // Attempt incident merging
    const mergedParent = this.attemptIncidentMerge(incident);
    if (mergedParent) {
      incident.parent_incident_id = mergedParent.incident_id;
      mergedParent.related_incident_ids.push(incident.incident_id);
      mergedParent.updated_at = now;
      this.incidents.set(mergedParent.incident_id, mergedParent);
    }

    this.incidents.set(incident_id, incident);
    this.incidentEvents.set(incident_id, [event]);
    return incident;
  }

  public static updateIncidentState(
    incident_id: string,
    newState: IncidentState,
    engineer?: string,
    note?: string
  ): RuntimeIncident | null {
    const incident = this.incidents.get(incident_id);
    if (!incident) return null;

    incident.state = newState;
    incident.updated_at = new Date().toISOString();
    incident.state_transitions.push({
      state: newState,
      timestamp: incident.updated_at,
      note,
      engineer
    });

    if (engineer) {
      incident.assigned_engineer = engineer;
      if (!incident.owned_by) incident.owned_by = engineer;
    }
    if (note) incident.mitigation_notes.push(`[${newState}] ${note}`);

    return incident;
  }

  public static attachEvent(incident_id: string, event: RuntimeEventTelemetry): void {
    const incident = this.incidents.get(incident_id);
    if (!incident) return;

    incident.events_count++;
    incident.updated_at = new Date().toISOString();
    if (event.event_timestamp > incident.last_event_timestamp) {
      incident.last_event_timestamp = event.event_timestamp;
    }

    if (event.replay_chain_id && !incident.replay_chains.includes(event.replay_chain_id)) {
      incident.replay_chains.push(event.replay_chain_id);
    }
    
    if (event.certification_run_id && !incident.linked_certification_runs.includes(event.certification_run_id)) {
      incident.linked_certification_runs.push(event.certification_run_id);
    }

    const events = this.incidentEvents.get(incident_id) || [];
    events.push(event);
    this.incidentEvents.set(incident_id, events);
  }

  public static getIncident(incident_id: string): RuntimeIncident | undefined {
    return this.incidents.get(incident_id);
  }

  public static getIncidentsByTenant(tenant_id: string): RuntimeIncident[] {
    return Array.from(this.incidents.values()).filter(i => i.tenant_id === tenant_id);
  }

  public static getIncidentEvents(incident_id: string): RuntimeEventTelemetry[] {
    return this.incidentEvents.get(incident_id) || [];
  }

  private static determineInitialEscalation(type: TelemetryEventType, severity: TelemetrySeverity): EscalationLevel {
    if (type.includes('PROJECTION_DRIFT') || type.includes('STORM') || type.includes('LOOP')) return 'CRITICAL';
    if (severity === 'CRITICAL') return 'CRITICAL';
    if (severity === 'WARNING') return 'MEDIUM';
    if (type.includes('DISCONNECT') || type.includes('FAIL')) return 'HIGH';
    return 'LOW';
  }

  private static determineDriftClassification(type: TelemetryEventType): DriftClassification {
    const acuteTypes = ['WATERMARK_ROLLBACK_DETECTED', 'DUPLICATE_REPLAY_STORM_DETECTED', 'REPLAY_LOOP_DETECTED', 'TRANSPORT_DIVERGENCE_DETECTED'];
    const chronicTypes = ['PROJECTION_DRIFT_DETECTED', 'QUEUE_STARVATION_DETECTED', 'PROPAGATION_DEGRADATION_DETECTED', 'REPLAY_LAG_DETECTED'];
    
    if (acuteTypes.includes(type)) return 'ACUTE';
    if (chronicTypes.includes(type)) return 'CHRONIC';
    return 'NONE';
  }

  /**
   * Merging heuristics to prevent incident explosion.
   * Groups acute transport/replay spikes under active chronic or parent transport incidents.
   */
  private static attemptIncidentMerge(newIncident: RuntimeIncident): RuntimeIncident | null {
    // Look for active incidents on the same tenant within the last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    const activeRelated = Array.from(this.incidents.values()).filter(i => {
      return i.tenant_id === newIncident.tenant_id &&
             i.state !== 'RESOLVED' && i.state !== 'ARCHIVED' &&
             i.incident_id !== newIncident.incident_id &&
             new Date(i.last_event_timestamp).getTime() > fiveMinutesAgo;
    });

    if (activeRelated.length === 0) return null;

    // Rule 1: Group Replay/Projection issues under an active Transport Divergence
    if (newIncident.primary_event_type !== 'TRANSPORT_DIVERGENCE_DETECTED') {
      const parentTransport = activeRelated.find(i => i.primary_event_type === 'TRANSPORT_DIVERGENCE_DETECTED');
      if (parentTransport) return parentTransport;
    }

    // Rule 2: Group duplicate Acute events
    const sameType = activeRelated.find(i => i.primary_event_type === newIncident.primary_event_type);
    if (sameType) return sameType;

    return null;
  }
}
