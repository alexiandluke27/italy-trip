import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getSharedData(key) {
  const { data, error } = await supabase
    .from('trip_data')
    .select('data')
    .eq('id', key)
    .single()
  if (error) return null
  return data?.data
}

export async function setSharedData(key, value) {
  const { error } = await supabase
    .from('trip_data')
    .upsert({ id: key, data: value, updated_at: new Date().toISOString() })
  return !error
}
