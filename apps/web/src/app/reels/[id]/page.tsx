import type { Metadata } from "next";
import { ReelStatus } from "@/components/ReelStatus";

export const metadata: Metadata = { title: "Reel · ReelCraft Studio" };

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReelStatus id={(await params).id} />;
}
