import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; verify?: string; existing?: string }>;
}) {
  const { created, verify, existing } = await searchParams;

  return <LoginClient created={created === '1'} verify={verify === '1'} existing={existing === '1'} />;
}
