# DairyOne Agent App — Farmer Scan, Identity Verification & Payment Details Enhancement

## OBJECTIVE

Enhance the **existing DairyOne Agent app** by improving the farmer QR/card scanning experience.

Do NOT rebuild the Agent app from scratch.

Do NOT redesign unrelated Agent screens.

Use the existing Agent UI, design system, authentication, Supabase integration, offline system, collection workflow, GPS verification, shift logic, and duplicate-collection prevention.

The goal is:

**SCAN FARMER CARD → VERIFY FARMER → SHOW FARMER PHOTO + DETAILS + PAYMENT INFORMATION → CALL FARMER IF REQUIRED → VERIFY REPRESENTATIVE → CONTINUE COLLECTION**

This must feel fast enough for real-world milk collection operations.

---

# 1. EXISTING AGENT FLOW MUST REMAIN INTACT

Preserve the existing flow:

LOGIN
→ First-Time Setup
→ Permissions / Device Check
→ Punch In
→ Agent Home
→ Start / Continue Trip
→ Live GPS Tracking
→ Next Collection Point
→ Arrival Verification
→ Scan / Select Farmer
→ Farmer Verification
→ Milk Collection
→ Quality
→ Save Collection
→ Next Farmer
→ Complete Route
→ Final Summary
→ Punch Out

Only enhance the **Farmer Scan / Farmer Verification / Collection entry stage**.

Do not break:

- Background GPS
- Capacitor native functionality
- Offline collection queue
- Sync engine
- Route tracking
- Arrival verification
- Geofence verification
- Shift determination
- Duplicate collection prevention
- Farmer QR scanning
- Collection saving
- Existing authentication
- Existing role permissions

Before changing shared logic, inspect how it currently works.

---

# 2. FARMER CARD SCAN EXPERIENCE

When the Agent scans a farmer QR/card:

Immediately identify the farmer from the existing farmer record.

Do NOT require the Agent to manually type the farmer name or ID.

Show a dedicated **Farmer Verification panel/screen** before entering the collection amount.

The screen should load quickly and work properly under weak network conditions.

Use existing locally cached farmer information when available.

---

# 3. FARMER VERIFICATION HEADER

After scanning, display:

### Farmer Identity

- Farmer photograph
- Farmer name
- Farmer ID
- QR/Card number
- Village
- Mobile number
- Route
- MCC/collection centre
- Current shift

The farmer photo should be visually prominent but should not consume excessive screen space.

Example:

```text
┌──────────────────────────────────────┐
│ ← Verify Farmer                      │
│                                      │
│       [ Farmer Photo ]               │
│                                      │
│  Ram Lal                  [ Call ]   │
│  Farmer ID: FRM-00452                │
│  Village: Khinvsar                   │
│  Route: R-04                         │
│  Shift: Morning                      │
└──────────────────────────────────────┘
```

Use the application's existing professional icon system.

Do NOT use emoji icons.

---

# 4. CALL ICON — IMPORTANT BUSINESS REQUIREMENT

The **Call icon must always be available** on the farmer verification screen when a registered phone number exists.

The purpose is not simply convenience.

It is required for identity/authorization verification when the farmer is not physically present.

Real-world scenario:

The farmer may be unavailable.

Another person may bring the farmer's milk.

Example:

```text
Farmer: Ram Lal
Person physically present: Ram Lal's son/brother/employee
```

The Agent must be able to call the registered farmer and verify that the person is authorized to submit the milk.

The Call action should initiate a phone call using the device's native calling capability.

For Capacitor, use the appropriate native/device mechanism already used by the project or implement it safely without breaking Android compatibility.

Do not expose unnecessary phone information.

---

# 5. "WHO IS PRESENT?" VERIFICATION

After scanning the farmer, provide a simple choice:

```text
Who is present?

○ Farmer
○ Authorized Person
```

Default should be:

**Farmer**

Do not make the interface unnecessarily complicated.

---

# 6. FARMER PRESENT FLOW

If the Agent selects:

**Farmer**

show:

```text
✓ Farmer Present

Identity verified using farmer card/photo.
```

Then allow:

**Continue to Collection**

No phone call should be mandatory in this case unless an existing business rule requires it.

---

# 7. AUTHORIZED PERSON FLOW

If the Agent selects:

**Authorized Person**

the app must require verification.

Display:

```text
Farmer is not present

Please call the registered farmer to verify
that this person is authorized to submit milk.

[ Call Farmer ]
```

The Agent should not be able to simply select "Authorized Person" and continue without verification.

---

# 8. PHONE VERIFICATION

When Agent taps:

**Call Farmer**

initiate the phone call to the farmer's registered number.

After returning to DairyOne, show:

```text
Was authorization confirmed?

○ Yes, farmer confirmed
○ No, farmer did not confirm
```

If "Yes":

```text
✓ Authorization Verified
```

If "No":

```text
⚠ Verification Failed

Collection cannot continue until the farmer
is personally verified or another valid
verification method is completed.
```

Do not falsely assume that a phone call means verification succeeded.

A call attempt ≠ successful authorization.

---

# 9. VERIFICATION STATUS

Use clear internal states.

Recommended:

```text
FARMER_PRESENT
REPRESENTATIVE_VERIFICATION_REQUIRED
CALL_ATTEMPTED
VERIFIED_BY_PHONE
VERIFICATION_FAILED
VERIFICATION_PENDING
```

Only use states that fit the existing application architecture.

Do not create duplicate or conflicting verification states if an equivalent system already exists.

---

# 10. PAYMENT INFORMATION

Once the farmer is identified, show the relevant payment/account information directly on the farmer verification screen.

The Agent should not have to navigate to another module just to understand the farmer's payment situation.

Display only information appropriate for the Agent role.

Example:

```text
Payment

Current Rate
₹48.20 / L

Today's Estimated Value
₹891.70

Today's Quantity
18.5 L

Pending Amount
₹2,450

Last Payment
₹5,800
```

Use the actual existing DairyOne payment/rate/settlement data.

Do NOT create fake or hardcoded payment numbers.

If the existing backend does not yet provide a particular value, clearly mark it as unavailable rather than inventing it.

---

# 11. PAYMENT DETAILS SHOULD BE CONTEXTUAL

The Agent should see payment information relevant to the current farmer and current collection.

At minimum investigate whether the existing system supports:

- Current milk rate
- Today's quantity
- Today's estimated amount
- Pending farmer balance
- Last payment
- Last payment date
- Current rate/slab
- Applicable FAT/SNF rate if the rate system uses quality
- Payment status

Only display fields that are actually supported by the existing data model.

Do not duplicate accounting logic inside the Agent UI.

The backend/database remains the source of truth.

---

# 12. COLLECTION STATUS

Before allowing a new collection, clearly show whether the farmer has already been collected for the current shift.

Example:

```text
Today's Collection

Morning
✓ Already Collected
18.5 L
08:42 AM
```

If the farmer has already been collected in the current shift:

**BLOCK duplicate collection.**

Display:

```text
Collection Already Recorded

This farmer has already been collected
for the Morning shift.

Collected: 18.5 L
Time: 08:42 AM
Agent: Rajesh

[ View Collection ]
```

Do not allow the Agent to accidentally create another collection.

Preserve and reuse the existing duplicate-prevention logic.

Do not implement duplicate prevention only in the UI.

The backend/database must also protect against duplicate collections.

---

# 13. FARMER PHOTO VERIFICATION

The farmer photo should help the Agent visually confirm identity.

Display:

- Farmer photograph
- Farmer name
- Farmer ID

Do not require biometric face matching unless the existing product specifically supports it.

This is visual/manual verification.

If no farmer photo exists:

```text
No farmer photo available
```

Do not display a broken image.

---

# 14. FARMER CONTACT INFORMATION

Show the registered phone number in a privacy-conscious format if appropriate.

Example:

```text
+91 XXXXX 45210
                         [ Call ]
```

The Call button must use the registered farmer number.

Do not allow an Agent to change the farmer's phone number from this screen.

If the phone number is missing:

```text
Phone number unavailable
```

Disable the Call button gracefully.

---

# 15. COLLECTION CONTINUE BUTTON

The main CTA should be:

**Continue to Collection**

It should only be enabled when all required verification conditions are satisfied.

Examples:

### Farmer present

```text
Farmer verified
✓

[ Continue to Collection ]
```

### Authorized person

```text
Authorization required
⚠

[ Call Farmer ]
```

After successful confirmation:

```text
✓ Authorization verified

[ Continue to Collection ]
```

### Verification failed

```text
✕ Verification failed

[ Try Again ]
```

---

# 16. GPS / ARRIVAL VERIFICATION MUST REMAIN

Do not bypass existing location verification.

The complete logic should remain:

Agent reaches collection point
→ GPS verification
→ Farmer scanned
→ Farmer identity verification
→ Representative verification if required
→ Collection entry

The farmer should not be marked as collected merely because their QR code was scanned.

A collection should only become valid after the existing required verification conditions are satisfied.

---

# 17. AUDIT TRAIL

If the database architecture supports it, record representative verification separately.

Recommended information:

```text
collection_id
farmer_id
agent_id

person_present_type
    FARMER
    REPRESENTATIVE

verification_method
    NONE
    PHONE

verification_status
    NOT_REQUIRED
    PENDING
    VERIFIED
    FAILED

verification_attempted_at
verification_completed_at

verified_by_agent_id

farmer_phone_used

created_at
```

Do not modify historical collection records destructively.

If the project already has a verification/audit table, reuse it.

Do not create duplicate tables without first inspecting the schema.

---

# 18. CALL ACTIVITY AUDIT

Where technically and legally appropriate, record the fact that the Agent initiated verification.

For example:

```text
Verification Event

Farmer: Ram Lal
Agent: Rajesh
Method: Phone
Status: Verified
Time: 08:44 AM
```

Do NOT attempt to record the private contents of the phone conversation.

DairyOne only needs to know that verification was attempted/completed according to the Agent's confirmation.

---

# 19. OFFLINE BEHAVIOUR

This feature must work sensibly with weak/no internet.

If farmer data is already cached:

- Farmer photo should still load
- Farmer identity should still load
- Farmer ID should still load
- Route information should still load
- Previously synced payment information may be shown with a clear freshness indicator

However:

Do not falsely display live payment/account information as current when it is stale.

Example:

```text
Payment information
Last synced 12 min ago
```

For actions that require server confirmation, respect the existing offline queue/sync architecture.

Phone calling itself can work without mobile data if the device has cellular service.

---

# 20. DATA FRESHNESS

For payment/account information, distinguish:

**Live**

from

**Last synced**

Example:

```text
Payment
Updated just now
```

or

```text
Payment
Last synced 14 min ago
```

Do not make the Agent believe stale financial information is live.

---

# 21. ERROR STATES

Handle:

### Farmer not found

```text
Farmer not found

This card could not be matched with a registered farmer.

[ Scan Again ]
```

### Farmer inactive

```text
Farmer Account Inactive

Please contact your supervisor before collecting milk.
```

### Missing photo

Show a professional placeholder.

### Missing phone

Disable Call.

### Payment unavailable

```text
Payment details temporarily unavailable
```

Do not block milk collection unless the business rules explicitly require payment information.

### Network unavailable

Use cached information where safe and follow existing offline rules.

---

# 22. UI/UX REQUIREMENTS

The screen must be:

- Fast
- Clean
- Professional
- Touch friendly
- Easy to use while standing at a collection point
- Readable in outdoor conditions
- Minimal scrolling
- Clear hierarchy

Avoid:

- excessive cards
- excessive animations
- decorative gradients
- unnecessary information
- emoji icons
- tiny buttons
- nested modals
- unnecessary confirmation dialogs

Use existing DairyOne design language.

Use custom/professional icons.

The most important actions should be visually obvious:

**Farmer identity → Call → Verification → Continue**

---

# 23. RECOMMENDED SCREEN STRUCTURE

Use this hierarchy:

```text
FARMER VERIFICATION

[Back]

┌───────────────────────────────────┐
│ Photo                             │
│                                   │
│ Ram Lal                    Call   │
│ FRM-00452                         │
│ Khinvsar • R-04                   │
└───────────────────────────────────┘

Collection Status
✓ Eligible for Morning Collection

Payment
₹48.20 / L
Today's: ₹891.70
Pending: ₹2,450

Who is present?
● Farmer
○ Authorized Person

Verification
✓ Farmer identity verified

[ Continue to Collection ]
```

If representative:

```text
Who is present?
○ Farmer
● Authorized Person

⚠ Farmer not present

Call the registered farmer to verify
authorization.

[ Call Farmer ]

Verification
○ Waiting for confirmation

[ Continue to Collection ]  ← disabled
```

After verification:

```text
✓ Authorization Verified
Verified at 08:44 AM

[ Continue to Collection ]
```

---

# 24. DO NOT DUPLICATE BUSINESS LOGIC

Before implementing anything:

Inspect the existing repository for:

- Farmer model/types
- Farmer detail components
- QR scanner
- Collection logic
- Collection status
- Payment calculations
- Rate/slab calculations
- Shift logic
- Duplicate prevention
- GPS verification
- Offline storage
- Sync queue
- Supabase queries
- Existing hooks
- Existing authentication
- Existing Agent permissions

Reuse existing logic wherever possible.

Do not calculate payment/rates independently in a new frontend component if the application already has a central calculation system.

Do not create another farmer lookup system.

Do not create another QR system.

Do not create another collection validation system.

Extend the existing architecture.

---

# 25. SECURITY

The Agent must only see payment information permitted by the Agent role.

Do not expose:

- other farmers' information
- unrestricted financial records
- admin-only accounting information
- internal audit information
- unnecessary personal data

Supabase RLS remains the real security boundary.

Frontend hiding is NOT security.

---

# 26. DATABASE CHANGES

Before creating or modifying tables:

1. Inspect the current Supabase schema.
2. Identify existing farmer, collection, payment, rate, shift, verification, audit and route tables.
3. Reuse existing fields where possible.
4. Add only genuinely missing fields/tables.
5. Preserve existing RLS policies.
6. Add/update indexes only where justified.
7. Ensure historical collection/payment data remains immutable/auditable.

Do not blindly create a new schema.

---

# 27. TESTING REQUIREMENTS

Test all of these scenarios:

### Scenario 1
Farmer present → scan → photo/details → continue → collection.

### Scenario 2
Representative present → scan → select representative → call farmer → farmer confirms → continue.

### Scenario 3
Representative present → farmer does not confirm → collection blocked.

### Scenario 4
Farmer already collected in current shift → collection blocked.

### Scenario 5
Farmer photo unavailable → graceful fallback.

### Scenario 6
Farmer phone unavailable → Call disabled.

### Scenario 7
Weak internet → cached farmer data works.

### Scenario 8
Offline → existing collection queue remains functional.

### Scenario 9
GPS outside collection point → existing location verification blocks collection.

### Scenario 10
Agent scans wrong/unknown card → graceful error.

### Scenario 11
Inactive farmer → collection blocked according to business rules.

### Scenario 12
Payment data unavailable → collection workflow behaves according to business rules without fake values.

### Scenario 13
Agent attempts to manipulate the UI to bypass representative verification → backend must reject invalid collection if verification is required.

---

# 28. REGRESSION TEST

After implementation verify that nothing breaks in:

- Login
- Agent Home
- Punch In
- Shift detection
- Route start
- Live tracking
- GPS
- Arrival verification
- QR scanning
- Farmer selection
- Collection
- Quality
- Offline mode
- Sync
- Duplicate prevention
- Route completion
- Punch Out

Do not proceed to the Admin Dashboard until the Agent flow passes regression testing.

---

# 29. IMPLEMENTATION APPROACH

Follow this order:

### STEP 1 — AUDIT

Inspect the existing Agent code and identify:

- Current farmer scan screen
- Farmer data source
- Farmer photo source
- Farmer phone field
- Existing payment information
- Existing collection status
- Existing shift logic
- Existing duplicate prevention
- Existing verification
- Existing offline architecture
- Existing Supabase queries/functions
- Existing Capacitor plugins

Do not modify code yet.

### STEP 2 — DESIGN

Map the new experience into existing components.

Prefer extending existing components over creating duplicate systems.

### STEP 3 — IMPLEMENT

Implement:

**Scan → Farmer Verification → Payment Details → Present/Representative → Call Verification → Continue**

### STEP 4 — BACKEND

Only add the minimum required database/API/RLS changes.

### STEP 5 — OFFLINE

Integrate with the existing cache and sync system.

### STEP 6 — TEST

Test all scenarios above.

### STEP 7 — BUILD

Run the actual project scripts from `package.json`.

Run:

- build
- typecheck
- lint
- tests if available

Do not invent scripts.

Fix real errors.

### STEP 8 — FINAL AUDIT

Confirm:

**No Agent functionality was broken.**

Only after this is complete, proceed to the **DairyOne Admin Operations Control Centre / Dashboard** implementation.

---

# FINAL PRODUCT PRINCIPLE

The Agent should never have to wonder:

> "Whose milk is this?"
> "Is this farmer really verified?"
> "Can I call the farmer?"
> "Has this farmer already been collected?"
> "What is the farmer's current payment situation?"
> "Can I safely continue?"

The screen should answer all of these immediately.

The operational flow should be:

**SCAN → IDENTIFY → SEE PHOTO → CHECK COLLECTION STATUS → SEE PAYMENT → CONFIRM WHO IS PRESENT → CALL IF REPRESENTATIVE → VERIFY → CONTINUE → COLLECT**

Make this production-ready, not a mockup.
Do not use mock data.
Do not break existing functionality.
Do not rebuild the application.
Reuse the existing DairyOne architecture wherever possible.