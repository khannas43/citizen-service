import 'package:flutter/material.dart';

const kSeedColor = Color(0xFF3730A3); // indigo – matches officer portal

final kTheme = ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: kSeedColor,
    brightness: Brightness.light,
  ),
  useMaterial3: true,
  appBarTheme: const AppBarTheme(
    centerTitle: false,
    elevation: 0,
    scrolledUnderElevation: 1,
  ),
  cardTheme: CardThemeData(
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: const BorderSide(color: Color(0xFFE8EDF3)),
    ),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: kSeedColor, width: 1.5),
    ),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    isDense: false,
  ),
  textSelectionTheme: const TextSelectionThemeData(
    cursorColor: kSeedColor,
    selectionColor: Color(0x4D3730A3),
    selectionHandleColor: kSeedColor,
  ),
  navigationBarTheme: NavigationBarThemeData(
    elevation: 3,
    labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
    indicatorColor: const Color(0xFFEEF2FF),
  ),
);

ThemeData appTheme() => kTheme;

// Status colours
Color statusColor(String status) {
  switch (status.toUpperCase()) {
    case 'APPROVED':
    case 'ACTIVE':
      return const Color(0xFF16A34A);
    case 'PENDING':
      return const Color(0xFF2563EB);
    case 'REJECTED':
    case 'CANCELLED':
      return const Color(0xFFDC2626);
    case 'ESCALATED':
      return const Color(0xFFD97706);
    default:
      return const Color(0xFF64748B);
  }
}

Color statusBg(String status) {
  switch (status.toUpperCase()) {
    case 'APPROVED':
    case 'ACTIVE':
      return const Color(0xFFF0FDF4);
    case 'PENDING':
      return const Color(0xFFEFF6FF);
    case 'REJECTED':
    case 'CANCELLED':
      return const Color(0xFFFEF2F2);
    case 'ESCALATED':
      return const Color(0xFFFFFBEB);
    default:
      return const Color(0xFFF8FAFC);
  }
}
