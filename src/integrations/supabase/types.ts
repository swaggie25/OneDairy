export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          created_at: string
          employee_code: string
          full_name: string
          id: string
          mcc_id: string
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_code: string
          full_name: string
          id?: string
          mcc_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_code?: string
          full_name?: string
          id?: string
          mcc_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "agents_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "agents_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      attendance: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          mcc_id: string
          punch_in_at: string
          punch_in_lat: number | null
          punch_in_lng: number | null
          punch_out_at: string | null
          punch_out_lat: number | null
          punch_out_lng: number | null
          route_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          mcc_id: string
          punch_in_at?: string
          punch_in_lat?: number | null
          punch_in_lng?: number | null
          punch_out_at?: string | null
          punch_out_lat?: number | null
          punch_out_lng?: number | null
          route_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          mcc_id?: string
          punch_in_at?: string
          punch_in_lat?: number | null
          punch_in_lng?: number | null
          punch_out_at?: string | null
          punch_out_lat?: number | null
          punch_out_lng?: number | null
          route_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "attendance_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "attendance_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "attendance_route_id_fkey"; columns: ["route_id"]; isOneToOne: false; referencedRelation: "routes"; referencedColumns: ["id"] },
        ]
      }
      tracking_sessions: {
        Row: {
          agent_id: string
          attendance_id: string
          created_at: string
          end_at: string | null
          end_lat: number | null
          end_lng: number | null
          failure_reason: string | null
          id: string
          last_location_at: string | null
          last_location_lat: number | null
          last_location_lng: number | null
          mcc_id: string
          route_id: string | null
          shift: string | null
          start_at: string | null
          start_lat: number | null
          start_lng: number | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          attendance_id: string
          created_at?: string
          end_at?: string | null
          end_lat?: number | null
          end_lng?: number | null
          failure_reason?: string | null
          id?: string
          last_location_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          mcc_id: string
          route_id?: string | null
          shift?: string | null
          start_at?: string | null
          start_lat?: number | null
          start_lng?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          attendance_id?: string
          created_at?: string
          end_at?: string | null
          end_lat?: number | null
          end_lng?: number | null
          failure_reason?: string | null
          id?: string
          last_location_at?: string | null
          last_location_lat?: number | null
          last_location_lng?: number | null
          mcc_id?: string
          route_id?: string | null
          shift?: string | null
          start_at?: string | null
          start_lat?: number | null
          start_lng?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_sessions_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: true
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_sessions_mcc_id_fkey"
            columns: ["mcc_id"]
            isOneToOne: false
            referencedRelation: "mcc_centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_sessions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }


      buyers: {
        Row: {
          active: boolean
          city: string | null
          code: string
          contact_person: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          code: string
          contact_person?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          code?: string
          contact_person?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "buyers_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      complaints: {
        Row: {
          category: string
          created_at: string
          description: string | null
          farmer_id: string | null
          id: string
          mcc_id: string | null
          raised_by: string | null
          resolution: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          farmer_id?: string | null
          id?: string
          mcc_id?: string | null
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          farmer_id?: string | null
          id?: string
          mcc_id?: string | null
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "complaints_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
          { foreignKeyName: "complaints_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      farmer_animals: {
        Row: {
          animal_count: number
          animal_type: string
          created_at: string
          farmer_id: string
          health_notes: string | null
          id: string
        }
        Insert: {
          animal_count?: number
          animal_type: string
          created_at?: string
          farmer_id: string
          health_notes?: string | null
          id?: string
        }
        Update: {
          animal_count?: number
          animal_type?: string
          created_at?: string
          farmer_id?: string
          health_notes?: string | null
          id?: string
        }
        Relationships: [
          { foreignKeyName: "farmer_animals_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
        ]
      }
      farmers: {
        Row: {
          bank_account: string | null
          created_at: string
          farmer_code: string
          full_name: string
          geofence_radius_m: number | null
          id: string
          ifsc: string | null
          mcc_id: string
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
          upi_id: string | null
          village: string | null
        }
        Insert: {
          bank_account?: string | null
          created_at?: string
          farmer_code: string
          full_name: string
          geofence_radius_m?: number | null
          id?: string
          ifsc?: string | null
          mcc_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
          upi_id?: string | null
          village?: string | null
        }
        Update: {
          bank_account?: string | null
          created_at?: string
          farmer_code?: string
          full_name?: string
          geofence_radius_m?: number | null
          id?: string
          ifsc?: string | null
          mcc_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
          upi_id?: string | null
          village?: string | null
        }
        Relationships: [
          { foreignKeyName: "farmers_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "farmers_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      forecasts: {
        Row: {
          confidence: number | null
          created_at: string
          horizon_date: string
          id: string
          metric: string
          model_version: string | null
          predicted_value: number | null
          scope_id: string | null
          scope_type: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          horizon_date: string
          id?: string
          metric: string
          model_version?: string | null
          predicted_value?: number | null
          scope_id?: string | null
          scope_type: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          horizon_date?: string
          id?: string
          metric?: string
          model_version?: string | null
          predicted_value?: number | null
          scope_id?: string | null
          scope_type?: string
        }
        Relationships: []
      }
      gps_pings: {
        Row: {
          accuracy: number | null
          agent_id: string
          altitude: number | null
          client_id: string | null
          event_type: string
          halt_seconds: number | null
          heading: number | null
          id: string
          lat: number | null
          lng: number | null
          mcc_id: string
          quality: string | null
          recorded_at: string
          route_point_id: string | null
          speed_kmh: number | null
          sync_state: string
          synced_at: string
          tracking_session_id: string | null
          trip_id: string | null
        }
        Insert: {
          accuracy?: number | null
          agent_id: string
          altitude?: number | null
          client_id?: string | null
          event_type?: string
          halt_seconds?: number | null
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mcc_id: string
          quality?: string | null
          recorded_at?: string
          route_point_id?: string | null
          speed_kmh?: number | null
          sync_state?: string
          synced_at?: string
          tracking_session_id?: string | null
          trip_id?: string | null
        }
        Update: {
          accuracy?: number | null
          agent_id?: string
          altitude?: number | null
          client_id?: string | null
          event_type?: string
          halt_seconds?: number | null
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mcc_id?: string
          quality?: string | null
          recorded_at?: string
          route_point_id?: string | null
          speed_kmh?: number | null
          sync_state?: string
          synced_at?: string
          tracking_session_id?: string | null
          trip_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "gps_pings_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "gps_pings_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "gps_pings_route_point_id_fkey"; columns: ["route_point_id"]; isOneToOne: false; referencedRelation: "route_points"; referencedColumns: ["id"] },
          { foreignKeyName: "gps_pings_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "route_trips"; referencedColumns: ["id"] },
          { foreignKeyName: "gps_pings_tracking_session_id_fkey"; columns: ["tracking_session_id"]; isOneToOne: false; referencedRelation: "tracking_sessions"; referencedColumns: ["id"] },
        ]
      }
      ledger_entries: {
        Row: {
          account: string
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          entry_date: string
          id: string
          mcc_id: string
          ref_id: string | null
          ref_type: string | null
        }
        Insert: {
          account: string
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: string
          entry_date?: string
          id?: string
          mcc_id: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Update: {
          account?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          entry_date?: string
          id?: string
          mcc_id?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Relationships: [
          { foreignKeyName: "ledger_entries_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      mcc_centres: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_geofence_radius_m: number
          district: string | null
          handover_variance_tolerance_litres: number
          id: string
          lat: number | null
          lng: number | null
          min_gps_accuracy_m: number
          name: string
          on_time_threshold_min: number
          delayed_threshold_min: number
          route_deviation_threshold_m: number
          unplanned_stop_minutes: number
          state: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_geofence_radius_m?: number
          district?: string | null
          handover_variance_tolerance_litres?: number
          id?: string
          lat?: number | null
          lng?: number | null
          min_gps_accuracy_m?: number
          name: string
          on_time_threshold_min?: number
          delayed_threshold_min?: number
          route_deviation_threshold_m?: number
          unplanned_stop_minutes?: number
          state?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_geofence_radius_m?: number
          district?: string | null
          handover_variance_tolerance_litres?: number
          id?: string
          lat?: number | null
          lng?: number | null
          min_gps_accuracy_m?: number
          name?: string
          on_time_threshold_min?: number
          delayed_threshold_min?: number
          route_deviation_threshold_m?: number
          unplanned_stop_minutes?: number
          state?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: []
      }
      mcc_handovers: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          declared_collection_count: number
          declared_quantity_litres: number
          id: string
          mcc_id: string
          receipt_notes: string | null
          received_at: string | null
          received_by: string | null
          received_quantity_litres: number | null
          session: string
          status: string
          trip_date: string
          trip_id: string
          updated_at: string
          variance_acknowledged_at: string | null
          variance_acknowledged_by: string | null
          variance_litres: number | null
          variance_reason: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          declared_collection_count?: number
          declared_quantity_litres: number
          id?: string
          mcc_id: string
          receipt_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          received_quantity_litres?: number | null
          session?: string
          status?: string
          trip_date: string
          trip_id: string
          updated_at?: string
          variance_acknowledged_at?: string | null
          variance_acknowledged_by?: string | null
          variance_litres?: number | null
          variance_reason?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          declared_collection_count?: number
          declared_quantity_litres?: number
          id?: string
          mcc_id?: string
          receipt_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          received_quantity_litres?: number | null
          session?: string
          status?: string
          trip_date?: string
          trip_id?: string
          updated_at?: string
          variance_acknowledged_at?: string | null
          variance_acknowledged_by?: string | null
          variance_litres?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          { foreignKeyName: "mcc_handovers_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "mcc_handovers_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "mcc_handovers_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: true; referencedRelation: "route_trips"; referencedColumns: ["id"] },
        ]
      }
      milk_collections: {
        Row: {
          acidity: number | null
          agent_id: string | null
          animal_type: string
          antibiotic_test_result: string | null
          client_ref: string | null
          clr: number | null
          collected_at: string
          created_at: string
          created_by: string | null
          distance_from_point_m: number | null
          farmer_id: string
          fat_pct: number | null
          geofence_radius_m: number | null
          gps_accuracy_m: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          mcc_id: string
          offline_synced_at: string | null
          quality_override_reason: string | null
          quantity_litres: number
          rate_per_litre: number
          risk_score: number | null
          route_point_id: string | null
          session: string
          signature_url: string | null
          snf_pct: number | null
          source: string
          status: string
          temperature: number | null
          total_amount: number
          trip_id: string | null
          updated_at: string
          verification_result: string | null
          verified_at: string | null
          verified_by: string | null
          water_adulteration_flag: boolean
          water_adulteration_pct: number | null
        }
        Insert: {
          acidity?: number | null
          agent_id?: string | null
          animal_type?: string
          antibiotic_test_result?: string | null
          client_ref?: string | null
          clr?: number | null
          collected_at?: string
          created_at?: string
          created_by?: string | null
          distance_from_point_m?: number | null
          farmer_id: string
          fat_pct?: number | null
          geofence_radius_m?: number | null
          gps_accuracy_m?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          mcc_id: string
          offline_synced_at?: string | null
          quality_override_reason?: string | null
          quantity_litres: number
          rate_per_litre?: number
          risk_score?: number | null
          route_point_id?: string | null
          session?: string
          signature_url?: string | null
          snf_pct?: number | null
          source?: string
          status?: string
          temperature?: number | null
          total_amount?: number
          trip_id?: string | null
          updated_at?: string
          verification_result?: string | null
          verified_at?: string | null
          verified_by?: string | null
          water_adulteration_flag?: boolean
          water_adulteration_pct?: number | null
        }
        Update: {
          acidity?: number | null
          agent_id?: string | null
          animal_type?: string
          antibiotic_test_result?: string | null
          client_ref?: string | null
          clr?: number | null
          collected_at?: string
          created_at?: string
          created_by?: string | null
          distance_from_point_m?: number | null
          farmer_id?: string
          fat_pct?: number | null
          geofence_radius_m?: number | null
          gps_accuracy_m?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          mcc_id?: string
          offline_synced_at?: string | null
          quality_override_reason?: string | null
          quantity_litres?: number
          rate_per_litre?: number
          risk_score?: number | null
          route_point_id?: string | null
          session?: string
          signature_url?: string | null
          snf_pct?: number | null
          source?: string
          status?: string
          temperature?: number | null
          total_amount?: number
          trip_id?: string | null
          updated_at?: string
          verification_result?: string | null
          verified_at?: string | null
          verified_by?: string | null
          water_adulteration_flag?: boolean
          water_adulteration_pct?: number | null
        }
        Relationships: [
          { foreignKeyName: "milk_collections_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "milk_collections_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
          { foreignKeyName: "milk_collections_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "milk_collections_route_point_id_fkey"; columns: ["route_point_id"]; isOneToOne: false; referencedRelation: "route_points"; referencedColumns: ["id"] },
          { foreignKeyName: "milk_collections_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "route_trips"; referencedColumns: ["id"] },
        ]
      }
      otp_codes: {
        Row: {
          attempts: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          attempts?: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          attempts?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          created_at: string
          deductions: number
          farmer_id: string
          gross_amount: number
          id: string
          mcc_id: string
          method: string
          net_amount: number
          paid_at: string | null
          period_end: string
          period_start: string
          quantity_litres: number
          reference: string | null
          settlement_run_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deductions?: number
          farmer_id: string
          gross_amount?: number
          id?: string
          mcc_id: string
          method?: string
          net_amount?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          quantity_litres?: number
          reference?: string | null
          settlement_run_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deductions?: number
          farmer_id?: string
          gross_amount?: number
          id?: string
          mcc_id?: string
          method?: string
          net_amount?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          quantity_litres?: number
          reference?: string | null
          settlement_run_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "payments_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_settlement_run_id_fkey"; columns: ["settlement_run_id"]; isOneToOne: false; referencedRelation: "settlement_runs"; referencedColumns: ["id"] },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      qr_cards: {
        Row: {
          active: boolean
          card_type: string
          code_value: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          issued_at: string
          mcc_id: string | null
        }
        Insert: {
          active?: boolean
          card_type?: string
          code_value: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          issued_at?: string
          mcc_id?: string | null
        }
        Update: {
          active?: boolean
          card_type?: string
          code_value?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          issued_at?: string
          mcc_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "qr_cards_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      quality_alerts: {
        Row: {
          alert_type: string
          collection_id: string | null
          created_at: string
          farmer_id: string | null
          id: string
          mcc_id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          collection_id?: string | null
          created_at?: string
          farmer_id?: string | null
          id?: string
          mcc_id: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          collection_id?: string | null
          created_at?: string
          farmer_id?: string | null
          id?: string
          mcc_id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "quality_alerts_collection_id_fkey"; columns: ["collection_id"]; isOneToOne: false; referencedRelation: "milk_collections"; referencedColumns: ["id"] },
          { foreignKeyName: "quality_alerts_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
          { foreignKeyName: "quality_alerts_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      quality_tests: {
        Row: {
          acidity: number | null
          antibiotic_test_result: string | null
          collection_id: string
          fat_pct: number | null
          id: string
          notes: string | null
          sample_id: string
          snf_pct: number | null
          temperature: number | null
          tested_at: string
          tested_by: string | null
          water_adulteration_pct: number | null
        }
        Insert: {
          acidity?: number | null
          antibiotic_test_result?: string | null
          collection_id: string
          fat_pct?: number | null
          id?: string
          notes?: string | null
          sample_id: string
          snf_pct?: number | null
          temperature?: number | null
          tested_at?: string
          tested_by?: string | null
          water_adulteration_pct?: number | null
        }
        Update: {
          acidity?: number | null
          antibiotic_test_result?: string | null
          collection_id?: string
          fat_pct?: number | null
          id?: string
          notes?: string | null
          sample_id?: string
          snf_pct?: number | null
          temperature?: number | null
          tested_at?: string
          tested_by?: string | null
          water_adulteration_pct?: number | null
        }
        Relationships: [
          { foreignKeyName: "quality_tests_collection_id_fkey"; columns: ["collection_id"]; isOneToOne: false; referencedRelation: "milk_collections"; referencedColumns: ["id"] },
        ]
      }
      rate_slabs: {
        Row: {
          active: boolean
          animal_type: string
          created_at: string
          id: string
          max_fat: number
          max_snf: number
          mcc_id: string | null
          min_fat: number
          min_snf: number
          rate_per_litre: number
        }
        Insert: {
          active?: boolean
          animal_type?: string
          created_at?: string
          id?: string
          max_fat?: number
          max_snf?: number
          mcc_id?: string | null
          min_fat?: number
          min_snf?: number
          rate_per_litre: number
        }
        Update: {
          active?: boolean
          animal_type?: string
          created_at?: string
          id?: string
          max_fat?: number
          max_snf?: number
          mcc_id?: string | null
          min_fat?: number
          min_snf?: number
          rate_per_litre?: number
        }
        Relationships: [
          { foreignKeyName: "rate_slabs_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      route_assignments: {
        Row: {
          agent_id: string
          assignment_date: string
          created_at: string
          created_by: string | null
          id: string
          mcc_id: string
          notes: string | null
          route_id: string
          sequence_locked: boolean
          shift: string
          status: string
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          agent_id: string
          assignment_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mcc_id: string
          notes?: string | null
          route_id: string
          sequence_locked?: boolean
          shift?: string
          status?: string
          updated_at?: string
          vehicle_type?: string
        }
        Update: {
          agent_id?: string
          assignment_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mcc_id?: string
          notes?: string | null
          route_id?: string
          sequence_locked?: boolean
          shift?: string
          status?: string
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: [
          { foreignKeyName: "route_assignments_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "route_assignments_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "route_assignments_route_id_fkey"; columns: ["route_id"]; isOneToOne: false; referencedRelation: "routes"; referencedColumns: ["id"] },
        ]
      }
      shift_definitions: {
        Row: {
          active: boolean
          applicable_days: number[]
          code: string
          collection_point_id: string | null
          created_at: string
          end_time: string
          grace_period_minutes: number
          id: string
          mcc_id: string
          name: string
          route_id: string | null
          start_time: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          applicable_days?: number[]
          code: string
          collection_point_id?: string | null
          created_at?: string
          end_time: string
          grace_period_minutes?: number
          id?: string
          mcc_id: string
          name: string
          route_id?: string | null
          start_time: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          applicable_days?: number[]
          code?: string
          collection_point_id?: string | null
          created_at?: string
          end_time?: string
          grace_period_minutes?: number
          id?: string
          mcc_id?: string
          name?: string
          route_id?: string | null
          start_time?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          { foreignKeyName: "shift_definitions_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "shift_definitions_route_id_fkey"; columns: ["route_id"]; isOneToOne: false; referencedRelation: "routes"; referencedColumns: ["id"] },
          { foreignKeyName: "shift_definitions_collection_point_id_fkey"; columns: ["collection_point_id"]; isOneToOne: false; referencedRelation: "route_points"; referencedColumns: ["id"] },
        ]
      }
      route_change_requests: {
        Row: {
          agent_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          deviation_id: string | null
          id: string
          mcc_id: string
          original_route_id: string | null
          proposed_distance_meters: number | null
          proposed_duration_seconds: number | null
          proposed_polyline: string | null
          reason_code: string | null
          reason_text: string | null
          requested_at: string
          requires_approval: boolean
          status: string
          trip_id: string
          voice_note_url: string | null
          voice_transcription: string | null
        }
        Insert: {
          agent_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          deviation_id?: string | null
          id?: string
          mcc_id: string
          original_route_id?: string | null
          proposed_distance_meters?: number | null
          proposed_duration_seconds?: number | null
          proposed_polyline?: string | null
          reason_code?: string | null
          reason_text?: string | null
          requested_at?: string
          requires_approval?: boolean
          status?: string
          trip_id: string
          voice_note_url?: string | null
          voice_transcription?: string | null
        }
        Update: {
          agent_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          deviation_id?: string | null
          id?: string
          mcc_id?: string
          original_route_id?: string | null
          proposed_distance_meters?: number | null
          proposed_duration_seconds?: number | null
          proposed_polyline?: string | null
          reason_code?: string | null
          reason_text?: string | null
          requested_at?: string
          requires_approval?: boolean
          status?: string
          trip_id?: string
          voice_note_url?: string | null
          voice_transcription?: string | null
        }
        Relationships: [
          { foreignKeyName: "route_change_requests_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "route_change_requests_deviation_id_fkey"; columns: ["deviation_id"]; isOneToOne: false; referencedRelation: "route_deviations"; referencedColumns: ["id"] },
          { foreignKeyName: "route_change_requests_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "route_change_requests_original_route_id_fkey"; columns: ["original_route_id"]; isOneToOne: false; referencedRelation: "routes"; referencedColumns: ["id"] },
          { foreignKeyName: "route_change_requests_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "route_trips"; referencedColumns: ["id"] },
        ]
      }
      route_deviations: {
        Row: {
          agent_id: string
          created_at: string
          detected_at: string
          deviation_meters: number | null
          id: string
          lat: number | null
          lng: number | null
          mcc_id: string
          reason_code: string | null
          reason_text: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          trip_id: string
          voice_note_url: string | null
          voice_transcription: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          detected_at?: string
          deviation_meters?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mcc_id: string
          reason_code?: string | null
          reason_text?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          trip_id: string
          voice_note_url?: string | null
          voice_transcription?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          detected_at?: string
          deviation_meters?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mcc_id?: string
          reason_code?: string | null
          reason_text?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          trip_id?: string
          voice_note_url?: string | null
          voice_transcription?: string | null
        }
        Relationships: [
          { foreignKeyName: "route_deviations_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "route_deviations_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "route_deviations_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "route_trips"; referencedColumns: ["id"] },
        ]
      }
      route_point_farmers: {
        Row: {
          farmer_id: string
          id: string
          route_point_id: string
          sequence: number
        }
        Insert: {
          farmer_id: string
          id?: string
          route_point_id: string
          sequence?: number
        }
        Update: {
          farmer_id?: string
          id?: string
          route_point_id?: string
          sequence?: number
        }
        Relationships: [
          { foreignKeyName: "route_point_farmers_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
          { foreignKeyName: "route_point_farmers_route_point_id_fkey"; columns: ["route_point_id"]; isOneToOne: false; referencedRelation: "route_points"; referencedColumns: ["id"] },
        ]
      }
      route_points: {
        Row: {
          created_at: string
          geofence_radius_m: number | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          route_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          geofence_radius_m?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          route_id: string
          sequence?: number
        }
        Update: {
          created_at?: string
          geofence_radius_m?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          route_id?: string
          sequence?: number
        }
        Relationships: [
          { foreignKeyName: "route_points_route_id_fkey"; columns: ["route_id"]; isOneToOne: false; referencedRelation: "routes"; referencedColumns: ["id"] },
        ]
      }
      route_trips: {
        Row: {
          actual_distance_meters: number | null
          actual_duration_seconds: number | null
          agent_id: string
          created_at: string
          current_route_point_id: string | null
          deviation_count: number
          ended_at: string | null
          id: string
          mcc_id: string
          planned_polyline: string | null
          route_assignment_id: string | null
          route_id: string | null
          session: string
          started_at: string | null
          status: string
          trip_date: string
          trip_type: string
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          actual_distance_meters?: number | null
          actual_duration_seconds?: number | null
          agent_id: string
          created_at?: string
          current_route_point_id?: string | null
          deviation_count?: number
          ended_at?: string | null
          id?: string
          mcc_id: string
          planned_polyline?: string | null
          route_assignment_id?: string | null
          route_id?: string | null
          session?: string
          started_at?: string | null
          status?: string
          trip_date?: string
          trip_type?: string
          updated_at?: string
          vehicle_type?: string
        }
        Update: {
          actual_distance_meters?: number | null
          actual_duration_seconds?: number | null
          agent_id?: string
          created_at?: string
          current_route_point_id?: string | null
          deviation_count?: number
          ended_at?: string | null
          id?: string
          mcc_id?: string
          planned_polyline?: string | null
          route_assignment_id?: string | null
          route_id?: string | null
          session?: string
          started_at?: string | null
          status?: string
          trip_date?: string
          trip_type?: string
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: [
          { foreignKeyName: "route_trips_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "route_trips_current_route_point_id_fkey"; columns: ["current_route_point_id"]; isOneToOne: false; referencedRelation: "route_points"; referencedColumns: ["id"] },
          { foreignKeyName: "route_trips_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "route_trips_route_assignment_id_fkey"; columns: ["route_assignment_id"]; isOneToOne: false; referencedRelation: "route_assignments"; referencedColumns: ["id"] },
          { foreignKeyName: "route_trips_route_id_fkey"; columns: ["route_id"]; isOneToOne: false; referencedRelation: "routes"; referencedColumns: ["id"] },
        ]
      }
      routes: {
        Row: {
          active: boolean
          assigned_agent_id: string | null
          created_at: string
          created_by: string | null
          created_from_trip_id: string | null
          default_vehicle_type: string
          description: string | null
          distance_meters: number | null
          duration_seconds: number | null
          id: string
          mcc_id: string
          name: string
          polyline: string | null
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_agent_id?: string | null
          created_at?: string
          created_by?: string | null
          created_from_trip_id?: string | null
          default_vehicle_type?: string
          description?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          id?: string
          mcc_id: string
          name: string
          polyline?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_agent_id?: string | null
          created_at?: string
          created_by?: string | null
          created_from_trip_id?: string | null
          default_vehicle_type?: string
          description?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          id?: string
          mcc_id?: string
          name?: string
          polyline?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "routes_assigned_agent_id_fkey"; columns: ["assigned_agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "routes_created_from_trip_id_fkey"; columns: ["created_from_trip_id"]; isOneToOne: false; referencedRelation: "route_trips"; referencedColumns: ["id"] },
          { foreignKeyName: "routes_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      settlement_runs: {
        Row: {
          created_at: string
          created_by: string | null
          farmer_count: number
          id: string
          mcc_id: string
          notes: string | null
          period_end: string
          period_start: string
          status: string
          total_amount: number
          total_litres: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          farmer_count?: number
          id?: string
          mcc_id: string
          notes?: string | null
          period_end: string
          period_start: string
          status?: string
          total_amount?: number
          total_litres?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          farmer_count?: number
          id?: string
          mcc_id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total_amount?: number
          total_litres?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "settlement_runs_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      transfer_collections: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          transfer_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          transfer_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          transfer_id?: string
        }
        Relationships: [
          { foreignKeyName: "transfer_collections_collection_id_fkey"; columns: ["collection_id"]; isOneToOne: true; referencedRelation: "milk_collections"; referencedColumns: ["id"] },
          { foreignKeyName: "transfer_collections_transfer_id_fkey"; columns: ["transfer_id"]; isOneToOne: false; referencedRelation: "transfers"; referencedColumns: ["id"] },
        ]
      }
      transfers: {
        Row: {
          avg_fat: number | null
          avg_snf: number | null
          buyer_id: string
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          id: string
          mcc_id: string
          notes: string | null
          quantity_litres: number
          received_at: string | null
          session: string
          status: string
          tanker_id: string | null
          transfer_date: string
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          avg_fat?: number | null
          avg_snf?: number | null
          buyer_id: string
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          id?: string
          mcc_id: string
          notes?: string | null
          quantity_litres?: number
          received_at?: string | null
          session?: string
          status?: string
          tanker_id?: string | null
          transfer_date?: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          avg_fat?: number | null
          avg_snf?: number | null
          buyer_id?: string
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          id?: string
          mcc_id?: string
          notes?: string | null
          quantity_litres?: number
          received_at?: string | null
          session?: string
          status?: string
          tanker_id?: string | null
          transfer_date?: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: [
          { foreignKeyName: "transfers_buyer_id_fkey"; columns: ["buyer_id"]; isOneToOne: false; referencedRelation: "buyers"; referencedColumns: ["id"] },
          { foreignKeyName: "transfers_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
      trip_exceptions: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          farmer_id: string | null
          id: string
          lat: number | null
          lng: number | null
          mcc_id: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          route_point_id: string | null
          status: string
          trip_id: string
          type: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          farmer_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          mcc_id: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route_point_id?: string | null
          status?: string
          trip_id: string
          type: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          farmer_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          mcc_id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route_point_id?: string | null
          status?: string
          trip_id?: string
          type?: string
        }
        Relationships: [
          { foreignKeyName: "trip_exceptions_agent_id_fkey"; columns: ["agent_id"]; isOneToOne: false; referencedRelation: "agents"; referencedColumns: ["id"] },
          { foreignKeyName: "trip_exceptions_farmer_id_fkey"; columns: ["farmer_id"]; isOneToOne: false; referencedRelation: "farmers"; referencedColumns: ["id"] },
          { foreignKeyName: "trip_exceptions_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
          { foreignKeyName: "trip_exceptions_route_point_id_fkey"; columns: ["route_point_id"]; isOneToOne: false; referencedRelation: "route_points"; referencedColumns: ["id"] },
          { foreignKeyName: "trip_exceptions_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "route_trips"; referencedColumns: ["id"] },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          mcc_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mcc_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mcc_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          { foreignKeyName: "user_roles_mcc_id_fkey"; columns: ["mcc_id"]; isOneToOne: false; referencedRelation: "mcc_centres"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_handover_variance: {
        Args: { p_handover_id: string; p_reason: string }
        Returns: {
          agent_id: string
          created_at: string
          created_by: string | null
          declared_collection_count: number
          declared_quantity_litres: number
          id: string
          mcc_id: string
          receipt_notes: string | null
          received_at: string | null
          received_by: string | null
          received_quantity_litres: number | null
          session: string
          status: string
          trip_date: string
          trip_id: string
          updated_at: string
          variance_acknowledged_at: string | null
          variance_acknowledged_by: string | null
          variance_litres: number | null
          variance_reason: string | null
        }
        SetofOptions: { from: "*"; to: "mcc_handovers"; isOneToOne: true; isSetofReturn: false }
      }
      create_mcc_handover: {
        Args: { p_trip_id: string }
        Returns: {
          agent_id: string
          created_at: string
          created_by: string | null
          declared_collection_count: number
          declared_quantity_litres: number
          id: string
          mcc_id: string
          receipt_notes: string | null
          received_at: string | null
          received_by: string | null
          received_quantity_litres: number | null
          session: string
          status: string
          trip_date: string
          trip_id: string
          updated_at: string
          variance_acknowledged_at: string | null
          variance_acknowledged_by: string | null
          variance_litres: number | null
          variance_reason: string | null
        }
        SetofOptions: { from: "*"; to: "mcc_handovers"; isOneToOne: true; isSetofReturn: false }
      }
      get_shift_status: {
        Args: {
          p_at?: string
          p_collection_point_id?: string | null
          p_mcc_id: string
          p_route_id?: string | null
        }
        Returns: {
          ending_soon: boolean
          ends_at: string | null
          grace_ends_at: string | null
          minutes_remaining: number | null
          minutes_to_start: number | null
          next_shift_code: string | null
          next_shift_name: string | null
          next_shift_starts_at: string | null
          shift_code: string | null
          shift_id: string | null
          shift_name: string | null
          starts_at: string | null
          state: string
          timezone: string
        }[]
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }
        Returns: boolean
      }
      haversine_meters: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      record_mcc_handover_receipt: {
        Args: { p_handover_id: string; p_notes?: string; p_received_quantity_litres: number }
        Returns: {
          agent_id: string
          created_at: string
          created_by: string | null
          declared_collection_count: number
          declared_quantity_litres: number
          id: string
          mcc_id: string
          receipt_notes: string | null
          received_at: string | null
          received_by: string | null
          received_quantity_litres: number | null
          session: string
          status: string
          trip_date: string
          trip_id: string
          updated_at: string
          variance_acknowledged_at: string | null
          variance_acknowledged_by: string | null
          variance_litres: number | null
          variance_reason: string | null
        }
        SetofOptions: { from: "*"; to: "mcc_handovers"; isOneToOne: true; isSetofReturn: false }
      }
      record_milk_collection: {
        Args: {
          p_acidity: number
          p_animal_type: string
          p_antibiotic_test_result: string
          p_client_ref: string
          p_clr: number
          p_collected_at: string
          p_farmer_id: string
          p_fat_pct: number
          p_gps_accuracy: number
          p_gps_lat: number
          p_gps_lng: number
          p_mcc_id: string
          p_quality_override_reason?: string
          p_quantity_litres: number
          p_rate_per_litre: number
          p_risk_score: number
          p_route_point_id: string
          p_session: string
          p_signature_url: string
          p_snf_pct: number
          p_source: string
          p_temperature: number
          p_total_amount: number
          p_trip_id: string
          p_water_adulteration_flag: boolean
          p_water_adulteration_pct: number
        }
        Returns: {
          acidity: number | null
          agent_id: string | null
          animal_type: string
          antibiotic_test_result: string | null
          client_ref: string | null
          clr: number | null
          collected_at: string
          created_at: string
          created_by: string | null
          distance_from_point_m: number | null
          farmer_id: string
          fat_pct: number | null
          geofence_radius_m: number | null
          gps_accuracy_m: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          mcc_id: string
          offline_synced_at: string | null
          quality_override_reason: string | null
          quantity_litres: number
          rate_per_litre: number
          risk_score: number | null
          route_point_id: string | null
          session: string
          signature_url: string | null
          snf_pct: number | null
          source: string
          status: string
          temperature: number | null
          total_amount: number
          trip_id: string | null
          updated_at: string
          verification_result: string | null
          verified_at: string | null
          verified_by: string | null
          water_adulteration_flag: boolean
          water_adulteration_pct: number | null
        }
        SetofOptions: { from: "*"; to: "milk_collections"; isOneToOne: true; isSetofReturn: false }
      }
      save_marked_route: {
        Args: {
          p_distance_meters: number
          p_duration_seconds: number
          p_name: string
          p_polyline: string
          p_stops: Json
          p_trip_id: string
        }
        Returns: string
      }
      user_mcc_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "owner" | "manager" | "agent" | "buyer" | "farmer" | "accountant"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "agent", "buyer", "farmer", "accountant"],
    },
  },
} as const
