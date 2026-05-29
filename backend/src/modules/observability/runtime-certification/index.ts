// ============================================================
// src/modules/observability/runtime-certification/index.ts
// Entrypoint for executing the runtime certification harness.
// ============================================================

import { CertificationHarness, CertificationResult } from './certification.harness';
import { AllScenarios } from './scenarios';

export class RuntimeCertificationRunner {
  public static async runAll(): Promise<CertificationResult[]> {
    const results: CertificationResult[] = [];
    
    for (const scenario of AllScenarios) {
      const harness = new CertificationHarness(scenario.id);
      const result = await harness.run(scenario);
      results.push(result);
    }
    
    return results;
  }

  public static async runScenario(scenarioId: string): Promise<CertificationResult | null> {
    const scenario = AllScenarios.find(s => s.id === scenarioId);
    if (!scenario) return null;

    const harness = new CertificationHarness(scenario.id);
    return await harness.run(scenario);
  }

  public static getPaginatedTrace(runId: string, startIndex: number, endIndex: number, direction: 'asc' | 'desc' = 'asc') {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'artifacts');
    if (!fs.existsSync(dir)) return { trace: [], total: 0 };
    
    const files = fs.readdirSync(dir);
    const targetFile = files.find((f: string) => f.includes(runId));
    if (!targetFile) return { trace: [], total: 0 };

    const content = fs.readFileSync(path.join(dir, targetFile), 'utf-8');
    const result = JSON.parse(content) as CertificationResult;
    
    let trace = result.trace || [];
    const total = trace.length;

    if (direction === 'desc') {
      trace = [...trace].reverse();
    }

    return {
      trace: trace.slice(startIndex, endIndex),
      total
    };
  }
}
