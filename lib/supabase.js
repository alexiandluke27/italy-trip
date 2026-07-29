import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Lazily create the client so a missing URL/key never throws at import time
// (which would crash `next build` during prerender). Returns null if unconfigured.
let _client = null
function getClient() {
  if (_client) return _client
  if (!supabaseUrl || !supabaseKey) return null
  _client = createClient(supabaseUrl, supabaseKey)
  return _client
}

export const supabase = getClient()

export async function getSharedData(key) {
  const client = getClient()
  if (!client) return null
  const { data, error } = await client
    .from('trip_data')
    .select('data')
    .eq('id', key)
    .single()
  if (error) return null
  return data?.data
}

export async function setSharedData(key, value) {
  const client = getClient()
  if (!client) return false
  const { error } = await client
    .from('trip_data')
    .upsert({ id: key, data: value, updated_at: new Date().toISOString() })
  return !error
}
