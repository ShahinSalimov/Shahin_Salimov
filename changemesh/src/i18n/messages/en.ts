/** Source of truth for UI copy. Other locales must provide exactly the same keys (enforced by TypeScript). */
export const en = {
  common: {
    appName: "CHANGEMESH",
    tagline: "Every change. Every connection. One control center.",
    signIn: "Sign in",
    signUp: "Create account",
    signOut: "Sign out",
    tryDemo: "Explore the demo",
    exitDemo: "Exit demo",
    email: "Email",
    password: "Password",
    fullName: "Full name",
    continue: "Continue",
    or: "or",
  },
  demo: {
    banner: "Demo mode — fictional sample data. Nothing you do here is saved or sent anywhere.",
    createAccount: "Create a real account",
  },
  auth: {
    signInTitle: "Sign in to CHANGEMESH",
    signInSubtitle: "Welcome back. Enter your credentials to continue.",
    signUpTitle: "Create your account",
    signUpSubtitle: "Start mapping how your business information is connected.",
    noAccount: "Don't have an account?",
    haveAccount: "Already have an account?",
    google: "Continue with Google",
    passwordHint: "At least 10 characters, with letters and numbers.",
    notConfiguredTitle: "Authentication is not configured",
    notConfiguredBody: "Set the Supabase environment variables to enable sign-in. See ENVIRONMENT.md.",
  },
  onboarding: {
    title: "Set up your organization",
    subtitle: "An organization holds billing and people. Workspaces hold assets — create one per brand, client or location group.",
    organizationName: "Organization name",
    workspaceName: "First workspace name",
    submit: "Create workspace",
  },
  workspace: {
    overview: "Overview",
    members: "Members",
    yourRole: "Your role",
    foundationNotice: "Foundation stage: assets, graph, changes and approvals arrive in the next stages.",
  },
  roles: { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" },
};

type DeepStringRecord<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]> };
export type Messages = DeepStringRecord<typeof en>;
