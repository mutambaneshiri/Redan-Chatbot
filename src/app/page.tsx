import Chat from "@/components/Chat";
import { STATION_DATA_IS_PLACEHOLDER } from "@/lib/stations";

export default function Home() {
  return <Chat usingSeedData={STATION_DATA_IS_PLACEHOLDER} />;
}
