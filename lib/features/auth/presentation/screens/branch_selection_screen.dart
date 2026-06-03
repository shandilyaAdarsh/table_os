import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/branch.dart';
import '../state/auth_notifier.dart';
import '../../providers/auth_repository_provider.dart';

class BranchSelectionScreen extends ConsumerStatefulWidget {
  const BranchSelectionScreen({super.key});

  @override
  ConsumerState<BranchSelectionScreen> createState() => _BranchSelectionScreenState();
}

class _BranchSelectionScreenState extends ConsumerState<BranchSelectionScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  List<Branch> _branches = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadBranches();
  }

  Future<void> _loadBranches() async {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final authState = ref.read(authNotifierProvider);
      final orgId = authState.selectedOrg?.id;
      print('[BranchSelection] Selected Org ID: $orgId');
      if (orgId == null) return;

      final repo = ref.read(authRepositoryProvider);
      final branches = await repo.getBranchesForOrganization(orgId);
      print('[BranchSelection] Fetched ${branches.length} branches from repo');
      if (mounted) {
        setState(() {
          _branches = branches;
          _isLoading = false;
        });
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final notifier = ref.read(authNotifierProvider.notifier);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final selectedOrg = authState.selectedOrg;
    if (selectedOrg == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go('/org-select');
      });
      return const SizedBox.shrink();
    }

    if (_isLoading) {
      return Scaffold(
        backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8F9FA),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final filteredBranches = _branches
        .where((b) => b.name.toLowerCase().contains(_searchQuery.toLowerCase()))
        .toList();

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
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: isDark ? Colors.white : const Color(0xFF0F172A)),
          onPressed: () => context.go('/org-select'),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              selectedOrg.name.toUpperCase(),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 1,
                color: isDark ? Colors.white54 : const Color(0xFF64748B),
              ),
            ),
            Text(
              'Select a Branch',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        actions: [
          if (screenWidth >= 768)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: SizedBox(
                width: 250,
                child: _buildSearchField(isDark),
              ),
            ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          if (screenWidth < 768)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: _buildSearchField(isDark),
              ),
            ),
            
          if (filteredBranches.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.store_rounded, size: 64, color: AppColors.secondary.withValues(alpha: 0.5)),
                    const SizedBox(height: 16),
                    Text(
                      'No branches available',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Could not find any locations.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                      ),
                    ),
                  ],
                ).animate().fadeIn(duration: 400.ms),
              ),
            )
          else
            SliverPadding(
              padding: EdgeInsets.fromLTRB(24, screenWidth < 768 ? 0 : 32, 24, 40),
              sliver: SliverToBoxAdapter(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1280),
                    child: GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        childAspectRatio: 0.85,
                        crossAxisSpacing: 24,
                        mainAxisSpacing: 24,
                      ),
                      itemCount: filteredBranches.length,
                      itemBuilder: (context, index) {
                        return _buildBranchCard(filteredBranches[index], isDark, notifier, index);
                      },
                    ),
                  ),
                ),
              ),
            ),
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
        hintText: 'Find a location...',
        hintStyle: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          color: isDark ? Colors.white54 : const Color(0xFF94A3B8),
        ),
        prefixIcon: Icon(Icons.search_rounded, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
        filled: true,
        fillColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(100),
          borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(100),
          borderSide: BorderSide(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(100),
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

  Widget _buildBranchCard(Branch branch, bool isDark, AuthNotifier notifier, int index) {
    final isOffline = branch.status == BranchStatus.outage;
    
    // Mock images from design
    final images = [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDojPYtbbbqRSsYGnogGIhyN6Fnq9OrSDAJSl0wnLOIGRRVhHUpaZ1IN2Ncaq2ahTM2nNjvZXNrBrkeS-kvdUih5Ig08GTClyjfcpPVxQrQFTfl8iKEnw8YTqwS2LAkV-BI_VkaD7hTzzdQ4BH0rvQFWuSSL8xHJRlblLxv8H7XW8EgsdA__-dxLxUsS9-5vdZysYsMYqeamATjOUAk4Qx1ZAto59nrm5HMcmbqSH729U-c5FK6Td1k6dO8l7gXhciyRptDV0ZEOyFm',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD2x6Qz1k_QspR5NtGtspiFgG78JiekBdCwd5_9Jz87Aa5s_a0pRFWnyaXUwyv7sPy5rZejbbqCZNg91zxlzBQbYBb6bnpmO1bCeGXDxbAvhA6LwUlR5W0r36KbqRCqpPTnm4uAUxLgUCT1opWjNBqZosGBNnV7oOwiBPM6KwwmmLl_tRaUMOyQlo5WgCGIVhZUT3psutAcN-q7TzubnmRHmILYRcgTP9ujolHPWeNm-Xhv7mahuMRH-AX6m-7xmsAGrfKH2oc6sHw0',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDbYL2Y1mMzoCJj-M7M6ljMhaO-yCtERmFnQABrr5nSrgNVRYHyv9UG1LtGq6n0NSroIDKpr8P3ZFkBQH9fIXwTsRisMa2DTrZZJ2C3krJ19Tx1bYf4viT30x-VqpRj_7A5UKRH5ZWyoGjCN64rYl75T3rq_3O-0wThV8ybKpFC_RlzHErJORwvCl4eNxSrmgnJbnGwKuF6nko1Ll4I3Pw9nCeyqsWpTIs5sW__zt-8UpBtzElqYutFaQha-EC7HessJH8oFQgo99T2',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAQ9kZOw-ycUrTSToRHjt18gKXIwOsh7m9d797eCD7YmGYDKULxHtv5TqcXv8QlsNZotCN4iwMHkRjzoNGmC7fqcnfN1_epSJBXpMEEAhGVs5IRVOfdqMu_TmO4_713R_XgO8nyLbZdnWID0mA0cDwx4TGoUgRg-8vOopbqnOyFYyn0-uDBmIqo86s9_w_pmfmn5zh-_1L2zXB91MpG8tw3hdSbmpV4qJA-CZPq6YUWCmMT0H9Xa-CXGAo9XRDrzJVCMLdg-mTlVUL1',
    ];
    final imageUrl = images[index % images.length];

    Color getStatusColor() {
      switch (branch.status) {
        case BranchStatus.open: return const Color(0xFFE31E24);
        case BranchStatus.busy: return Colors.orange;
        case BranchStatus.outage: return isDark ? Colors.white54 : const Color(0xFF64748B);
      }
    }
    
    String getStatusText() {
      switch (branch.status) {
        case BranchStatus.open: return 'Open Now';
        case BranchStatus.busy: return 'Busy';
        case BranchStatus.outage: return 'Closed';
      }
    }

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
        onTap: () {
          if (isOffline) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('${branch.name} is in outage mode. Booting into local offline mode...'),
                backgroundColor: AppColors.warning,
              ),
            );
          }
          notifier.selectBranch(branch);
          context.go('/login');
        },
        child: Opacity(
          opacity: isOffline ? 0.8 : 1.0,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Image Header
              SizedBox(
                height: 160,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ColorFiltered(
                      colorFilter: isOffline 
                          ? const ColorFilter.matrix([
                              0.3, 0.59, 0.11, 0, 0,
                              0.3, 0.59, 0.11, 0, 0,
                              0.3, 0.59, 0.11, 0, 0,
                              0, 0, 0, 1, 0,
                            ]) // Grayscale
                          : const ColorFilter.mode(Colors.transparent, BlendMode.multiply),
                      child: Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.6),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      top: 16,
                      right: 16,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF0F172A).withValues(alpha: 0.9) : Colors.white.withValues(alpha: 0.95),
                          borderRadius: BorderRadius.circular(100),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: getStatusColor(),
                                shape: BoxShape.circle,
                              ),
                            ).animate(onPlay: (c) => isOffline ? null : c.repeat()).fade(duration: 800.ms),
                            const SizedBox(width: 6),
                            Text(
                              getStatusText(),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Body content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Branch: ${branch.name}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : const Color(0xFF0F172A),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Tap to login to this branch',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          color: isDark ? Colors.white60 : const Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Icon(Icons.location_on_rounded, size: 16, color: isDark ? Colors.white54 : const Color(0xFF64748B)),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              '${100 + index * 15} Commerce St',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14,
                                color: isDark ? Colors.white54 : const Color(0xFF64748B),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),
                      const Divider(height: 1),
                      const SizedBox(height: 16),
                      // Metrics
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Active Staff',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: isDark ? Colors.white54 : const Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(Icons.group_rounded, size: 18, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                                  const SizedBox(width: 4),
                                  Text(
                                    isOffline ? '0' : '${branch.activeStaff}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Active Orders',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: isDark ? Colors.white54 : const Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(Icons.receipt_long_rounded, size: 18, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                                  const SizedBox(width: 4),
                                  Text(
                                    isOffline ? '0' : '${(index + 1) * 6}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      // Action Button
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: isOffline 
                              ? (isDark ? const Color(0xFF0F172A) : Colors.white)
                              : (isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
                          borderRadius: BorderRadius.circular(12),
                          border: isOffline ? Border.all(color: isDark ? Colors.white10 : const Color(0xFFE2E8F0)) : null,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              isOffline ? 'View Details' : 'Select Location',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Icon(
                              isOffline ? Icons.visibility_rounded : Icons.arrow_forward_rounded,
                              size: 18,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(delay: (index * 50).ms, duration: 400.ms).slideY(begin: 0.1);
  }
}
