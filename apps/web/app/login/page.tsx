import { LoginForm } from './login-form';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <LoginForm redirectTo={searchParams.redirect ?? '/dashboard'} />
    </main>
  );
}
