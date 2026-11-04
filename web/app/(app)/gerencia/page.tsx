import { Board } from '@/components/Board';
import { api, currentRole, publicApiUrl } from '@/lib/api';

export default async function BoardPage() {
  // lastSeq first: an event committed between the two reads is then caught up, never lost
  const { lastSeq } = await api.lastSeq();
  const orders = await api.orders();
  return (
    <Board orders={orders} lastSeq={lastSeq} apiUrl={publicApiUrl()} role={await currentRole()} />
  );
}
