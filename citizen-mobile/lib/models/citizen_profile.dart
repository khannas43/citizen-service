import 'package:flutter/material.dart';

class CitizenProfile {
  final String name;
  final int age;
  final String gender;
  final String category;
  final String district;
  final String taluka;
  final String village;
  final String aadhaarRef;
  final String familyId;
  final String rationCardNumber;
  final String phone;
  final int annualIncome;
  final Color avatarColor;

  const CitizenProfile({
    required this.name,
    required this.age,
    required this.gender,
    required this.category,
    required this.district,
    required this.taluka,
    required this.village,
    required this.aadhaarRef,
    required this.familyId,
    this.rationCardNumber = '',
    required this.phone,
    required this.annualIncome,
    required this.avatarColor,
  });

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  // Merge with live data fetched from family-registry-service
  // Preserve demo familyId when registry search omits it.
  CitizenProfile withLiveData(Map<String, dynamic> json) {
    final rawFamilyId = json['familyId'];
    final liveFamilyId = rawFamilyId == null ? null : rawFamilyId.toString();
    return CitizenProfile(
      name: json['name'] as String? ?? name,
      age: age,
      gender: json['gender'] as String? ?? gender,
      category: json['casteCategory'] as String? ?? category,
      district: json['district'] as String? ?? district,
      taluka: json['taluka'] as String? ?? taluka,
      village: json['village'] as String? ?? village,
      aadhaarRef: json['aadhaarRef'] as String? ?? aadhaarRef,
      familyId: liveFamilyId ?? familyId,
      rationCardNumber: json['rationCardNumber'] as String? ?? rationCardNumber,
      phone: json['mobile'] as String? ?? phone,
      annualIncome: (json['annualIncome'] as num?)?.toInt() ?? annualIncome,
      avatarColor: avatarColor,
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'age': age,
    'gender': gender,
    'category': category,
    'district': district,
    'taluka': taluka,
    'village': village,
    'aadhaarRef': aadhaarRef,
    'familyId': familyId,
    'rationCardNumber': rationCardNumber,
    'phone': phone,
    'annualIncome': annualIncome,
    'avatarColorValue': avatarColor.value,
  };

  static CitizenProfile fromJson(Map<String, dynamic> j) => CitizenProfile(
    name: j['name'] as String,
    age: j['age'] as int,
    gender: j['gender'] as String,
    category: j['category'] as String,
    district: j['district'] as String,
    taluka: j['taluka'] as String? ?? '',
    village: j['village'] as String? ?? '',
    aadhaarRef: j['aadhaarRef'] as String,
    familyId: j['familyId'] as String,
    rationCardNumber: j['rationCardNumber'] as String? ?? '',
    phone: j['phone'] as String,
    annualIncome: j['annualIncome'] as int,
    avatarColor: Color(j['avatarColorValue'] as int),
  );
}

// ── Demo profiles — aligned with citizen web portal demo users ────
// aadhaarRefs must match web portal Login.jsx DEMO_USERS exactly
const kDemoProfiles = [
  CitizenProfile(
    name: 'Priya Patel',
    age: 41,
    gender: 'Female',
    category: 'OBC',
    district: 'Ahmedabad',
    taluka: 'Dholka',
    village: 'Bavla',
    aadhaarRef: 'XXXX-XXXX-1001',
    familyId: 'a1000000-0000-0000-0000-000000000001',
    rationCardNumber: '241234567800000101',
    phone: '9876541001',
    annualIncome: 48000,
    avatarColor: Color(0xFF7C3AED),
  ),
  CitizenProfile(
    name: 'Rajan Nair',
    age: 48,
    gender: 'Male',
    category: 'SC',
    district: 'Surat',
    taluka: 'Katargam',
    village: 'Katargam',
    aadhaarRef: 'XXXX-XXXX-2001',
    familyId: 'a2000000-0000-0000-0000-000000000002',
    rationCardNumber: '241234567800000201',
    phone: '9876542001',
    annualIncome: 180000,
    avatarColor: Color(0xFF1D4ED8),
  ),
  CitizenProfile(
    name: 'Kavita Rathod',
    age: 46,
    gender: 'Female',
    category: 'NT',
    district: 'Banaskantha',
    taluka: 'Deesa',
    village: 'Deesa',
    aadhaarRef: 'XXXX-XXXX-5001',
    familyId: 'a5000000-0000-0000-0000-000000000005',
    rationCardNumber: '241234567800000501',
    phone: '9876545001',
    annualIncome: 72000,
    avatarColor: Color(0xFF059669),
  ),
  CitizenProfile(
    name: 'Meera Rathod',
    age: 18,
    gender: 'Female',
    category: 'NT',
    district: 'Banaskantha',
    taluka: 'Deesa',
    village: 'Deesa',
    aadhaarRef: 'XXXX-XXXX-5005',
    familyId: 'a5000000-0000-0000-0000-000000000005',
    rationCardNumber: '241234567800000501',
    phone: '9876545005',
    annualIncome: 0,
    avatarColor: Color(0xFF0F766E),
  ),
];
