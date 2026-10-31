-- ====================================================================
-- PATCH: Fix LEAST/GREATEST syntax error in public.get_or_create_direct_chat
-- Target Function : public.get_or_create_direct_chat(UUID)
-- Root Cause      : In PostgreSQL, LEAST and GREATEST are built-in SQL
--                   language constructs (syntactic expressions), NOT
--                   regular schema-qualified functions in pg_catalog.
--                   Invoking pg_catalog.least(...) throws:
--                   "function pg_catalog.least(text, text) does not exist".
-- Fix             : Use unqualified LEAST(...) and GREATEST(...).
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_recipient_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_user_a    TEXT;
  v_user_b    TEXT;
  v_chat_id   UUID;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Reject chatting with oneself
  IF v_caller_id = p_recipient_id THEN
    RAISE EXCEPTION 'Cannot create direct chat with yourself';
  END IF;

  -- 3. Acquire deterministic transaction-scoped advisory lock
  -- Unqualified LEAST and GREATEST are language constructs in PostgreSQL
  v_user_a := LEAST(v_caller_id::text, p_recipient_id::text);
  v_user_b := GREATEST(v_caller_id::text, p_recipient_id::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('vibe_direct_chat'),
    pg_catalog.hashtext(v_user_a || ':' || v_user_b)
  );

  -- 4. After acquiring the lock, check if direct chat already exists
  SELECT cm1.chat_id INTO v_chat_id
  FROM public.chat_members cm1
  JOIN public.chat_members cm2 ON cm1.chat_id = cm2.chat_id
  JOIN public.chats c ON c.id = cm1.chat_id
  WHERE c.type = 'direct'
    AND cm1.user_id = v_caller_id
    AND cm2.user_id = p_recipient_id
  LIMIT 1;

  -- 5. If found, return existing chat ID
  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- 6. Otherwise, create exactly one direct chat
  INSERT INTO public.chats (
    type,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    'direct',
    v_caller_id,
    now(),
    now()
  )
  RETURNING id INTO v_chat_id;

  -- 7. Add both participants with valid role 'member'
  INSERT INTO public.chat_members (
    chat_id,
    user_id,
    role,
    unread_count
  ) VALUES
    (v_chat_id, v_caller_id, 'member', 0),
    (v_chat_id, p_recipient_id, 'member', 0);

  RETURN v_chat_id;
END;
$$;

-- Preserve strict execute permissions
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_chat(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_chat(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(UUID) TO authenticated;
