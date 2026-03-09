import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify caller identity via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Service-role client — bypasses RLS for admin checks and invite
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Extract caller's user ID from their JWT using the anon client
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

    // Verify the caller has admin role
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

    // Parse request body
    const { email, role: requestedRole } = await req.json()
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const assignedRole = requestedRole === 'admin' ? 'admin' : 'user'

    // Send invitation via Supabase Admin API
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)

    if (inviteError) {
      // If the user already exists, just update their role instead of failing
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
      // Look up the existing user by email in our roles table and update their role
      const { data: existingRow } = await adminClient
        .from('chat_view_user_roles')
        .select('user_id')
        .eq('email', email)
        .single()
      if (existingRow?.user_id) {
        await adminClient
          .from('chat_view_user_roles')
          .upsert({ user_id: existingRow.user_id, email, role: assignedRole }, { onConflict: 'user_id' })
      }
      console.log(`Admin ${user.email} updated role for existing user ${email} to ${assignedRole}`)
      return new Response(
        JSON.stringify({ success: true, invited: email, role: assignedRole, note: 'role updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert the role now — the invite returns the user ID immediately
    // even before the user accepts the invitation
    if (inviteData?.user?.id) {
      const { error: roleError } = await adminClient
        .from('chat_view_user_roles')
        .upsert(
          { user_id: inviteData.user.id, email, role: assignedRole },
          { onConflict: 'user_id' }
        )
      if (roleError) console.error('Role upsert error:', roleError)
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
