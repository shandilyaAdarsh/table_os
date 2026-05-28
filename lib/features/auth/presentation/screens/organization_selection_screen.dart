import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../state/auth_notifier.dart';
import '../../domain/entities/organization.dart';
import 'package:flutter_animate/flutter_animate.dart';

class OrganizationSelectionScreen extends ConsumerStatefulWidget {
  const OrganizationSelectionScreen({super.key});

  @override
  ConsumerState<OrganizationSelectionScreen> createState() => _OrganizationSelectionScreenState();
}

class _OrganizationSelectionScreenState extends ConsumerState<OrganizationSelectionScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final notifier = ref.read(authNotifierProvider.notifier);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    const brandRed = Color(0xFFE31E24);

    final filteredOrgs = notifier.mockOrganizations
        .where((org) => org.name.toLowerCase().contains(_searchQuery.toLowerCase()))
        .toList();

    // Determine grid columns based on screen width
    int crossAxisCount = 1;
    final screenWidth = MediaQuery.of(context).size.width;
    if (screenWidth >= 1024) {
      crossAxisCount = 3;
    } else if (screenWidth >= 768) {
      crossAxisCount = 2;
    }

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8F9FA),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(
            color: isDark ? Colors.white10 : const Color(0xFFE2E8F0),
            height: 1,
          ),
        ),
        title: Row(
          children: [
            Icon(Icons.business_center_rounded, color: isDark ? AppColors.primary : brandRed),
            const SizedBox(width: 12),
            Text(
              'Select Organization',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: Icon(Icons.logout_rounded, color: isDark ? Colors.white70 : const Color(0xFF64748B)),
            tooltip: 'Logout',
            onPressed: () {
              // Usually calls logout, for now we just pop or do nothing
              context.go('/welcome');
            },
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1280),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
                  child: Column(
                    children: [
                      // Header & Search Context
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final isMobile = constraints.maxWidth < 768;
                          if (isMobile) {
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Joined Organizations',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w700,
                                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Select a restaurant group below to access its dashboard, inventory, and analytics.',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    color: isDark ? Colors.white60 : const Color(0xFF64748B),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                _buildSearchField(isDark),
                              ],
                            );
                          }
                          return Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Joined Organizations',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 32,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: -0.5,
                                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Select a restaurant group below to access its dashboard, inventory, and analytics.',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 16,
                                        color: isDark ? Colors.white60 : const Color(0xFF64748B),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 24),
                              SizedBox(
                                width: 320,
                                child: _buildSearchField(isDark),
                              ),
                            ],
                          );
                        }
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          
          if (notifier.mockOrganizations.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.business_rounded, size: 64, color: AppColors.secondary.withValues(alpha: 0.5)),
                    const SizedBox(height: 16),
                    Text(
                      'No organizations available',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Please contact your system administrator.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                  ],
                ).animate().fadeIn(duration: 400.ms),
              ),
            )
          else if (filteredOrgs.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Text('No organizations found matching search criteria.'),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              sliver: SliverToBoxAdapter(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1280),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        return GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: crossAxisCount,
                            childAspectRatio: 1.25,
                            crossAxisSpacing: 24,
                            mainAxisSpacing: 24,
                          ),
                          itemCount: filteredOrgs.length,
                          itemBuilder: (context, index) {
                            return _buildOrgCard(filteredOrgs[index], isDark, notifier, index);
                          },
                        );
                      }
                    ),
                  ),
                ),
              ),
            ),
            
          const SliverPadding(padding: EdgeInsets.only(bottom: 40)),
        ],
      ),
    );
  }

  Widget _buildSearchField(bool isDark) {
    return TextField(
      controller: _searchController,
      style: GoogleFonts.plusJakartaSans(
        fontSize: 14,
        color: isDark ? Colors.white : const Color(0xFF0F172A),
      ),
      decoration: InputDecoration(
        hintText: 'Search organizations...',
        hintStyle: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          color: isDark ? Colors.white54 : const Color(0xFF94A3B8),
        ),
        prefixIcon: Icon(Icons.search_rounded, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
        filled: true,
        fillColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE31E24)),
        ),
      ),
      onChanged: (val) {
        setState(() {
          _searchQuery = val;
        });
      },
    );
  }

  Widget _buildOrgCard(Organization org, bool isDark, AuthNotifier notifier, int index) {
    final isSuspended = index % 3 == 2; // Mock suspended state for some cards
    
    // Some mock images from the design
    final images = [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAXx7y0Uub55mG6DlgbJwbtipI5d6NCWIDnVVbSNAMZ-5kE5iWLnR_FEgLhWhfsHmvX9qxBP9wP56vE6rmWTlvG2TodcMkBQCz0yHCEBcTTuxCZZjlFuX20yOZdZS9wRdo-Sh-lwmNFW4Eu9wW5GOYtw4DxKR_VnE8rujwQu50j6RWJGElkV5cA5KaUKP_ddvenq5CpgelIsSqIWfdmPydKOvFcBU1ngx1q3Q6jrwMAVxmwX4oJ-OPRotK25ofUaLLnFWqhdvBBxg26',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAlxnVWrM1VncbuHiP0lnyRbk7652bdqJh-UgN4q5phvllLyS2R_NNui1gEZXYnvr86Lxga1mwQfA6uhkgkA1v2lSrEhiPt38Td88tT-h-YnOUKF2IaippeDAzzxwoNI_RYo2FDCdhqXwfLgIoxYdFWuTAXPOuUwcTZL0eVh99bRkE3IYD9119N3s4_j4-mWe92qXOOf-AVFj9S7L3T7gFJ8Ss0pYpObqyGcMreUC4Wz3PgBmeSGBmaBKFvB6IRmTqcFsLoCBHbIXc-',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCewbGhIkTvo3Mb3QgzzWFn2-mR_vDFfHdGp8qdnkLHrml9p-jTE84Up8bJAd9ZPNFFp18YV2YG7HfSAwon9v4cSN9QOlKOE4qEPU-uQp59JIOBjWHC0ubSXJ7ZyPUNWP9VpbM9gFEh06WGxsk2iRt5d2VHE66e7R4DcRlt_Ks8zMeKyvsTUF4PAtuQF4lxtekOEascHuAXef5_tkcyahZkK8LzxefovPMJXS9TbxIqheCs_OgOShAPPiMSAX8NiDUFHiLNtmSzG2uH',
    ];
    final imageUrl = images[index % images.length];

    return Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
      ),
      color: isDark ? const Color(0xFF1E293B) : Colors.white,
      child: InkWell(
        onTap: isSuspended ? null : () {
          notifier.selectOrganization(org);
          context.go('/branch-select');
        },
        child: Opacity(
          opacity: isSuspended ? 0.75 : 1.0,
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: isDark ? Colors.white10 : const Color(0xFFF1F5F9)),
                        image: isSuspended ? null : DecorationImage(
                          image: NetworkImage(imageUrl),
                          fit: BoxFit.cover,
                        ),
                        color: isSuspended ? (isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)) : null,
                      ),
                      child: isSuspended ? Icon(Icons.store_rounded, size: 32, color: isDark ? Colors.white54 : const Color(0xFF94A3B8)) : null,
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isSuspended 
                            ? (isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2)) 
                            : (isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isSuspended ? Icons.block_rounded : Icons.check_circle_rounded,
                            size: 14,
                            color: isSuspended ? (isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C)) : (isDark ? Colors.white : const Color(0xFF0F172A)),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            isSuspended ? 'Suspended' : 'Active',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: isSuspended ? (isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB91C1C)) : (isDark ? Colors.white : const Color(0xFF0F172A)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  org.name,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.location_on_rounded, size: 16, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
                    const SizedBox(width: 6),
                    Text(
                      '${(index * 3) + 4} Locations • Regional',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        color: isDark ? Colors.white54 : const Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                const Divider(height: 1),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isSuspended ? 'Contact Support' : 'Enter Dashboard',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white70 : const Color(0xFF475569),
                      ),
                    ),
                    Icon(
                      isSuspended ? Icons.help_outline_rounded : Icons.arrow_forward_rounded,
                      size: 20,
                      color: isDark ? Colors.white70 : const Color(0xFF475569),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    ).animate().fadeIn(delay: (index * 50).ms, duration: 400.ms).slideY(begin: 0.1);
  }
}
