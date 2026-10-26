import JoinCircle from "@/components/JoinCircle";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinCircle code={code} />;
}
