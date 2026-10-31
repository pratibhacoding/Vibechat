-- ====================================================================
-- VibeChat: One-to-One Voice & Video Calling Call Records Table
-- Safe, additive migration preserving all existing schemas & policies
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.call_records (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
  status TEXT NOT NULL CHECK (status IN ('calling', 'ringing', 'accepted', 'rejected', 'missed', 'busy', 'ended', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_records_caller ON public.call_records(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_records_receiver ON public.call_records(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_records_chat ON public.call_records(chat_id);
CREATE INDEX IF NOT EXISTS idx_call_records_created ON public.call_records(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_records' AND policyname = 'Users can view their own call records'
  ) THEN
    CREATE POLICY "Users can view their own call records"
      ON public.call_records
      FOR SELECT
      TO authenticated
      USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_records' AND policyname = 'Users can initiate call records'
  ) THEN
    CREATE POLICY "Users can initiate call records"
      ON public.call_records
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = caller_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_records' AND policyname = 'Participants can update call records'
  ) THEN
    CREATE POLICY "Participants can update call records"
      ON public.call_records
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = caller_id OR auth.uid() = receiver_id)
      WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id);
  END IF;
END $$;
