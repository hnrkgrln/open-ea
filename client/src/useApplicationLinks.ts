import { useQuery } from '@tanstack/react-query';
import { linkApplicationMentions } from '../../server/src/appLinks.ts';

type NamedRecord = { id?: string; name?: string };

// Same cache entry as the inventory list. Answers are repaired at render time,
// so a chat that already shows an invented /apps/ slug picks up the real id
// without another question.
export function useApplicationLinks() {
  const { data } = useQuery<NamedRecord[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      return res.json();
    },
  });
  if (!Array.isArray(data)) return (text: string) => text;
  const applications = data.flatMap((row) => {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    return id && name ? [{ id, name }] : [];
  });
  return (text: string) => linkApplicationMentions(text, applications);
}
