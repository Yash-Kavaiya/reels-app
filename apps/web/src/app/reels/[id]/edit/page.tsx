import type { Metadata } from "next";
import { Editor } from "@/components/Editor";

export const metadata: Metadata = { title: "Edit · ReelCraft Studio" };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  return <Editor id={(await params).id} />;
}
