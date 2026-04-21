import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook para CRUD de chaves de API.
 * O usuário só acessa suas próprias chaves (RLS no Supabase).
 * A criptografia em repouso é aplicada no servidor via pgcrypto.
 */
export function useApiKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, label, broker, key_masked, created_at, updated_at')
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setKeys(data ?? []);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = useCallback(
    async ({ label, broker, key_value, secret_value }) => {
      setError(null);
      const { data, error } = await supabase
        .from('api_keys')
        .insert({ label, broker, key_value, secret_value })
        .select('id, label, broker, key_masked, created_at, updated_at')
        .single();

      if (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }
      setKeys((prev) => [data, ...prev]);
      return { success: true, key: data };
    },
    []
  );

  const updateKey = useCallback(async (id, { label, broker }) => {
    setError(null);
    const { data, error } = await supabase
      .from('api_keys')
      .update({ label, broker })
      .eq('id', id)
      .select('id, label, broker, key_masked, created_at, updated_at')
      .single();

    if (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
    setKeys((prev) => prev.map((k) => (k.id === id ? data : k)));
    return { success: true, key: data };
  }, []);

  const deleteKey = useCallback(async (id) => {
    setError(null);
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
    return { success: true };
  }, []);

  return { keys, loading, error, fetchKeys, createKey, updateKey, deleteKey };
}
