import { notFound } from "next/navigation";
import { BACKENDS, isBackend } from "../../../lib/backends";
import { ComparisonSurface } from "../../components/ComparisonSurface";

// One route drives all three direct modes; only the backend param varies.
export function generateStaticParams() {
  return Object.keys(BACKENDS).map((backend) => ({ backend }));
}

export default async function DirectMode({
  params,
}: {
  params: Promise<{ backend: string }>;
}) {
  const { backend } = await params;
  if (!isBackend(backend)) notFound();
  const meta = BACKENDS[backend];
  return (
    <ComparisonSurface
      meta={{
        backend: meta.id,
        label: meta.label,
        blurb: meta.blurb,
        baseUrl: meta.baseUrl,
      }}
    />
  );
}
