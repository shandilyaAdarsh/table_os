// ============================================================
// src/modules/observability/correlation-graph.indexer.ts
// Adjacency indexing and cursor traversal for telemetry graphs.
// ============================================================

import { RuntimeEventTelemetry } from './telemetry.types';

export interface GraphCursorResponse {
  nodes: RuntimeEventTelemetry[];
  nextCursor?: string;
  hasMore: boolean;
}

export class CorrelationGraphIndexer {
  // tenant_id -> Graph structure
  private static graphIndexes: Map<string, {
    parentToChildren: Map<string, string[]>;
    nodeToMetadata: Map<string, RuntimeEventTelemetry>;
    nodeToReplayChain: Map<string, string>;
    nodeToIncident: Map<string, string>;
  }> = new Map();

  private static getGraph(tenantId: string) {
    if (!this.graphIndexes.has(tenantId)) {
      this.graphIndexes.set(tenantId, {
        parentToChildren: new Map(),
        nodeToMetadata: new Map(),
        nodeToReplayChain: new Map(),
        nodeToIncident: new Map()
      });
    }
    return this.graphIndexes.get(tenantId)!;
  }

  public static indexEvent(event: RuntimeEventTelemetry): void {
    const graph = this.getGraph(event.tenant_id);
    const nodeId = event.correlation_id;

    graph.nodeToMetadata.set(nodeId, event);

    if (event.parent_correlation_id) {
      const parentId = event.parent_correlation_id;
      const children = graph.parentToChildren.get(parentId) || [];
      if (!children.includes(nodeId)) {
        children.push(nodeId);
        graph.parentToChildren.set(parentId, children);
      }
    }

    if (event.replay_chain_id) {
      graph.nodeToReplayChain.set(nodeId, event.replay_chain_id);
    }

    if (event.incident_id) {
      graph.nodeToIncident.set(nodeId, event.incident_id);
    }
  }

  /**
   * Fetch children of a node using cursor pagination.
   */
  public static fetchChildren(
    tenantId: string, 
    parentId: string, 
    limit: number = 20, 
    cursorIndex: number = 0
  ): GraphCursorResponse {
    const graph = this.getGraph(tenantId);
    const childrenIds = graph.parentToChildren.get(parentId) || [];
    
    const pageIds = childrenIds.slice(cursorIndex, cursorIndex + limit);
    const nodes = pageIds.map(id => graph.nodeToMetadata.get(id)).filter(Boolean) as RuntimeEventTelemetry[];
    
    const hasMore = cursorIndex + limit < childrenIds.length;
    return {
      nodes,
      nextCursor: hasMore ? String(cursorIndex + limit) : undefined,
      hasMore
    };
  }

  /**
   * Fetch a node directly.
   */
  public static getNode(tenantId: string, correlationId: string): RuntimeEventTelemetry | undefined {
    return this.getGraph(tenantId).nodeToMetadata.get(correlationId);
  }
}
