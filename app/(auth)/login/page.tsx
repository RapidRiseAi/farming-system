import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; verify?: string }>;
}) {
  const { created, verify } = await searchParams;

  return <LoginClient created={created === '1'} verify={verify === '1'} />;
}
