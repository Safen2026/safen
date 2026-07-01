import { useContext } from 'react';
import { Redirect } from 'expo-router';
import { SessionContext } from '../src/context/SessionContext';

export default function Root() {
  const session = useContext(SessionContext);

  // If logged in, go straight to the app
  if (session) return <Redirect href="/(tabs)" />;

  // Otherwise, go to auth
  return <Redirect href="/auth" />;
}