// lib/features/profile/presentation/screens/device_settings_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

// ─── Model ────────────────────────────────────────────────────────────────────

class DeviceSettings {
  final bool waiterCallAlert;
  final bool slaBreachAlert;
  final bool orderReadyAlert;
  final double soundVolume; // 0.0-1.0
  final String vibrationPattern; // 'short'|'long'|'double'
  final String reconnectStrategy; // 'aggressive'|'balanced'|'conservative'
  final bool degradedModeAutoEnable;
  final String themeMode; // 'system'|'light'|'dark'
  final bool keepScreenOn;
  final bool reduceMotion;
  final bool lowPowerMode;
  final bool backgroundSync;

  const DeviceSettings({
    required this.waiterCallAlert,
    required this.slaBreachAlert,
    required this.orderReadyAlert,
    required this.soundVolume,
    required this.vibrationPattern,
    required this.reconnectStrategy,
    required this.degradedModeAutoEnable,
    required this.themeMode,
    required this.keepScreenOn,
    required this.reduceMotion,
    required this.lowPowerMode,
    required this.backgroundSync,
  });

  DeviceSettings copyWith({
    bool? waiterCallAlert,
    bool? slaBreachAlert,
    bool? orderReadyAlert,
    double? soundVolume,
    String? vibrationPattern,
    String? reconnectStrategy,
    bool? degradedModeAutoEnable,
    String? themeMode,
    bool? keepScreenOn,
    bool? reduceMotion,
    bool? lowPowerMode,
    bool? backgroundSync,
  }) {
    return DeviceSettings(
      waiterCallAlert: waiterCallAlert ?? this.waiterCallAlert,
      slaBreachAlert: slaBreachAlert ?? this.slaBreachAlert,
      orderReadyAlert: orderReadyAlert ?? this.orderReadyAlert,
      soundVolume: soundVolume ?? this.soundVolume,
      vibrationPattern: vibrationPattern ?? this.vibrationPattern,
      reconnectStrategy: reconnectStrategy ?? this.reconnectStrategy,
      degradedModeAutoEnable: degradedModeAutoEnable ?? this.degradedModeAutoEnable,
      themeMode: themeMode ?? this.themeMode,
      keepScreenOn: keepScreenOn ?? this.keepScreenOn,
      reduceMotion: reduceMotion ?? this.reduceMotion,
      lowPowerMode: lowPowerMode ?? this.lowPowerMode,
      backgroundSync: backgroundSync ?? this.backgroundSync,
    );
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final deviceSettingsProvider = StateProvider<DeviceSettings>((ref) => const DeviceSettings(
      waiterCallAlert: true,
      slaBreachAlert: true,
      orderReadyAlert: false,
      soundVolume: 0.7,
      vibrationPattern: 'short',
      reconnectStrategy: 'balanced',
      degradedModeAutoEnable: true,
      themeMode: 'light',
      keepScreenOn: true,
      reduceMotion: false,
      lowPowerMode: false,
      backgroundSync: true,
    ));

// ─── Screen ───────────────────────────────────────────────────────────────────

class DeviceSettingsScreen extends ConsumerWidget {
  const DeviceSettingsScreen({super.key});

  String _getReconnectDescription(String strategy) {
    switch (strategy) {
      case 'aggressive':
        return 'Aggressive: Retry instantly every 1s (Max 20 attempts)';
      case 'balanced':
        return 'Balanced: Exponential backoff with jitter (Max 10 attempts)';
      case 'conservative':
        return 'Conservative: Flat backoff with long intervals (Max 5 attempts)';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(deviceSettingsProvider);
    final notifier = ref.read(deviceSettingsProvider.notifier);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final surfaceColor = isDark ? AppColors.darkSurface : Colors.white;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final textPrimary = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final textSecondary = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
      appBar: AppBar(
        title: Text(
          'Device Settings',
          style: AppTextStyles.h3.copyWith(color: textPrimary, fontWeight: FontWeight.bold),
        ),
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: borderColor),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: textPrimary),
          onPressed: () => context.pop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          // ── NOTIFICATIONS SECTION ──────────────────────────────────────────
          _buildSectionHeader('NOTIFICATIONS', textSecondary),
          _buildSettingsCard(
            surfaceColor: surfaceColor,
            borderColor: borderColor,
            children: [
              SwitchListTile(
                value: settings.waiterCallAlert,
                activeThumbColor: AppColors.primary,
                title: Text('Waiter Call Alerts', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Vibration + sound when a table calls', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(waiterCallAlert: val));
                },
              ),
              _divider(borderColor),
              SwitchListTile(
                value: settings.slaBreachAlert,
                activeThumbColor: AppColors.primary,
                title: Text('SLA Breach Alerts', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Alert when table SLA target is breached', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(slaBreachAlert: val));
                },
              ),
              _divider(borderColor),
              SwitchListTile(
                value: settings.orderReadyAlert,
                activeThumbColor: AppColors.primary,
                title: Text('Order Ready Alerts', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Notify when kitchen marks items as ready', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(orderReadyAlert: val));
                },
              ),
              _divider(borderColor),
              ListTile(
                title: Text('Alert Volume', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Column(
                  children: [
                    Row(
                      children: [
                        Icon(Icons.volume_down_rounded, size: 16, color: textSecondary),
                        Expanded(
                          child: Slider(
                            value: settings.soundVolume,
                            activeColor: AppColors.primary,
                            inactiveColor: borderColor,
                            onChanged: (val) {
                              notifier.update((s) => s.copyWith(soundVolume: val));
                            },
                            onChangeEnd: (val) => HapticFeedback.selectionClick(),
                          ),
                        ),
                        Icon(Icons.volume_up_rounded, size: 16, color: textSecondary),
                      ],
                    ),
                  ],
                ),
                trailing: Text('${(settings.soundVolume * 100).toInt()}%', style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.bold)),
              ),
              _divider(borderColor),
              ListTile(
                title: Padding(
                  padding: const EdgeInsets.only(bottom: 8.0),
                  child: Text('Vibration Pattern', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                ),
                subtitle: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'short', label: Text('Short')),
                    ButtonSegment(value: 'long', label: Text('Long')),
                    ButtonSegment(value: 'double', label: Text('Double')),
                  ],
                  selected: {settings.vibrationPattern},
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: AppColors.primary,
                    selectedForegroundColor: Colors.white,
                  ),
                  onSelectionChanged: (val) {
                    HapticFeedback.mediumImpact();
                    notifier.update((s) => s.copyWith(vibrationPattern: val.first));
                  },
                ),
              ),
            ],
          ),

          // ── CONNECTIVITY SECTION ───────────────────────────────────────────
          _buildSectionHeader('CONNECTIVITY', textSecondary),
          _buildSettingsCard(
            surfaceColor: surfaceColor,
            borderColor: borderColor,
            children: [
              ListTile(
                title: Padding(
                  padding: const EdgeInsets.only(bottom: 8.0),
                  child: Text('Reconnect Strategy', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'aggressive', label: Text('Aggressive')),
                        ButtonSegment(value: 'balanced', label: Text('Balanced')),
                        ButtonSegment(value: 'conservative', label: Text('Conservative')),
                      ],
                      selected: {settings.reconnectStrategy},
                      style: SegmentedButton.styleFrom(
                        selectedBackgroundColor: AppColors.primary,
                        selectedForegroundColor: Colors.white,
                      ),
                      onSelectionChanged: (val) {
                        HapticFeedback.mediumImpact();
                        notifier.update((s) => s.copyWith(reconnectStrategy: val.first));
                      },
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _getReconnectDescription(settings.reconnectStrategy),
                      style: AppTextStyles.caption.copyWith(color: AppColors.warning, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
              _divider(borderColor),
              SwitchListTile(
                value: settings.degradedModeAutoEnable,
                activeThumbColor: AppColors.primary,
                title: Text('Auto-enter Offline Mode', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Instantly switch to offline storage on disconnect', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(degradedModeAutoEnable: val));
                },
              ),
            ],
          ),

          // ── DISPLAY SECTION ────────────────────────────────────────────────
          _buildSectionHeader('DISPLAY', textSecondary),
          _buildSettingsCard(
            surfaceColor: surfaceColor,
            borderColor: borderColor,
            children: [
              ListTile(
                title: Padding(
                  padding: const EdgeInsets.only(bottom: 8.0),
                  child: Text('Theme Mode', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                ),
                subtitle: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'system', label: Text('System')),
                    ButtonSegment(value: 'light', label: Text('Light')),
                    ButtonSegment(value: 'dark', label: Text('Dark')),
                  ],
                  selected: {settings.themeMode},
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: AppColors.primary,
                    selectedForegroundColor: Colors.white,
                  ),
                  onSelectionChanged: (val) {
                    HapticFeedback.lightImpact();
                    notifier.update((s) => s.copyWith(themeMode: val.first));
                  },
                ),
              ),
              _divider(borderColor),
              SwitchListTile(
                value: settings.keepScreenOn,
                activeThumbColor: AppColors.primary,
                title: Text('Keep Screen On', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Prevent the device from sleeping during operations', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(keepScreenOn: val));
                },
              ),
              _divider(borderColor),
              SwitchListTile(
                value: settings.reduceMotion,
                activeThumbColor: AppColors.primary,
                title: Text('Reduce Motion', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Simplify UI transitions and pulsing animations', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(reduceMotion: val));
                },
              ),
            ],
          ),

          // ── BATTERY SECTION ────────────────────────────────────────────────
          _buildSectionHeader('BATTERY', textSecondary),
          _buildSettingsCard(
            surfaceColor: surfaceColor,
            borderColor: borderColor,
            children: [
              SwitchListTile(
                value: settings.lowPowerMode,
                activeThumbColor: AppColors.primary,
                title: Text('Low Power Sync Mode', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Throttles polling rates to 60s to conserve battery', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.mediumImpact();
                  notifier.update((s) => s.copyWith(lowPowerMode: val));
                },
              ),
              _divider(borderColor),
              SwitchListTile(
                value: settings.backgroundSync,
                activeThumbColor: AppColors.primary,
                title: Text('Background Sync', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Continue syncing offline database when app is closed', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                onChanged: (val) {
                  HapticFeedback.lightImpact();
                  notifier.update((s) => s.copyWith(backgroundSync: val));
                },
              ),
            ],
          ),

          // ── DIAGNOSTICS SECTION ────────────────────────────────────────────
          _buildSectionHeader('DIAGNOSTICS', textSecondary),
          _buildSettingsCard(
            surfaceColor: surfaceColor,
            borderColor: borderColor,
            children: [
              ListTile(
                leading: const Icon(Icons.analytics_rounded, color: AppColors.primary),
                title: Text('Runtime Diagnostics', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: textPrimary)),
                subtitle: Text('Live diagnostics panel and websocket metrics', style: AppTextStyles.bodySmall.copyWith(color: textSecondary)),
                trailing: Icon(Icons.arrow_forward_ios_rounded, size: 16, color: textSecondary),
                onTap: () {
                  HapticFeedback.selectionClick();
                  context.push('/diagnostics');
                },
              ),
            ],
          ),
          
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color textColor) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: textColor,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildSettingsCard({
    required Color surfaceColor,
    required Color borderColor,
    required List<Widget> children,
  }) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        children: children,
      ),
    );
  }

  Widget _divider(Color color) {
    return Divider(height: 1, indent: 16, color: color);
  }
}
