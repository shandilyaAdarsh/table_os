import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../domain/repositories/auth_repository.dart';
import '../../../../core/network/network_providers.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final supabase = Supabase.instance.client;
  final dio = ref.watch(dioClientProvider);
  return AuthRepository(supabase, dio);
});
