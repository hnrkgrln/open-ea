import { useQuery } from '@tanstack/react-query';

export interface LlmProviderSummary {
  id: string;
  name: string;
  model: string;
  isActive: boolean;
  hasKey: boolean;
}

export function useLlmProviders() {
  return useQuery<LlmProviderSummary[]>({
    queryKey: ['llm-providers'],
    queryFn: async () => {
      const res = await fetch('/api/llm/providers');
      if (!res.ok) throw new Error('The provider list could not be loaded.');
      return res.json();
    },
  });
}

export function activeLlmProvider(providers: LlmProviderSummary[] | undefined) {
  return providers?.find((provider) => provider.isActive && provider.hasKey);
}
