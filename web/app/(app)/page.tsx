import { Board } from '@/components/Board';
import { api, currentRole, publicApiUrl, sessionToken } from '@/lib/api';

export default async function BoardPage() {
  // lastSeq first: an event committed between the two reads is then caught up, never lost
  const { lastSeq } = await api.lastSeq();
  const orders = await api.orders();
  return (
    <Board
      orders={orders}
      lastSeq={lastSeq}
      token={await sessionToken()}
      apiUrl={publicApiUrl()}
      role={await currentRole()}
    />
  );
}
