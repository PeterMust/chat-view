import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roleRow, error: roleError } = await adminClient
      .from('chat_view_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    if (roleError || !roleRow || roleRow.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { email, role: requestedRole } = await req.json()
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const assignedRole = requestedRole === 'admin' ? 'admin' : 'user'

    // Look up a user's UUID directly from Supabase Auth by email (reliable fallback)
    async function lookupUserIdByEmail(targetEmail: string): Promise<string | null> {
      try {
        const res = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?search=${encodeURIComponent(targetEmail)}`,
          { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
        )
        if (!res.ok) return null
        const json = await res.json()
        const found = (json?.users ?? []).find((u: any) => u.email === targetEmail)
        return found?.id ?? null
      } catch { return null }
    }

    // Upsert role row; returns error message or null on success
    async function upsertRole(userId: string): Promise<string | null> {
      const now = new Date().toISOString()
      const { error } = await adminClient
        .from('chat_view_user_roles')
        .upsert(
          { user_id: userId, email, role: assignedRole, updated_at: now },
          { onConflict: 'user_id' }
        )
      if (error) { console.error('Role upsert error:', error); return error.message }
      return null
    }

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)

    if (inviteError) {
      const msg = inviteError.message.toLowerCase()
      const alreadyExists = msg.includes('already') || msg.includes('registered') ||
                            (inviteError as any).status === 422
      if (!alreadyExists) {
        console.error('Invite error:', inviteError)
        return new Response(
          JSON.stringify({ error: inviteError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // User already exists in auth — find their ID via REST API and update role
      const userId = await lookupUserIdByEmail(email)
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'User already exists but could not be found to update role' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const upsertErr = await upsertRole(userId)
      if (upsertErr) {
        return new Response(
          JSON.stringify({ error: 'Role could not be assigned: ' + upsertErr }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.log(`Admin ${user.email} updated role for existing user ${email} to ${assignedRole}`)
      return new Response(
        JSON.stringify({ success: true, invited: email, role: assignedRole, note: 'role updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Invite succeeded — use userId from response, or fall back to REST lookup
    const userId = inviteData?.user?.id ?? await lookupUserIdByEmail(email)
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Invite sent but could not determine user ID to assign role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const upsertErr = await upsertRole(userId)
    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: 'User invited but role could not be assigned: ' + upsertErr }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Admin ${user.email} invited ${email} as ${assignedRole}`)
    return new Response(
      JSON.stringify({ success: true, invited: email, role: assignedRole }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
