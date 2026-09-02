
-- Demo centre
insert into public.mcc_centres (id, name, code, village, district, state, lat, lng, active)
values ('11111111-1111-4111-8111-111111111111','Anand Dairy MCC','MCC-01','Anand','Anand','Gujarat',22.5645,72.9289,true);

-- Rate slabs (fat/snf bands)
insert into public.rate_slabs (mcc_id, animal_type, min_fat, max_fat, min_snf, max_snf, rate_per_litre, active) values
('11111111-1111-4111-8111-111111111111','cow',0,3.0,0,8.0,26.00,true),
('11111111-1111-4111-8111-111111111111','cow',3.0,3.5,8.0,8.5,30.50,true),
('11111111-1111-4111-8111-111111111111','cow',3.5,4.5,8.3,9.5,34.00,true),
('11111111-1111-4111-8111-111111111111','cow',4.5,12,8.5,12,38.00,true),
('11111111-1111-4111-8111-111111111111','buffalo',0,5.0,0,8.5,38.00,true),
('11111111-1111-4111-8111-111111111111','buffalo',5.0,6.5,8.5,9.2,46.00,true),
('11111111-1111-4111-8111-111111111111','buffalo',6.5,12,9.0,12,52.00,true);

-- Agent linked to the existing agent-role phone account
insert into public.agents (id, profile_id, mcc_id, employee_code, full_name, phone, status)
values ('22222222-2222-4222-8222-222222222222','17fd1be8-12dd-4c26-8d17-c917b812ddd8','11111111-1111-4111-8111-111111111111','AGT-001','Test Owner','9876543210','active');

-- Route + stops
insert into public.routes (id, mcc_id, name, description, assigned_agent_id, active)
values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Morning Route 1','Anand village loop','22222222-2222-4222-8222-222222222222',true);

insert into public.route_points (id, route_id, name, sequence, lat, lng) values
('44444444-4444-4444-8444-000000000001','33333333-3333-4333-8333-333333333333','Point A — Temple Chowk',1,22.5651,72.9301),
('44444444-4444-4444-8444-000000000002','33333333-3333-4333-8333-333333333333','Point B — School Gate',2,22.5702,72.9355);

-- Farmers
insert into public.farmers (id, mcc_id, farmer_code, full_name, phone, village, upi_id, status) values
('55555555-5555-4555-8555-000000000001','11111111-1111-4111-8111-111111111111','FRM-001','Ramesh Patel','9000000001','Anand','ramesh@upi','active'),
('55555555-5555-4555-8555-000000000002','11111111-1111-4111-8111-111111111111','FRM-002','Sita Devi','9000000002','Anand','sita@upi','active'),
('55555555-5555-4555-8555-000000000003','11111111-1111-4111-8111-111111111111','FRM-003','Mahesh Solanki','9000000003','Anand','mahesh@upi','active'),
('55555555-5555-4555-8555-000000000004','11111111-1111-4111-8111-111111111111','FRM-004','Kiran Chauhan','9000000004','Vidyanagar','kiran@upi','active'),
('55555555-5555-4555-8555-000000000005','11111111-1111-4111-8111-111111111111','FRM-005','Bhavna Rathod','9000000005','Vidyanagar','bhavna@upi','active'),
('55555555-5555-4555-8555-000000000006','11111111-1111-4111-8111-111111111111','FRM-006','Jayesh Parmar','9000000006','Vidyanagar','jayesh@upi','active');

insert into public.farmer_animals (farmer_id, animal_type, animal_count, health_notes) values
('55555555-5555-4555-8555-000000000001','buffalo',4,'Healthy'),
('55555555-5555-4555-8555-000000000002','cow',3,'Healthy'),
('55555555-5555-4555-8555-000000000003','cow',5,'Vaccination due next month'),
('55555555-5555-4555-8555-000000000004','buffalo',2,'Healthy'),
('55555555-5555-4555-8555-000000000005','cow',6,'Healthy'),
('55555555-5555-4555-8555-000000000006','buffalo',3,'Healthy');

insert into public.route_point_farmers (route_point_id, farmer_id, sequence) values
('44444444-4444-4444-8444-000000000001','55555555-5555-4555-8555-000000000001',1),
('44444444-4444-4444-8444-000000000001','55555555-5555-4555-8555-000000000002',2),
('44444444-4444-4444-8444-000000000001','55555555-5555-4555-8555-000000000003',3),
('44444444-4444-4444-8444-000000000002','55555555-5555-4555-8555-000000000004',1),
('44444444-4444-4444-8444-000000000002','55555555-5555-4555-8555-000000000005',2),
('44444444-4444-4444-8444-000000000002','55555555-5555-4555-8555-000000000006',3);

-- Scope the agent-role assignment to the centre
update public.user_roles set mcc_id = '11111111-1111-4111-8111-111111111111'
where user_id = '17fd1be8-12dd-4c26-8d17-c917b812ddd8';
