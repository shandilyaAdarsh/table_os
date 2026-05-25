// lib/core/widgets/responsive_example.dart
// This is an example file showing how to use the responsive utilities
// You can delete this file after understanding the concepts

import 'package:flutter/material.dart';
import '../utils/responsive.dart';
import '../theme/app_spacing.dart';
import 'responsive_builder.dart';

class ResponsiveExampleScreen extends StatelessWidget {
  const ResponsiveExampleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Responsive Design Example'),
      ),
      body: SingleChildScrollView(
        padding: AppSpacing.pagePadding(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Example 1: Screen Information
            _buildScreenInfo(context),
            
            AppSpacing.sectionSpacing(context),
            
            // Example 2: Responsive Container
            _buildResponsiveContainer(context),
            
            AppSpacing.sectionSpacing(context),
            
            // Example 3: Responsive Layout
            _buildResponsiveLayout(context),
            
            AppSpacing.sectionSpacing(context),
            
            // Example 4: Responsive Grid
            _buildResponsiveGrid(context),
          ],
        ),
      ),
    );
  }

  Widget _buildScreenInfo(BuildContext context) {
    final responsive = Responsive(context);
    
    return Card(
      child: Padding(
        padding: AppSpacing.cardPadding(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Screen Information',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            SizedBox(height: AppSpacing.sm(context)),
            Text('Width: ${responsive.width.toStringAsFixed(0)}px'),
            Text('Height: ${responsive.height.toStringAsFixed(0)}px'),
            Text('Device Type: ${responsive.isMobile ? "Mobile" : responsive.isTablet ? "Tablet" : "Desktop"}'),
            Text('Orientation: ${responsive.isPortrait ? "Portrait" : "Landscape"}'),
            Text('Top Safe Area: ${responsive.topSafeArea.toStringAsFixed(0)}px'),
            Text('Bottom Safe Area: ${responsive.bottomSafeArea.toStringAsFixed(0)}px'),
          ],
        ),
      ),
    );
  }

  Widget _buildResponsiveContainer(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Responsive Container',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        SizedBox(height: AppSpacing.sm(context)),
        Container(
          // 90% of screen width
          width: context.widthPercent(90),
          // 20% of screen height
          height: context.heightPercent(20),
          decoration: BoxDecoration(
            color: Colors.blue.withOpacity(0.2),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue),
          ),
          child: Center(
            child: Text(
              '90% width × 20% height',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildResponsiveLayout(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Responsive Layout',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        SizedBox(height: AppSpacing.sm(context)),
        ResponsiveLayout(
          mobile: _buildLayoutCard(context, 'Mobile Layout', Colors.green),
          tablet: _buildLayoutCard(context, 'Tablet Layout', Colors.orange),
          desktop: _buildLayoutCard(context, 'Desktop Layout', Colors.purple),
        ),
      ],
    );
  }

  Widget _buildLayoutCard(BuildContext context, String text, Color color) {
    return Container(
      width: double.infinity,
      padding: AppSpacing.cardPadding(context),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
          color: color,
          fontWeight: FontWeight.bold,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildResponsiveGrid(BuildContext context) {
    // Different column counts based on screen size
    final columns = context.responsive<int>(
      mobile: 2,
      tablet: 3,
      desktop: 4,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Responsive Grid ($columns columns)',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        SizedBox(height: AppSpacing.sm(context)),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: AppSpacing.sm(context),
            mainAxisSpacing: AppSpacing.sm(context),
            childAspectRatio: 1,
          ),
          itemCount: 8,
          itemBuilder: (context, index) {
            return Container(
              decoration: BoxDecoration(
                color: Colors.teal.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.teal),
              ),
              child: Center(
                child: Text(
                  '${index + 1}',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
