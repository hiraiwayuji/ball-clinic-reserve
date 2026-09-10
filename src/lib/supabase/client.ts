import { createBrowserClient } from '@supabase/ssr'
import { supabaseUrl, supabaseAnonKey } from './env'

export const createClient = () =>
  createBrowserClient(
    supabaseUrl(),
    supabaseAnonKey()
  )
