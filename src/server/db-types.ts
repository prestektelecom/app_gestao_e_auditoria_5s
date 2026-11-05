// Tipos das tabelas e funções do banco (gerados a partir do schema original).
// Mantidos como referência de formato das linhas: datas e horários chegam como texto ISO,
// numeric e bigint como number (ver src/server/db.server.ts).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  public: {
    Tables: {
      action_plans: {
        Row: {
          audit_answer_id: string
          audit_id: string
          completed_at: string | null
          created_at: string
          how: string | null
          how_much: number | null
          id: string
          nc_type: string
          occurrence: string | null
          origin_changed: boolean
          origin_note: string | null
          question: string
          sector_id: string
          sector_name: string
          sense: string
          status: string
          unit_id: string
          unit_name: string
          updated_at: string
          what: string | null
          when_date: string | null
          where_text: string | null
          who: string | null
          why: string | null
        }
        Insert: {
          audit_answer_id: string
          audit_id: string
          completed_at?: string | null
          created_at?: string
          how?: string | null
          how_much?: number | null
          id?: string
          nc_type: string
          occurrence?: string | null
          origin_changed?: boolean
          origin_note?: string | null
          question: string
          sector_id: string
          sector_name: string
          sense: string
          status?: string
          unit_id: string
          unit_name: string
          updated_at?: string
          what?: string | null
          when_date?: string | null
          where_text?: string | null
          who?: string | null
          why?: string | null
        }
        Update: {
          audit_answer_id?: string
          audit_id?: string
          completed_at?: string | null
          created_at?: string
          how?: string | null
          how_much?: number | null
          id?: string
          nc_type?: string
          occurrence?: string | null
          origin_changed?: boolean
          origin_note?: string | null
          question?: string
          sector_id?: string
          sector_name?: string
          sense?: string
          status?: string
          unit_id?: string
          unit_name?: string
          updated_at?: string
          what?: string | null
          when_date?: string | null
          where_text?: string | null
          who?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_audit_answer_id_fkey"
            columns: ["audit_answer_id"]
            isOneToOne: false
            referencedRelation: "audit_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_plans_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_answers: {
        Row: {
          answer: string | null
          audit_id: string
          created_at: string
          id: string
          observation: string | null
          order_snapshot: number
          question_id: string
          question_snapshot: string
          score_percentage: number | null
          sense_snapshot: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          audit_id: string
          created_at?: string
          id?: string
          observation?: string | null
          order_snapshot: number
          question_id: string
          question_snapshot: string
          score_percentage?: number | null
          sense_snapshot: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          audit_id?: string
          created_at?: string
          id?: string
          observation?: string | null
          order_snapshot?: number
          question_id?: string
          question_snapshot?: string
          score_percentage?: number | null
          sense_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_answers_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "checklist_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_change_logs: {
        Row: {
          audit_id: string
          changed_at: string
          changed_by: string
          changed_by_name: string | null
          entity: string
          field: string
          id: string
          new_value: string | null
          previous_value: string | null
          reason: string
        }
        Insert: {
          audit_id: string
          changed_at?: string
          changed_by: string
          changed_by_name?: string | null
          entity: string
          field: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          reason: string
        }
        Update: {
          audit_id?: string
          changed_at?: string
          changed_by?: string
          changed_by_name?: string | null
          entity?: string
          field?: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_change_logs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_evidences: {
        Row: {
          audit_answer_id: string
          audit_id: string
          created_at: string
          id: string
          source: string
          storage_path: string
        }
        Insert: {
          audit_answer_id: string
          audit_id: string
          created_at?: string
          id?: string
          source: string
          storage_path: string
        }
        Update: {
          audit_answer_id?: string
          audit_id?: string
          created_at?: string
          id?: string
          source?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_evidences_audit_answer_id_fkey"
            columns: ["audit_answer_id"]
            isOneToOne: false
            referencedRelation: "audit_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_evidences_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      auditors: {
        Row: {
          active: boolean
          admission_date: string | null
          authorized: boolean
          cpf: string
          created_at: string
          custom_pin_hash: string | null
          id: string
          job_title: string | null
          name: string
          sector_id: string
          unit_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          admission_date?: string | null
          authorized?: boolean
          cpf: string
          created_at?: string
          custom_pin_hash?: string | null
          id?: string
          job_title?: string | null
          name: string
          sector_id: string
          unit_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          admission_date?: string | null
          authorized?: boolean
          cpf?: string
          created_at?: string
          custom_pin_hash?: string | null
          id?: string
          job_title?: string | null
          name?: string
          sector_id?: string
          unit_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditors_sector_fk"
            columns: ["sector_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id", "unit_id"]
          },
          {
            foreignKeyName: "auditors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          audit_number: string
          auditor_id: string
          auditor_name_snapshot: string
          checklist_version_id: string
          checklist_version_snapshot: string
          classification: string | null
          companion_name: string
          compliant_count: number
          created_at: string
          finished_at: string | null
          id: string
          latitude: number | null
          location_status: string
          longitude: number | null
          na_count: number
          nc_count: number
          ncp_count: number
          overall_score: number | null
          sector_id: string
          sector_name_snapshot: string
          sense_scores: Json
          session_hash: string | null
          started_at: string
          status: string
          unit_id: string
          unit_name_snapshot: string
          updated_at: string
        }
        Insert: {
          audit_number?: string
          auditor_id: string
          auditor_name_snapshot: string
          checklist_version_id: string
          checklist_version_snapshot: string
          classification?: string | null
          companion_name: string
          compliant_count?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          latitude?: number | null
          location_status: string
          longitude?: number | null
          na_count?: number
          nc_count?: number
          ncp_count?: number
          overall_score?: number | null
          sector_id: string
          sector_name_snapshot: string
          sense_scores?: Json
          session_hash?: string | null
          started_at?: string
          status?: string
          unit_id: string
          unit_name_snapshot: string
          updated_at?: string
        }
        Update: {
          audit_number?: string
          auditor_id?: string
          auditor_name_snapshot?: string
          checklist_version_id?: string
          checklist_version_snapshot?: string
          classification?: string | null
          companion_name?: string
          compliant_count?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          latitude?: number | null
          location_status?: string
          longitude?: number | null
          na_count?: number
          nc_count?: number
          ncp_count?: number
          overall_score?: number | null
          sector_id?: string
          sector_name_snapshot?: string
          sense_scores?: Json
          session_hash?: string | null
          started_at?: string
          status?: string
          unit_id?: string
          unit_name_snapshot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "auditors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_checklist_version_id_fkey"
            columns: ["checklist_version_id"]
            isOneToOne: false
            referencedRelation: "checklist_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_change_requests: {
        Row: {
          author_id: string
          author_name: string | null
          created_at: string
          id: string
          justification: string
          kind: string
          proposal: string
          question_id: string | null
          question_text_snapshot: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          author_id?: string
          author_name?: string | null
          created_at?: string
          id?: string
          justification: string
          kind: string
          proposal: string
          question_id?: string | null
          question_text_snapshot?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          created_at?: string
          id?: string
          justification?: string
          kind?: string
          proposal?: string
          question_id?: string | null
          question_text_snapshot?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_change_requests_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "checklist_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_questions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          position: number
          sense: string
          source_question_id: string | null
          text: string
          updated_at: string
          version_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          position: number
          sense: string
          source_question_id?: string | null
          text: string
          updated_at?: string
          version_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          position?: number
          sense?: string
          source_question_id?: string | null
          text?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_questions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "checklist_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_versions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          status: string
          version_number: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          status?: string
          version_number: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          status?: string
          version_number?: string
        }
        Relationships: []
      }
      maintenance_note_images: {
        Row: {
          created_at: string
          id: string
          note_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          note_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_note_images_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "maintenance_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_notes: {
        Row: {
          assignee_name: string | null
          completed_at: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          note_date: string
          note_number: string
          note_time: string
          priority: string
          requester_name: string
          requester_user_id: string | null
          resolution: string | null
          sector_id: string
          sector_name: string
          source: string
          status: string
          unit_id: string
          unit_name: string
          updated_at: string
        }
        Insert: {
          assignee_name?: string | null
          completed_at?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          note_date?: string
          note_number?: string
          note_time?: string
          priority?: string
          requester_name: string
          requester_user_id?: string | null
          resolution?: string | null
          sector_id: string
          sector_name: string
          source?: string
          status?: string
          unit_id: string
          unit_name: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          note_date?: string
          note_number?: string
          note_time?: string
          priority?: string
          requester_name?: string
          requester_user_id?: string | null
          resolution?: string | null
          sector_id?: string
          sector_name?: string
          source?: string
          status?: string
          unit_id?: string
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_notes_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_notes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_upload_tickets: {
        Row: {
          expires_at: string
          note_id: string
          token_hash: string
        }
        Insert: {
          expires_at: string
          note_id: string
          token_hash: string
        }
        Update: {
          expires_at?: string
          note_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_upload_tickets_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: true
            referencedRelation: "maintenance_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_actions: {
        Row: {
          completed_at: string | null
          created_at: string
          how: string | null
          how_much: number | null
          id: string
          meeting_id: string
          status: string
          topic: string | null
          updated_at: string
          what: string
          when_date: string | null
          where_text: string | null
          who_id: string | null
          who_kind: string | null
          who_name: string | null
          why: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          how?: string | null
          how_much?: number | null
          id?: string
          meeting_id: string
          status?: string
          topic?: string | null
          updated_at?: string
          what: string
          when_date?: string | null
          where_text?: string | null
          who_id?: string | null
          who_kind?: string | null
          who_name?: string | null
          why?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          how?: string | null
          how_much?: number | null
          id?: string
          meeting_id?: string
          status?: string
          topic?: string | null
          updated_at?: string
          what?: string
          when_date?: string | null
          where_text?: string | null
          who_id?: string | null
          who_kind?: string | null
          who_name?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          name: string
          person_id: string | null
          person_kind: string
          present: boolean
          role_in_meeting: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          name: string
          person_id?: string | null
          person_kind: string
          present?: boolean
          role_in_meeting?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          name?: string
          person_id?: string | null
          person_kind?: string
          present?: boolean
          role_in_meeting?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          created_at: string
          created_by: string | null
          discussion: string | null
          end_time: string | null
          facilitator_name: string | null
          id: string
          location: string | null
          meeting_date: string
          meeting_number: string
          meeting_type: string
          next_meeting_date: string | null
          notes: string | null
          objective: string | null
          previous_followup: string | null
          secretary_name: string | null
          start_time: string | null
          status: string
          title: string
          topics: string[]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          discussion?: string | null
          end_time?: string | null
          facilitator_name?: string | null
          id?: string
          location?: string | null
          meeting_date?: string
          meeting_number?: string
          meeting_type?: string
          next_meeting_date?: string | null
          notes?: string | null
          objective?: string | null
          previous_followup?: string | null
          secretary_name?: string | null
          start_time?: string | null
          status?: string
          title: string
          topics?: string[]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          discussion?: string | null
          end_time?: string | null
          facilitator_name?: string | null
          id?: string
          location?: string | null
          meeting_date?: string
          meeting_number?: string
          meeting_type?: string
          next_meeting_date?: string | null
          notes?: string | null
          objective?: string | null
          previous_followup?: string | null
          secretary_name?: string | null
          start_time?: string | null
          status?: string
          title?: string
          topics?: string[]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string
          id: string
          link: string | null
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: string
          link?: string | null
          message: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          system_access: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id: string
          name?: string
          system_access?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          system_access?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      qr_attempts: {
        Row: {
          created_at: string
          id: number
          key: string
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: number
          key: string
          success: boolean
        }
        Update: {
          created_at?: string
          id?: number
          key?: string
          success?: boolean
        }
        Relationships: []
      }
      qr_validation_tickets: {
        Row: {
          auditor_id: string
          created_at: string
          expires_at: string
          sector_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          auditor_id: string
          created_at?: string
          expires_at: string
          sector_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          auditor_id?: string
          created_at?: string
          expires_at?: string
          sector_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_validation_tickets_auditor_id_fkey"
            columns: ["auditor_id"]
            isOneToOne: false
            referencedRelation: "auditors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_validation_tickets_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          qr_token: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          qr_token?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          qr_token?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_answer: {
        Args: {
          _answer: string
          _answer_id: string
          _observation: string
          _reason: string
        }
        Returns: undefined
      }
      auditor_has_pin: { Args: { _auditor_id: string }; Returns: boolean }
      can_manage_maintenance: { Args: { _user_id: string }; Returns: boolean }
      can_manage_meetings: { Args: { _user_id: string }; Returns: boolean }
      create_checklist_draft: {
        Args: { _description: string }
        Returns: string
      }
      current_period_start: { Args: never; Returns: string }
      dashboard_counts: { Args: never; Returns: Json }
      discard_checklist_draft: {
        Args: { _version_id: string }
        Returns: undefined
      }
      has_any_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_valid_cpf: { Args: { _cpf: string }; Returns: boolean }
      latest_completed_audits: {
        Args: never
        Returns: {
          audit_id: string
          audit_number: string
          classification: string
          finished_at: string
          overall_score: number
          sector_id: string
        }[]
      }
      maint_create_note: {
        Args: {
          _date: string
          _description: string
          _requester: string
          _sector_id: string
          _time: string
          _token: string
        }
        Returns: Json
      }
      maint_sector_info: { Args: { _token: string }; Returns: Json }
      meeting_people: {
        Args: never
        Returns: {
          detail: string
          id: string
          kind: string
          name: string
        }[]
      }
      publish_checklist_version: {
        Args: { _version_id: string }
        Returns: undefined
      }
      qr_add_evidence: {
        Args: {
          _answer_id: string
          _audit_id: string
          _path: string
          _session: string
          _source: string
        }
        Returns: Json
      }
      qr_finalize: {
        Args: { _audit_id: string; _session: string }
        Returns: Json
      }
      qr_get_audit: {
        Args: { _audit_id: string; _session: string }
        Returns: Json
      }
      qr_remove_evidence: {
        Args: { _audit_id: string; _evidence_id: string; _session: string }
        Returns: Json
      }
      qr_save_answer: {
        Args: {
          _answer: string
          _answer_id: string
          _audit_id: string
          _observation: string
          _session: string
        }
        Returns: Json
      }
      qr_sector_info: { Args: { _token: string }; Returns: Json }
      qr_session_ok: {
        Args: { _audit_id: string; _session: string }
        Returns: boolean
      }
      qr_start_audit: {
        Args: {
          _companion: string
          _lat: number
          _lng: number
          _location_status: string
          _ticket: string
        }
        Returns: Json
      }
      qr_validate_auditor: {
        Args: { _code: string; _token: string }
        Returns: Json
      }
      recalc_audit: { Args: { _audit_id: string }; Returns: undefined }
      refresh_my_notifications: { Args: never; Returns: number }
      request_ip: { Args: never; Returns: string }
      sectors_pending_audit: {
        Args: never
        Returns: {
          sector_id: string
          sector_name: string
          unit_id: string
          unit_name: string
        }[]
      }
      sense_rank: { Args: { _s: string }; Returns: number }
      set_auditor_pin: {
        Args: { _auditor_id: string; _pin: string }
        Returns: undefined
      }
      sha256_hex: { Args: { _v: string }; Returns: string }
      update_action_plan: {
        Args: {
          _how: string
          _how_much: number
          _id: string
          _status: string
          _what: string
          _when: string
          _where: string
          _who: string
          _why: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "auditor" | "manager" | "director"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Database

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "auditor", "manager", "director"],
    },
  },
} as const

/** Linha de uma tabela de public, ex.: Row<"units">. */
export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type Update<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type FnArgs<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];
export type FnReturns<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Returns"];
