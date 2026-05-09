export type ControlApiHealth = {
  configured: boolean;
  baseUrl?: string;
};

export function getControlApiHealth(): ControlApiHealth {
  const baseUrl = process.env.NEXT_PUBLIC_AGENTS_CLOUD_API_URL;
  return {
    configured: Boolean(baseUrl),
    baseUrl: baseUrl || undefined
  };
}
