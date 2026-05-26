// lib/features/staff/presentation/screens/staff_presence_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_colors.dart';

// ─── Domain imports ───────────────────────────────────────────────────────────────────

import '../../domain/entities/staff_presence.dart';
import '../state/staff_presence_governance_providers.dart';

// ─── Screen ──────────────────────────────────────────────────────────────────

extension StaffPresenceRecordX on StaffPresenceRecord {
  Color get presenceColor => switch (status) {
    StaffPresenceStatus.online => AppColors.success,
    StaffPresenceStatus.busy => AppColors.warning,
    StaffPresenceStatus.away => AppColors.secondary,
    StaffPresenceStatus.onBreak => const Color(0xFF0EA5E9), // info
    StaffPresenceStatus.closingShift => AppColors.primary,
    StaffPresenceStatus.offline => Colors.grey,
  };

  String get statusLabel => switch (status) {
    StaffPresenceStatus.online => 'Online',
    StaffPresenceStatus.busy => 'Busy',
    StaffPresenceStatus.away => 'Away',
    StaffPresenceStatus.onBreak => 'On Break',
    StaffPresenceStatus.closingShift => 'Closing Shift',
    StaffPresenceStatus.offline => 'Offline',
  };
}

class StaffPresenceScreen extends ConsumerStatefulWidget {
  const StaffPresenceScreen({super.key});

  @override
  ConsumerState<StaffPresenceScreen> createState() => _StaffPresenceScreenState();
}

class _StaffPresenceScreenState extends ConsumerState<StaffPresenceScreen>
    with SingleTickerProviderStateMixin {
  bool _showOffline = true;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final staffAsync = ref.watch(presenceProjectionProvider);
    final overloaded = ref.watch(governedOverloadedStaffProvider);
    final branchLoad = ref.watch(governedBranchLoadProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return staffAsync.when(
      loading: () => Scaffold(
        backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (e, st) => Scaffold(
        backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
        body: Center(child: Text('Error loading presence: $e')),
      ),
      data: (staff) {
        final onlineCount = staff.where((s) => s.isOnline).length;

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        elevation: 0,
        title: const Text('Floor Presence', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            icon: Icon(_showOffline ? Icons.visibility_rounded : Icons.visibility_off_rounded),
            tooltip: 'Toggle offline staff',
            onPressed: () => setState(() => _showOffline = !_showOffline),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: Colors.grey,
          indicatorColor: AppColors.primary,
          tabs: const [Tab(text: 'All Staff'), Tab(text: 'Sections'), Tab(text: 'Alerts')],
        ),
      ),
      body: Column(
        children: [
          _buildSummaryHeader(context, onlineCount, staff.length, branchLoad, overloaded.length, isDark),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildAllStaffTab(staff, isDark),
                _buildSectionsTab(staff, isDark),
                _buildAlertsTab(overloaded, isDark),
              ],
            ),
          ),
        ],
      ),
    );
      },
    );
  }

  Widget _buildSummaryHeader(BuildContext context, int online, int total, double load, int overloadCount, bool isDark) {
    final loadColor = load < 0.6 ? AppColors.success : load < 0.8 ? AppColors.warning : AppColors.error;
    return Container(
      color: isDark ? AppColors.darkSurface : Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Row(
        children: [
          Expanded(child: _SummaryKpi(label: 'Online', value: '$online / $total', color: AppColors.success)),
          Expanded(child: _SummaryKpi(label: 'Overloaded', value: '$overloadCount', color: overloadCount > 0 ? AppColors.error : AppColors.success)),
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text('Branch Load', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                  const Spacer(),
                  Text('${(load * 100).toStringAsFixed(0)}%', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: loadColor)),
                ]),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(value: load, minHeight: 8, backgroundColor: loadColor.withValues(alpha: 0.15), valueColor: AlwaysStoppedAnimation<Color>(loadColor)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAllStaffTab(List<StaffPresenceRecord> staff, bool isDark) {
    final filtered = _showOffline ? staff : staff.where((s) => s.status != StaffPresenceStatus.offline).toList();
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: MediaQuery.of(context).size.width > 720 ? 3 : 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.9,
      ),
      itemCount: filtered.length,
      itemBuilder: (_, i) => _StaffPresenceCard(record: filtered[i], isDark: isDark),
    );
  }

  Widget _buildSectionsTab(List<StaffPresenceRecord> staff, bool isDark) {
    final sections = <String, List<StaffPresenceRecord>>{};
    for (final s in staff) {
      final sec = s.sectionLabel ?? 'Unassigned';
      sections.putIfAbsent(sec, () => []).add(s);
    }

    return ListView(
      padding: const EdgeInsets.all(12),
      children: sections.entries.map((e) {
        final sec = e.key;
        final members = e.value;
        final activeCount = members.fold(0, (sum, m) => sum + m.activeTableCount);
        final isOverloaded = members.any((m) => m.isOverloaded);

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: isOverloaded ? AppColors.warning.withValues(alpha: 0.5) : (isDark ? AppColors.darkBorder : AppColors.lightBorder)),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Text(sec, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const Spacer(),
                Text('$activeCount active tables', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                if (isOverloaded) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                    child: const Text('OVERLOAD', style: TextStyle(color: AppColors.warning, fontSize: 9, fontWeight: FontWeight.w900)),
                  ),
                ],
              ]),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: members.map((m) => _StaffMiniChip(record: m)).toList(),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildAlertsTab(List<StaffPresenceRecord> overloaded, bool isDark) {
    if (overloaded.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 56),
          const SizedBox(height: 12),
          const Text('No overload alerts', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          Text('All staff within capacity', style: TextStyle(color: Colors.grey[500])),
        ]),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.error.withValues(alpha: 0.3))),
          child: Row(children: [
            const Icon(Icons.warning_rounded, color: AppColors.error, size: 20),
            const SizedBox(width: 8),
            Text('${overloaded.length} staff member${overloaded.length > 1 ? 's' : ''} overloaded', style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w700)),
          ]),
        ),
        const SizedBox(height: 12),
        ...overloaded.map((s) => _OverloadAlertCard(record: s, isDark: isDark)),
      ],
    );
  }
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

class _StaffPresenceCard extends StatelessWidget {
  final StaffPresenceRecord record;
  final bool isDark;
  const _StaffPresenceCard({required this.record, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final slaColor = record.slaComplianceRate >= 0.9 ? AppColors.success : record.slaComplianceRate >= 0.7 ? AppColors.warning : AppColors.error;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: record.isOverloaded ? AppColors.warning.withValues(alpha: 0.5) : (isDark ? AppColors.darkBorder : AppColors.lightBorder)),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Stack(children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: record.presenceColor.withValues(alpha: 0.15),
                child: Text(record.name[0], style: TextStyle(color: record.presenceColor, fontWeight: FontWeight.w800, fontSize: 16)),
              ),
              Positioned(
                right: 0, bottom: 0,
                child: Container(
                  width: 10, height: 10,
                  decoration: BoxDecoration(
                    color: record.presenceColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: isDark ? AppColors.darkSurface : Colors.white, width: 2),
                  ),
                ),
              ),
            ]),
            const Spacer(),
            if (record.isOverloaded)
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: const Icon(Icons.warning_rounded, size: 14, color: AppColors.warning),
              ),
          ]),
          const SizedBox(height: 8),
          Text(record.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13), overflow: TextOverflow.ellipsis),
          Text(record.role, style: TextStyle(color: Colors.grey[500], fontSize: 11)),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            decoration: BoxDecoration(color: record.presenceColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
            child: Text(record.statusLabel, style: TextStyle(color: record.presenceColor, fontSize: 10, fontWeight: FontWeight.w700)),
          ),
          const Spacer(),
          if (record.sectionLabel != null) ...[
            Text(record.sectionLabel!, style: TextStyle(color: Colors.grey[500], fontSize: 11)),
            const SizedBox(height: 4),
          ],
          Row(children: [
            const Icon(Icons.table_restaurant_rounded, size: 13, color: AppColors.primary),
            const SizedBox(width: 4),
            Text('${record.activeTableCount}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
            const Spacer(),
            Text('${(record.slaComplianceRate * 100).toStringAsFixed(0)}%', style: TextStyle(color: slaColor, fontWeight: FontWeight.w700, fontSize: 12)),
          ]),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: record.slaComplianceRate,
              minHeight: 4,
              backgroundColor: slaColor.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation<Color>(slaColor),
            ),
          ),
        ],
      ),
    );
  }
}

class _StaffMiniChip extends StatelessWidget {
  final StaffPresenceRecord record;
  const _StaffMiniChip({required this.record});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: record.presenceColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: record.presenceColor.withValues(alpha: 0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7, decoration: BoxDecoration(color: record.presenceColor, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text(record.name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        if (record.activeTableCount > 0) ...[
          const SizedBox(width: 4),
          Text('(${record.activeTableCount})', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
        ],
      ]),
    );
  }
}

class _OverloadAlertCard extends StatelessWidget {
  final StaffPresenceRecord record;
  final bool isDark;
  const _OverloadAlertCard({required this.record, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
      ),
      padding: const EdgeInsets.all(14),
      child: Row(children: [
        CircleAvatar(radius: 18, backgroundColor: AppColors.warning.withValues(alpha: 0.15), child: Text(record.name[0], style: const TextStyle(color: AppColors.warning, fontWeight: FontWeight.w800))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(record.name, style: const TextStyle(fontWeight: FontWeight.w800)),
          Text('${record.activeTableCount} tables · ${record.sectionLabel ?? 'Unassigned'}', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
        ])),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${record.activeTableCount}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22, color: AppColors.warning)),
          const Text('tables', style: TextStyle(color: AppColors.warning, fontSize: 11)),
        ]),
      ]),
    );
  }
}

class _SummaryKpi extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SummaryKpi({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color)),
      Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
    ]);
  }
}
