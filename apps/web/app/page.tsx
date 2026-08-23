import { redirect } from 'next/navigation';

export default function Home() {
  // Middleware handles auth; land signed-in users on the dashboard.
  redirect('/dashboard');
}
