# Kopi Boy Partner App V1

One app for both Kopi Boy partner roles:

- Cook
- Rider

The partner selects a role first. Approved-name dropdown access is intentionally temporary for staging. Proper authentication/OTP and role-based authorization will be added before public launch.

Cook features: profile, menu, photos, prices, pax, operating/order times, live orders, accept/reject, find rider, cooking/ready states.

Rider features: profile, vehicle/area, live delivery jobs, accept delivery, pickup/delivery status.

All live data uses the same Supabase backend as the Customer app.


## Kopi Boy v1.1 changes
- Customer: area/postal-code food filtering and mandatory delivery address before ordering.
- Partner: first-time cook/rider compliance acknowledgement; optional SFA licence declaration for cooks.
- Management: acknowledgement/licence status visible during approval.
