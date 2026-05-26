import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface RegistryRecord {
  projection_name: string;
  projection_version: number;
  snapshot_version: number;
  rebuild_generation: number;
  is_compatible: boolean;
}

export class ProjectionRegistryService {
  /**
   * Asserts compatibility of a projection schema version before execution.
   */
  static async validateCompatibility(
    projectionName: string,
    requiredVersion: number
  ): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('projection_schema_registry')
        .select('*')
        .eq('projection_name', projectionName)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Register the projection dynamically on first access
        await supabaseAdmin.from('projection_schema_registry').insert({
          projection_name: projectionName,
          projection_version: requiredVersion,
          snapshot_version: 1,
          is_compatible: true,
        });
        logger.info({ name: projectionName, version: requiredVersion }, 'Registered new projection schema');
        return true;
      }

      const record = data as RegistryRecord;

      if (!record.is_compatible || record.projection_version !== requiredVersion) {
        logger.warn(
          { name: projectionName, active: record.projection_version, required: requiredVersion },
          'Schema version mismatch or incompatible projection state detected'
        );
        return false;
      }

      return true;
    } catch (err: any) {
      logger.error({ err, name: projectionName }, 'Failed to validate projection schema compatibility');
      return false;
    }
  }

  /**
   * Triggers authoritative invalidation of a projection.
   */
  static async invalidateProjection(projectionName: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('projection_schema_registry')
        .update({
          is_compatible: false,
          rebuild_generation: Date.now(),
        })
        .eq('projection_name', projectionName);
      logger.info({ name: projectionName }, 'Authoritatively invalidated projection schema');
    } catch (err: any) {
      logger.error({ err, name: projectionName }, 'Failed to invalidate projection schema');
    }
  }
}
