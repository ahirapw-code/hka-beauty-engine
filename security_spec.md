# Security Specification: HKA Management App

## 1. Data Invariants
1. **User Identity Invariant**: A user document must have an ID matching their Firebase Authentication UUID.
2. **Role Immobility Invariant**: Standard users cannot modify or elevate their own roles (`role` field) or change their assigned `branch` without authorization from `HKA_MANAGEMENT`.
3. **Email Consistency Invariant**: A user's stored email field must match their authenticated Firebase email.
4. **Length and Regex Constraint**: Usernames must be between 3 and 30 characters and conform to `^[a-zA-Z0-9_\-]+$`.

## 2. The "Dirty Dozen" Malicious Payloads

### Payload 1: Role Escalation Attack
A therapist attempts to elevate their role to `HKA_MANAGEMENT` during self-update.
```json
{
  "id": "user_123",
  "username": "therapist_jack",
  "name": "Jack Wong",
  "role": "HKA_MANAGEMENT",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 2: Email Spoofing Attack
User `user_123` attempts to write an email mismatching their authenticated email.
```json
{
  "id": "user_123",
  "username": "therapist_jack",
  "name": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "hacker@domain.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 3: ID Poisoning Attack
An attacker attempts to inject a 1.5KB string as the username to cause memory leaks.
```json
{
  "id": "user_123",
  "username": "extremely_long_username_over_30_characters_which_is_invalid_for_the_schema_and_causes_bloat_long_long_long",
  "name": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 4: Orphaned Record / Identity Hijack
Attacking user registers with their profile using another user's ID as the document ID.
```json
{
  "id": "other_user_456",
  "username": "attacker",
  "name": "Attacker Name",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "attacker@gmail.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 5: Invalid Regex Injection
Username contains dangerous non-alphanumeric characters.
```json
{
  "id": "user_123",
  "username": "jack; DROP TABLE users;--",
  "name": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 6: Shadow Keys / Extra Fields
Attempting to create a user document with unapproved fields like `isApproved` or `isAdmin`.
```json
{
  "id": "user_123",
  "username": "jack_wong",
  "name": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com",
  "isAdmin": true
}
```
*Expected: PERMISSION_DENIED*

### Payload 7: Too Short Username
Creating an account with a single-character username.
```json
{
  "id": "user_123",
  "username": "j",
  "name": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 8: Cross-Branch Tampering
A manager of one branch attempts to change another user's branch to a higher-privileged branch without authorized management access.
```json
{
  "id": "user_123",
  "username": "jack_wong",
  "name": "Jack Wong",
  "role": "SALON_MANAGER",
  "branch": "ALL",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 9: Malformed Types
A payload where the name attribute is passed as a boolean instead of a string.
```json
{
  "id": "user_123",
  "username": "jack_wong",
  "name": true,
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 10: Missing Required Fields
Attempting to save a user without a role.
```json
{
  "id": "user_123",
  "username": "jack_wong",
  "name": "Jack Wong",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 11: Invalid Enums
Attempting to register with an unrecognized role like `SALON_CEO`.
```json
{
  "id": "user_123",
  "username": "jack_wong",
  "name": "Jack Wong",
  "role": "SALON_CEO",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com"
}
```
*Expected: PERMISSION_DENIED*

### Payload 12: Massive Avatar URL
Payload containing a ridiculously massive URL for the avatar to exceed size quotas.
```json
{
  "id": "user_123",
  "username": "jack_wong",
  "name": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "email": "jack@naostudio.com",
  "avatar": "https://images.unsplash.com/...[repeating over 10,000 characters]"
}
```
*Expected: PERMISSION_DENIED*


## 3. "Dirty Dozen" Malicious Payloads for Custom Collections

### 3.1 TRANSACTIONS COLLECTION

#### Transaction Payload 1: Role Escalation / Unauthorized Entry
A therapist attempts to directly create a sales transaction (only managers/cashiers can record transactions).
```json
{
  "id": "tx_abc",
  "customerName": "John Doe",
  "branch": "NAO_STUDIO",
  "items": [{"id": "prod_1", "name": "Shampoo", "price": 100, "quantity": 1, "type": "product"}],
  "subtotal": 100,
  "discount": 0,
  "total": 100,
  "paymentMethod": "cash",
  "date": "2026-07-13T10:00:00Z",
  "cashierName": "Jack Therapist"
}
```
*Expected: PERMISSION_DENIED*

#### Transaction Payload 2: Cross-Branch Tampering
A Salon Manager assigned to `NAO_STUDIO` attempts to write a transaction for the `DIAEL_BEAUTY` branch.
```json
{
  "id": "tx_def",
  "customerName": "Alice Smith",
  "branch": "DIAEL_BEAUTY",
  "items": [{"id": "srv_1", "name": "Facial", "price": 250, "quantity": 1, "type": "service"}],
  "subtotal": 250,
  "discount": 0,
  "total": 250,
  "paymentMethod": "card",
  "date": "2026-07-13T11:00:00Z",
  "cashierName": "Hacker Manager"
}
```
*Expected: PERMISSION_DENIED*

#### Transaction Payload 3: Negative Calculations
An attacker attempts to write a transaction with a negative total or negative discount to artificially adjust balances.
```json
{
  "id": "tx_neg",
  "customerName": "Bob Vance",
  "branch": "NAO_STUDIO",
  "items": [{"id": "prod_1", "name": "Dufus", "price": -500, "quantity": 1, "type": "product"}],
  "subtotal": -500,
  "discount": -100,
  "total": -400,
  "paymentMethod": "cash",
  "date": "2026-07-13T12:00:00Z",
  "cashierName": "Bad Actor"
}
```
*Expected: PERMISSION_DENIED*

#### Transaction Payload 4: Shadow Keys
An attacker attempts to insert a custom field `isRefundApproved` or `freeProductClaimed` to manipulate inventory/revenue streams.
```json
{
  "id": "tx_shadow",
  "customerName": "Charlie Brown",
  "branch": "NAO_STUDIO",
  "items": [{"id": "prod_2", "name": "Hair Serum", "price": 150, "quantity": 1, "type": "product"}],
  "subtotal": 150,
  "discount": 0,
  "total": 150,
  "paymentMethod": "card",
  "date": "2026-07-13T13:00:00Z",
  "cashierName": "Jane Cashier",
  "isRefundApproved": true,
  "overrideLedger": "YES"
}
```
*Expected: PERMISSION_DENIED*

#### Transaction Payload 5: Oversized Cashier Name
An attacker attempts to write a transaction with an extremely large cashier name (buffer bloat/storage waste).
```json
{
  "id": "tx_bloat",
  "customerName": "Charlie Brown",
  "branch": "NAO_STUDIO",
  "items": [{"id": "prod_2", "name": "Hair Serum", "price": 150, "quantity": 1, "type": "product"}],
  "subtotal": 150,
  "discount": 0,
  "total": 150,
  "paymentMethod": "card",
  "date": "2026-07-13T13:00:00Z",
  "cashierName": "VeryLongCashierNameExtremelyOverTheMaximumAllowedLengthInOurSecurityRulesSchemaToTriggerBufferWasteAndOversizedPayloadExceptions..."
}
```
*Expected: PERMISSION_DENIED*


### 3.2 BOOKINGS COLLECTION

#### Booking Payload 1: Therapist Overriding Prices
A Therapist attempts to modify the `price` of an existing booking to bypass correct revenue tracking.
```json
{
  "id": "booking_123",
  "customerName": "Emma Stone",
  "customerPhone": "0812345678",
  "serviceId": "srv_haircut",
  "serviceName": "Premium Cut",
  "therapistId": "therapist_jack_uid",
  "therapistName": "Jack Wong",
  "branch": "NAO_STUDIO",
  "date": "2026-07-13",
  "time": "14:00",
  "duration": 60,
  "price": 10,
  "status": "completed"
}
```
*Expected: PERMISSION_DENIED* (If the price changed from its original booking price)

#### Booking Payload 2: Cross-Branch Tampering
A Salon Manager from `NAO_STUDIO` attempts to create or write a booking record for `DIAEL_BEAUTY`.
```json
{
  "id": "booking_cross",
  "customerName": "Diana Prince",
  "customerPhone": "08121111222",
  "serviceId": "srv_massage",
  "serviceName": "Full Body Spa",
  "therapistId": "therapist_di_uid",
  "therapistName": "Diana Prince",
  "branch": "DIAEL_BEAUTY",
  "date": "2026-07-14",
  "time": "10:00",
  "duration": 90,
  "price": 300,
  "status": "pending"
}
```
*Expected: PERMISSION_DENIED*

#### Booking Payload 3: Negative Values
An attacker attempts to create a booking with a negative price.
```json
{
  "id": "booking_neg",
  "customerName": "Arthur Dent",
  "customerPhone": "0812345678",
  "serviceId": "srv_massage",
  "serviceName": "Deep Tissue",
  "therapistId": "therapist_jack_uid",
  "therapistName": "Jack Wong",
  "branch": "NAO_STUDIO",
  "date": "2026-07-14",
  "time": "11:00",
  "duration": 60,
  "price": -120.0,
  "status": "pending"
}
```
*Expected: PERMISSION_DENIED*

#### Booking Payload 4: Shadow Keys
An attacker attempts to write a booking with unsupported metadata fields like `bypassOverlapCheck: true`.
```json
{
  "id": "booking_shadow",
  "customerName": "Arthur Dent",
  "customerPhone": "0812345678",
  "serviceId": "srv_massage",
  "serviceName": "Deep Tissue",
  "therapistId": "therapist_jack_uid",
  "therapistName": "Jack Wong",
  "branch": "NAO_STUDIO",
  "date": "2026-07-14",
  "time": "11:00",
  "duration": 60,
  "price": 120.0,
  "status": "pending",
  "bypassOverlapCheck": true,
  "forceBook": "YES"
}
```
*Expected: PERMISSION_DENIED*

#### Booking Payload 5: Oversized Client Notes
Injecting booking notes with massive size to fill disk space.
```json
{
  "id": "booking_oversized",
  "customerName": "Bruce Wayne",
  "customerPhone": "0811999999",
  "serviceId": "srv_massage",
  "serviceName": "Swedish Massage",
  "therapistId": "therapist_jack_uid",
  "therapistName": "Jack Wong",
  "branch": "NAO_STUDIO",
  "date": "2026-07-14",
  "time": "13:00",
  "duration": 60,
  "price": 150.0,
  "status": "pending",
  "notes": "[A repeated block of text exceeding 10,000 characters to bloat database records...]"
}
```
*Expected: PERMISSION_DENIED*


### 3.3 CUSTOMERS COLLECTION

#### Customer Payload 1: Therapist Self-Creation
A Therapist attempts to create a customer document directly in the customer database (which requires Manager permissions).
```json
{
  "id": "cust_111",
  "name": "Jane Eyre",
  "email": "jane@eyre.com",
  "phone": "0812333444",
  "totalSpend": 0,
  "visitsCount": 0,
  "preferredBranch": "NAO_STUDIO"
}
```
*Expected: PERMISSION_DENIED*

#### Customer Payload 2: Cross-Branch Tampering
A Salon Manager from `DIAEL_BEAUTY` attempts to modify customer documents preferred branch of a `NAO_STUDIO` customer.
```json
{
  "id": "cust_nao_native",
  "name": "Clark Kent",
  "email": "clark@dailyplanet.com",
  "phone": "0812222333",
  "totalSpend": 1000,
  "visitsCount": 5,
  "preferredBranch": "NAO_STUDIO"
}
```
*Expected: PERMISSION_DENIED*

#### Customer Payload 3: Negative Stats
An attacker attempts to write negative spend statistics.
```json
{
  "id": "cust_neg",
  "name": "Greedy Hacker",
  "email": "hacker@evil.com",
  "phone": "0812000000",
  "totalSpend": -50000.0,
  "visitsCount": -10,
  "preferredBranch": "NAO_STUDIO"
}
```
*Expected: PERMISSION_DENIED*

#### Customer Payload 4: Shadow Keys
An attacker attempts to add an unvalidated key such as `freeVipSpaTier` or `isHkaOwner` to bypass checkout validation.
```json
{
  "id": "cust_shadow",
  "name": "Slick Rick",
  "email": "slick@rick.com",
  "phone": "0812999000",
  "totalSpend": 0,
  "visitsCount": 0,
  "preferredBranch": "NAO_STUDIO",
  "freeVipSpaTier": "ULTIMATE",
  "isHkaOwner": true
}
```
*Expected: PERMISSION_DENIED*

#### Customer Payload 5: Oversized Notes Field
Injecting customer records with an oversized custom field to bypass schema size limits.
```json
{
  "id": "cust_oversized",
  "name": "Slick Rick",
  "email": "slick@rick.com",
  "phone": "0812999000",
  "totalSpend": 0,
  "visitsCount": 0,
  "preferredBranch": "NAO_STUDIO",
  "notes": "[Extremely long customer bio text repeating over 50,000 characters...]"
}
```
*Expected: PERMISSION_DENIED*


### 3.4 PRODUCTS COLLECTION

#### Product Payload 1: Therapist Price Tampering
A Therapist attempts to create/update a product to modify its price to 0.
```json
{
  "id": "prod_tamper",
  "name": "Shampoo Premium",
  "sku": "SHM-PREM",
  "price": 0,
  "cost": 10,
  "stock": 100,
  "minStock": 10,
  "branch": "NAO_STUDIO",
  "category": "Haircare"
}
```
*Expected: PERMISSION_DENIED*

#### Product Payload 2: Cross-Branch Stock Modification
A Salon Manager from `NAO_STUDIO` attempts to update stock or products belonging to `DIAEL_BEAUTY`.
```json
{
  "id": "prod_diael_1",
  "name": "Facial Cleanser",
  "sku": "FCL-DIAEL",
  "price": 120,
  "cost": 60,
  "stock": 50,
  "minStock": 5,
  "branch": "DIAEL_BEAUTY",
  "category": "Skincare"
}
```
*Expected: PERMISSION_DENIED*

#### Product Payload 3: Negative Price/Stock
An attacker attempts to write negative numbers to bypass checkout logic or deplete stock registers.
```json
{
  "id": "prod_neg",
  "name": "Faulty Serum",
  "sku": "SRM-FLT",
  "price": -150,
  "cost": -50,
  "stock": -100,
  "minStock": -5,
  "branch": "NAO_STUDIO",
  "category": "Serums"
}
```
*Expected: PERMISSION_DENIED*

#### Product Payload 4: Shadow Keys
An attacker attempts to write unverified parameters like `exemptFromTax: true` or `alwaysInStock: true`.
```json
{
  "id": "prod_shadow",
  "name": "Hair Wax",
  "sku": "HWX-01",
  "price": 50,
  "cost": 20,
  "stock": 100,
  "minStock": 5,
  "branch": "NAO_STUDIO",
  "category": "Haircare",
  "exemptFromTax": true,
  "alwaysInStock": true
}
```
*Expected: PERMISSION_DENIED*

#### Product Payload 5: Oversized SKU Field
Injecting an oversized SKU string to test bounds check validation.
```json
{
  "id": "prod_oversized",
  "name": "Hair Wax",
  "sku": "SKU_STRING_THAT_IS_TREMENDOUSLY_OVERSIZED_AND_FAR_EXCEEDS_THE_FIFTY_CHARACTERS_LIMIT_ENFORCED_IN_THE_SCHEMA",
  "price": 50,
  "cost": 20,
  "stock": 100,
  "minStock": 5,
  "branch": "NAO_STUDIO",
  "category": "Haircare"
}
```
*Expected: PERMISSION_DENIED*


### 3.5 EXPENSES COLLECTION

#### Expense Payload 1: Therapist Logging Expenses
A Therapist attempts to create an expense record (Expenses can only be logged by management).
```json
{
  "id": "exp_the_thief",
  "branch": "NAO_STUDIO",
  "category": "Supplies",
  "amount": 500,
  "date": "2026-07-13",
  "description": "Buy Coffee Maker"
}
```
*Expected: PERMISSION_DENIED*

#### Expense Payload 2: Cross-Branch Expense Tampering
A Salon Manager from `NAO_STUDIO` attempts to write an expense record for `DIAEL_BEAUTY` to reduce DIAEL's reported net profit.
```json
{
  "id": "exp_cross",
  "branch": "DIAEL_BEAUTY",
  "category": "Marketing",
  "amount": 2500,
  "date": "2026-07-13",
  "description": "Flyers printing"
}
```
*Expected: PERMISSION_DENIED*

#### Expense Payload 3: Negative Expense Amount
An attacker attempts to write a negative expense amount to increment branch cash registers.
```json
{
  "id": "exp_neg",
  "branch": "NAO_STUDIO",
  "category": "Rent",
  "amount": -3000,
  "date": "2026-07-13",
  "description": "Fictional rebate"
}
```
*Expected: PERMISSION_DENIED*

#### Expense Payload 4: Shadow Keys
An attacker attempts to write extra fields like `reimburseTo: "attacker_bank_account"` or `isPreApproved: true`.
```json
{
  "id": "exp_shadow",
  "branch": "NAO_STUDIO",
  "category": "Rent",
  "amount": 3000,
  "date": "2026-07-13",
  "description": "Office rent",
  "reimburseTo": "attacker_bank_account",
  "isPreApproved": true
}
```
*Expected: PERMISSION_DENIED*

#### Expense Payload 5: Oversized Description
Writing an exceptionally long description string to exhaust disk storage.
```json
{
  "id": "exp_bloat",
  "branch": "NAO_STUDIO",
  "category": "Rent",
  "amount": 3000,
  "date": "2026-07-13",
  "description": "Massive repeating block of characters...[spanning over 20,000 characters]"
}
```
*Expected: PERMISSION_DENIED*


### 3.6 ATTENDANCE COLLECTION

#### Attendance Payload 1: Therapist Clocking In For Others
A Therapist attempts to create an attendance record where the `userId` field doesn't match their authenticated UID.
```json
{
  "id": "att_tamper",
  "userId": "other_colleague_uid",
  "userName": "Therapist Bob",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "date": "2026-07-13",
  "clockIn": "09:00",
  "status": "active"
}
```
*Expected: PERMISSION_DENIED*

#### Attendance Payload 2: Cross-Branch Clock In
A Therapist attempts to clock in for `DIAEL_BEAUTY` while being registered/assigned at `NAO_STUDIO`.
```json
{
  "id": "att_cross",
  "userId": "therapist_jack_uid",
  "userName": "Jack Wong",
  "role": "THERAPIST",
  "branch": "DIAEL_BEAUTY",
  "date": "2026-07-13",
  "clockIn": "09:00",
  "status": "active"
}
```
*Expected: PERMISSION_DENIED*

#### Attendance Payload 3: Invalid Attendance Status State Transition
A Therapist attempts to write status `completed` directly upon clock-in without a clock-out record, or updating status backward.
```json
{
  "id": "att_invalid_status",
  "userId": "therapist_jack_uid",
  "userName": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "date": "2026-07-13",
  "clockIn": "09:00",
  "status": "completed"
}
```
*Expected: PERMISSION_DENIED*

#### Attendance Payload 4: Shadow Keys
An attacker attempts to inject keys like `approvedOvertimePay: true` or `earlyBonusClockIn: true`.
```json
{
  "id": "att_shadow",
  "userId": "therapist_jack_uid",
  "userName": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "date": "2026-07-13",
  "clockIn": "09:00",
  "status": "active",
  "approvedOvertimePay": true,
  "earlyBonusClockIn": true
}
```
*Expected: PERMISSION_DENIED*

#### Attendance Payload 5: Oversized Note Log
Injecting massive text files as notes into the clockOut or notes properties.
```json
{
  "id": "att_bloat",
  "userId": "therapist_jack_uid",
  "userName": "Jack Wong",
  "role": "THERAPIST",
  "branch": "NAO_STUDIO",
  "date": "2026-07-13",
  "clockIn": "09:00",
  "status": "active",
  "notes": "[Repeated string of notes characters exceeding 10,000 characters...]"
}
```
*Expected: PERMISSION_DENIED*


### 3.7 THERAPISTS COLLECTION

#### Therapist Payload 1: Self-Incrementing Commission Rate
A Therapist attempts to self-update their profile and elevate their `commissionRate` from 10% to 50%.
```json
{
  "id": "therapist_jack_uid",
  "name": "Jack Wong",
  "branch": "NAO_STUDIO",
  "specialties": ["Hair Styling"],
  "rating": 5.0,
  "commissionRate": 0.50,
  "totalCommissionEarned": 10000,
  "status": "active",
  "monthlyTarget": 5000,
  "currentSales": 1200
}
```
*Expected: PERMISSION_DENIED*

#### Therapist Payload 2: Cross-Branch Therapist Modification
A Salon Manager from `NAO_STUDIO` attempts to modify therapist records in `DIAEL_BEAUTY`.
```json
{
  "id": "therapist_diael_uid",
  "name": "Jane Beauty",
  "branch": "DIAEL_BEAUTY",
  "specialties": ["Massages"],
  "rating": 4.8,
  "commissionRate": 0.15,
  "totalCommissionEarned": 2500,
  "status": "active",
  "monthlyTarget": 3000,
  "currentSales": 900
}
```
*Expected: PERMISSION_DENIED*

#### Therapist Payload 3: Negative Targets
An attacker attempts to set targets or sales to negative values.
```json
{
  "id": "therapist_jack_uid",
  "name": "Jack Wong",
  "branch": "NAO_STUDIO",
  "specialties": ["Hair Styling"],
  "rating": -1.0,
  "commissionRate": -0.1,
  "totalCommissionEarned": -100,
  "status": "active",
  "monthlyTarget": -5000,
  "currentSales": -1000
}
```
*Expected: PERMISSION_DENIED*

#### Therapist Payload 4: Shadow Keys
An attacker attempts to inject keys like `overrideTargetValidation: true` or `commissionMultiplier: 5.0`.
```json
{
  "id": "therapist_jack_uid",
  "name": "Jack Wong",
  "branch": "NAO_STUDIO",
  "specialties": ["Hair Styling"],
  "rating": 5.0,
  "commissionRate": 0.10,
  "totalCommissionEarned": 1000,
  "status": "active",
  "monthlyTarget": 5000,
  "currentSales": 1200,
  "overrideTargetValidation": true,
  "commissionMultiplier": 5.0
}
```
*Expected: PERMISSION_DENIED*

#### Therapist Payload 5: Oversized Specialties List
Creating/updating a therapist record with a specialty list consisting of 1,000+ entries.
```json
{
  "id": "therapist_jack_uid",
  "name": "Jack Wong",
  "branch": "NAO_STUDIO",
  "specialties": ["Specialty1", "Specialty2", "Specialty3", "...[repeating thousands of specialties to bloat database document...]"],
  "rating": 5.0,
  "commissionRate": 0.10,
  "totalCommissionEarned": 1000,
  "status": "active",
  "monthlyTarget": 5000,
  "currentSales": 1200
}
```
*Expected: PERMISSION_DENIED*

### 3. Payroll Collection Malicious Payloads

#### Payroll Payload 1: Unauthorized Creation / Privilege Escalation
A therapist attempts to create a payroll document with `staffType: 'manager'` and manually override values to receive higher commission/salary.
```json
{
  "id": "payroll_attacker_123",
  "staffId": "therapist_jack_uid",
  "staffName": "Jack Wong",
  "staffType": "manager",
  "branch": "NAO_STUDIO",
  "periodMonth": "2026-07",
  "baseSalary": 15000000,
  "commissionEarned": 5000000,
  "daysPresent": 25,
  "bonus": 2000000,
  "deductions": 0,
  "netPay": 22000000,
  "status": "finalized",
  "generatedAt": "2026-07-13T08:00:00Z",
  "generatedBy": "admin_uid"
}
```
*Expected: PERMISSION_DENIED (Therapists cannot write to the payroll collection, only HKA_MANAGEMENT)*

#### Payroll Payload 2: Salon Manager unauthorized read of Manager Payroll
A Salon Manager attempts to read the payroll document of another manager or an unauthorized staffType 'manager'.
```json
{
  "id": "payroll_manager_456",
  "staffId": "manager_alice_uid",
  "staffName": "Alice Salon Manager",
  "staffType": "manager",
  "branch": "NAO_STUDIO",
  "periodMonth": "2026-07",
  "baseSalary": 20000000,
  "commissionEarned": 0,
  "daysPresent": 26,
  "bonus": 1000000,
  "deductions": 0,
  "netPay": 21000000,
  "status": "paid",
  "generatedAt": "2026-07-13T08:00:00Z",
  "generatedBy": "admin_uid"
}
```
*Expected: PERMISSION_DENIED (Salon Managers are strictly restricted to reading payroll documents with staffType == 'therapist' belonging to their branch, preventing access to other managers' payrolls)*

#### Payroll Payload 3: Invalid Month Period Format
HKA_MANAGEMENT attempts to create a payroll document, but the `periodMonth` format is invalid (e.g. `2026/07` or `2026-07-13` instead of `YYYY-MM`).
```json
{
  "id": "payroll_invalid_period",
  "staffId": "therapist_jack_uid",
  "staffName": "Jack Wong",
  "staffType": "therapist",
  "branch": "NAO_STUDIO",
  "periodMonth": "2026-07-13",
  "baseSalary": 10000000,
  "commissionEarned": 1500000,
  "daysPresent": 25,
  "bonus": 500000,
  "deductions": 200000,
  "netPay": 11800000,
  "status": "draft",
  "generatedAt": "2026-07-13T08:00:00Z",
  "generatedBy": "admin_uid"
}
```
*Expected: PERMISSION_DENIED (Regex constraint on periodMonth matches '^[0-9]{4}-[0-9]{2}$')*

#### Payroll Payload 4: Negative Values Validation Bypass
An attacker attempts to create a payroll record containing negative financial numbers (e.g. negative baseSalary, bonus, or deductions).
```json
{
  "id": "payroll_negative_vals",
  "staffId": "therapist_jack_uid",
  "staffName": "Jack Wong",
  "staffType": "therapist",
  "branch": "NAO_STUDIO",
  "periodMonth": "2026-07",
  "baseSalary": -5000000,
  "commissionEarned": -1000000,
  "daysPresent": -5,
  "bonus": -100000,
  "deductions": -50000,
  "netPay": -6150000,
  "status": "draft",
  "generatedAt": "2026-07-13T08:00:00Z",
  "generatedBy": "admin_uid"
}
```
*Expected: PERMISSION_DENIED (All financial fields and daysPresent must be >= 0)*
