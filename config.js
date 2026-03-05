// Chat View Configuration
// config.js is gitignored and should never be committed.
//
// Multi-environment format: define an "environments" array to enable the
// environment selector dropdown on the login screen.
window.CHAT_VIEW_CONFIG = {
  environments: [
    {
      // Display name shown in the dropdown
      name: 'Production',
      // Supabase project subdomain (e.g. 'abcdefghij' from abcdefghij.supabase.co)
      projectId: 'mzxwumuslpaxswuztuak',
      // Supabase project's anon/public key
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eHd1bXVzbHBheHN3dXp0dWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODAzMTgsImV4cCI6MjA2MTE1NjMxOH0.Bink_MhmPnpp_pIZ3MEgZv3LAwbFu2WvIcqIaISFtbU',
      // Restrict sign-in to specific email domains. Leave empty to allow all.
      allowedDomains: [],
    },
    {
      name: 'Development',
      // Replace with your dev Supabase project subdomain
      projectId: 'your-dev-project-id',
      // Replace with your dev Supabase anon key
      anonKey: 'your-dev-anon-key',
      allowedDomains: [],
    },
  ],
};
