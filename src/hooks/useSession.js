import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SESSION_STATUS } from '../lib/sessions';
import { appendAuditEvent, AUDIT_EVENT_TYPE } from '../lib/auditLog';

export function useSession() {
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadActiveSession();
  }, []);

  async function loadActiveSession() {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', SESSION_STATUS.ACTIVE)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    // PGRST116 = no rows found; not a real error
    if (fetchError && fetchError.code !== 'PGRST116') {
      setError(fetchError.message);
    } else {
      setActiveSession(data ?? null);
    }
    setLoading(false);
  }

  const startSession = useCallback(async ({ mode, goal_type, goal_profit, goal_loss }) => {
    setError(null);
    setLoading(true);
    const { data, error: insertError } = await supabase
      .from('sessions')
      .insert([
        {
          mode,
          goal_type,
          goal_profit: Number(goal_profit),
          goal_loss: Number(goal_loss),
          status: SESSION_STATUS.ACTIVE,
        },
      ])
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return { success: false, error: insertError.message };
    }
    setActiveSession(data);
    // Audit: sessão iniciada
    appendAuditEvent(supabase, {
      event_type: AUDIT_EVENT_TYPE.SESSION_STARTED,
      user_id: data.user_id ?? 'unknown',
      session_id: data.id,
      entity_id: data.id,
      entity_type: 'session',
      payload: { mode, goal_type, goal_profit: Number(goal_profit), goal_loss: Number(goal_loss) },
    }).catch(() => { /* audit failure não bloqueia o fluxo */ });
    return { success: true, session: data };
  }, []);

  const stopSession = useCallback(async () => {
    if (!activeSession) return { success: false, error: 'Nenhuma sessão ativa.' };
    setError(null);
    setLoading(true);
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ status: SESSION_STATUS.STOPPED, stopped_at: new Date().toISOString() })
      .eq('id', activeSession.id);

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return { success: false, error: updateError.message };
    }
    // Audit: sessão encerrada
    appendAuditEvent(supabase, {
      event_type: AUDIT_EVENT_TYPE.SESSION_STOPPED,
      user_id: activeSession.user_id ?? 'unknown',
      session_id: activeSession.id,
      entity_id: activeSession.id,
      entity_type: 'session',
      payload: { stopped_at: new Date().toISOString() },
    }).catch(() => { /* audit failure não bloqueia o fluxo */ });
    setActiveSession(null);
    return { success: true };
  }, [activeSession]);

  return { activeSession, loading, error, startSession, stopSession };
}
